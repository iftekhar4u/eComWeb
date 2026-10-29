import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'
import request from 'supertest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { healthRoutes } from '../health.js'
import { configureHttpServer, installShutdown } from '../lifecycle.js'
import { createReadyApp } from '../../admin-ready/app.js'
import { getConfig } from '../../config/env.js'
import { errorHandler } from '../../middleware/errorMiddleware.js'
import { publicProducts } from '../../services/catalog.js'
import { ProductVariant } from '../../models/domainModels.js'

test('health is independent of sessions and readiness tracks database failure, recovery and shutdown', async () => {
  let now = 1, calls = 0, fail = false
  const connection = { readyState: 1, db: { admin: () => ({ command: async () => { calls++; if (fail) throw new Error('private-database-password') } }) } }
  const app = express(); healthRoutes(app, { connection, now: () => now }); app.use(() => { throw new Error('Sessions must not run') })
  assert.equal((await request(app).get('/healthz')).status, 200)
  assert.equal((await request(app).get('/readyz')).status, 200)
  await request(app).get('/readyz'); assert.equal(calls, 1)
  fail = true; now += 2100
  const response = await request(app).get('/readyz'); assert.equal(response.status, 503); assert.deepEqual(response.body, { status: 'unavailable' })
  fail = false; now += 2100; assert.equal((await request(app).get('/readyz')).status, 200)
  app.locals.shuttingDown = true; assert.equal((await request(app).get('/readyz')).status, 503)
  app.locals.shuttingDown = false; connection.readyState = 0; assert.equal((await request(app).get('/readyz')).status, 503)
})
test('parallel readiness requests coalesce their database ping', async () => {
  let calls = 0; const app = express()
  healthRoutes(app, { connection: { readyState: 1, db: { admin: () => ({ command: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 25)) } }) } } })
  const results = await Promise.all(Array.from({ length: 12 }, () => request(app).get('/readyz')))
  assert.ok(results.every(response => response.status === 200)); assert.equal(calls, 1)
})
test('assets have immutable caching and compression without sessions or API quotas', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'aurelia-assets-')), store = new session.MemoryStore()
  store.get = () => { throw new Error('Static assets must not read sessions') }
  try {
    await mkdir(path.join(directory, 'assets')); await writeFile(path.join(directory, 'assets/app-1234.js'), '// asset\n'.repeat(500))
    const app = createReadyApp({ config: { NODE_ENV: 'production', TRUST_PROXY: 0, CLIENT_URL: 'https://shop.example', SESSION_SECRET: 'fixture-session-secret-long-enough' }, store, staticDirectory: directory })
    const response = await request(app).get('/assets/app-1234.js').set('Accept-Encoding', 'gzip')
    assert.equal(response.status, 200); assert.match(response.headers['cache-control'], /max-age=31536000.*immutable/)
    assert.equal(response.headers['content-encoding'], 'gzip'); assert.equal(response.headers['set-cookie'], undefined); assert.equal(response.headers.ratelimit, undefined)
    assert.equal(response.headers['x-content-type-options'], 'nosniff'); assert.match(response.headers['x-request-id'], /^[a-f0-9-]{36}$/)
    assert.equal((await request(app).get('/assets/missing.js')).status, 404)
    const api = await request(app).get('/api/health'); assert.equal(api.headers['cache-control'], 'no-store'); assert.match(api.headers.ratelimit, /; r=199;/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
const production = { NODE_ENV: 'production', CLIENT_URL: 'https://shop.example', MONGO_URI: 'mongodb://localhost/aurelia', SESSION_SECRET: 's'.repeat(48), MFA_ENCRYPTION_KEY: 'm'.repeat(48), INTEGRATIONS_DIRECTORY: '/private-fixture' }
test('production config rejects HTTP, absent persistent storage and placeholder secrets', () => {
  assert.equal(getConfig(production).NODE_ENV, 'production')
  assert.throws(() => getConfig({ ...production, CLIENT_URL: 'http://shop.example' }), /HTTPS/)
  assert.throws(() => getConfig({ ...production, CLIENT_URL: 'https://shop.example/path' }), /origin/)
  assert.throws(() => getConfig({ ...production, INTEGRATIONS_DIRECTORY: '' }), /persistent/)
  assert.throws(() => getConfig({ ...production, SESSION_SECRET: 'replace-with-original-secret-at-least-32-characters' }), /example/)
  assert.throws(() => getConfig({ ...production, MONGO_URI: 'https://wrong.example' }), /MongoDB/)
})
test('existing email encryption fallback is preserved', () => {
  const config = getConfig(production); assert.equal(config.EMAIL_ENCRYPTION_KEY, undefined); assert.equal(config.SESSION_SECRET, production.SESSION_SECRET)
})
test('production 5xx logs and responses do not reveal provider credentials', () => {
  const logs = [], original = console.error; let status, body; console.error = value => logs.push(value)
  try {
    errorHandler(Object.assign(new Error('mongodb://user:private-password@private-host/db'), { status: 503 }), { requestId: 'fixture-id', app: { locals: { config: { NODE_ENV: 'production' } } } }, { status(value) { status = value; return this }, json(value) { body = value } }, () => {})
    assert.equal(status, 503); assert.match(logs[0], /fixture-id/); assert.doesNotMatch(JSON.stringify({ logs, body }), /private-password|private-host|mongodb/)
  } finally { console.error = original }
})
test('shutdown drains HTTP and workers before sessions and database', async () => {
  const beforeTerm = process.listeners('SIGTERM'), beforeInt = process.listeners('SIGINT'), events = [], app = express()
  app.locals.sessionStore = { close: async () => events.push('sessions') }
  app.get('/slow', async (_req, res) => { events.push('request'); await new Promise(resolve => setTimeout(resolve, 30)); events.push('response'); res.end('done') })
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); configureHttpServer(server); assert.equal(server.requestTimeout, 60000)
  const shutdown = installShutdown({ server, app, stopWorkers: [async () => { await new Promise(resolve => setTimeout(resolve, 20)); events.push('worker') }], disconnect: async () => events.push('database') })
  try {
    const response = request(server).get('/slow').then(result => assert.equal(result.text, 'done'))
    while (!events.includes('request')) await new Promise(resolve => setTimeout(resolve, 2))
    const first = shutdown(); assert.equal(shutdown(), first); assert.equal(app.locals.shuttingDown, true); await Promise.all([first, response])
    assert.ok(events.indexOf('sessions') > events.indexOf('response')); assert.ok(events.indexOf('sessions') > events.indexOf('worker')); assert.equal(events.at(-1), 'database')
  } finally {
    for (const fn of process.listeners('SIGTERM')) if (!beforeTerm.includes(fn)) process.removeListener('SIGTERM', fn)
    for (const fn of process.listeners('SIGINT')) if (!beforeInt.includes(fn)) process.removeListener('SIGINT', fn)
  }
})
test('catalog grouping preserves variant order, stock reservations and missing variants', async () => {
  const original = ProductVariant.find; let reads = 0
  ProductVariant.find = () => { reads++; return { sort: () => ({ lean: async () => [ { _id: 'v1', product: 'a', price: 100, stockOnHand: 8, reservedQuantity: 3 }, { _id: 'v2', product: 'b', price: 200, stockOnHand: 2, reservedQuantity: 2 }, { _id: 'v3', product: 'a', price: 300, stockOnHand: 4, reservedQuantity: 1 } ] }) } }
  try {
    assert.deepEqual(await publicProducts([]), []); assert.equal(reads, 0)
    const result = await publicProducts([{ _id: 'b' }, { _id: 'a' }, { _id: 'c', price: 400, discountPrice: 350 }])
    assert.equal(result[0].stock, 0); assert.equal(result[1].stock, 5); assert.deepEqual(result[1].variants.map(item => item.id), ['v1', 'v3'])
    assert.equal(result[2].variantId, null); assert.equal(result[2].price, 350); assert.equal(result[2].compareAtPrice, 400)
  } finally { ProductVariant.find = original }
})
