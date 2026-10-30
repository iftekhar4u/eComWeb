import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import session from 'express-session'
import request from 'supertest'
import mongoose from 'mongoose'
import argon2 from 'argon2'
import User from '../../models/User.js'
import { requireCsrf } from '../../middleware/csrfMiddleware.js'
import { errorHandler } from '../../middleware/errorMiddleware.js'
import { createIntegrationStore, adminSettings, publicWhatsApp, defaultSettings, resolveCloudinary } from '../../integrations/store.js'
import { resolveDatabaseConfig, validateAtlasUri, testAtlas } from '../../integrations/atlas.js'
import { testcloudinary, uploadImage, MAX_IMAGE_BYTES } from '../../integrations/cloudinary.js'
import { integrationRoutes, publicIntegrationRoutes } from '../../integrations/routes.js'
import { copyDatabase, migrationPlan } from '../../integrations/migrate.js'

const directory = await mkdtemp(path.join(tmpdir(), 'aurelia-integrations-'))
const key = 'isolated-integration-key-not-a-real-secret-123456'
const uri = 'mongodb+srv://demo:encoded%40password@cluster0.example.mongodb.net/aurelia?retryWrites=true&w=majority'
const config = { NODE_ENV: 'test', MFA_ENCRYPTION_KEY: key, MONGO_URI: 'mongodb://127.0.0.1:27017/source', CLOUDINARY_CLOUD_NAME: 'sample-cloud', CLOUDINARY_API_KEY: 'private-api-key', CLOUDINARY_API_SECRET: 'private-api-secret', CLOUDINARY_FOLDER: 'aurelia/products' }
const makeStore = name => createIntegrationStore({ ...config, INTEGRATIONS_DIRECTORY: path.join(directory, name) })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qz8AAAAASUVORK5CYII=', 'base64')
const cloud = { enabled: true, cloudName: 'sample-cloud', apiKey: 'private-api-key', apiSecret: 'private-api-secret', folder: 'aurelia/products' }

test('vault encrypts credentials, preserves other sections, persists across instances, and rejects stale writers', async () => {
  const store = makeStore('vault')
  const initial = await store.read()
  assert.deepEqual(initial, defaultSettings())
  await store.update(0, 'admin', 'test', value => ({ ...value, cloudinary: cloud, mongodb: { uri, activeUri: '' } }))
  const raw = await readFile(path.join(directory, 'vault/integrations.enc'), 'utf8')
  for (const secret of [cloud.apiKey, cloud.apiSecret, uri]) assert.ok(!raw.includes(secret))
  assert.equal((await makeStore('vault').read()).mongodb.uri, uri)
  await assert.rejects(store.update(0, 'admin', 'stale', value => value), { status: 409 })
  const safe = adminSettings(await store.read(), config)
  assert.equal(safe.cloudinary.apiSecretSaved, true)
  assert.ok(!JSON.stringify(safe).includes(cloud.apiSecret))
  assert.ok(!JSON.stringify(safe).includes(uri))
  const wrongKey = createIntegrationStore({ MFA_ENCRYPTION_KEY: 'different-key-must-never-overwrite-123456789', INTEGRATIONS_DIRECTORY: path.join(directory, 'vault') })
  await assert.rejects(wrongKey.read(), { status: 503 })
  await assert.rejects(wrongKey.update(1, 'admin', 'bad', value => value), { status: 503 })
  assert.equal(await readFile(path.join(directory, 'vault/integrations.enc'), 'utf8'), raw)
  const tampered = JSON.parse(raw); tampered.tag = Buffer.alloc(16).toString('base64')
  await writeFile(path.join(directory, 'vault/integrations.enc'), JSON.stringify(tampered))
  await assert.rejects(store.read(), { status: 503 })
})

test('Cloudinary environment credentials provide private upload defaults until Admin settings are saved', () => {
  const environment = { CLOUDINARY_CLOUD_NAME: 'env-cloud', CLOUDINARY_API_KEY: 'env-key', CLOUDINARY_API_SECRET: 'env-secret', CLOUDINARY_FOLDER: 'aurelia/catalog' }
  const current = defaultSettings()
  assert.deepEqual(resolveCloudinary(current, environment), { enabled: true, cloudName: 'env-cloud', apiKey: 'env-key', apiSecret: 'env-secret', folder: 'aurelia/catalog' })
  const safe = adminSettings(current, { ...config, ...environment })
  assert.deepEqual(safe.cloudinary, { enabled: true, cloudName: 'env-cloud', folder: 'aurelia/catalog', source: 'environment', apiKeySaved: true, apiSecretSaved: true })
  assert.ok(!JSON.stringify(safe).includes(environment.CLOUDINARY_API_SECRET))
  current.cloudinary = { ...cloud, enabled: false }
  assert.deepEqual(resolveCloudinary(current, environment), current.cloudinary)
})

test('public configuration contains only enabled WhatsApp fields and validates numbers', () => {
  const data = { ...defaultSettings(), cloudinary: cloud, mongodb: { uri, activeUri: uri } }
  assert.deepEqual(publicWhatsApp(data), { enabled: false })
  data.whatsapp = { enabled: true, phone: '919876543210', message: 'Hello & help?', label: 'Chat', includePage: true }
  assert.deepEqual(Object.keys(publicWhatsApp(data)).sort(), ['enabled', 'includePage', 'label', 'message', 'phone'])
  data.whatsapp.phone = 'javascript:bad'; assert.deepEqual(publicWhatsApp(data), { enabled: false })
})

test('Atlas validates host/TLS/database and only applies the selected URI after restart', async () => {
  assert.equal(validateAtlasUri(uri), uri)
  for (const bad of [uri.replace('mongodb+srv:', 'mongodb:'), uri.replace('.mongodb.net', '.evil.test'), uri.replace('/aurelia?', '/admin?'), uri.replace('/aurelia?', '/?'), uri + '&tls=false', uri + '&tlsInsecure=true', uri + '&retryWrites=false', uri.replace('encoded%40password', '<password>')]) assert.throws(() => validateAtlasUri(bad), { status: 400 })
  const store = makeStore('atlas')
  await store.update(0, 'admin', 'stage', s => ({ ...s, mongodb: { uri, activeUri: '' } }))
  let runtime = await resolveDatabaseConfig({ ...config, NODE_ENV: 'development' }, store)
  assert.equal(runtime.MONGO_URI, config.MONGO_URI)
  await store.update(1, 'admin', 'select', s => ({ ...s, mongodb: { uri, activeUri: uri } }))
  assert.equal(adminSettings(await store.read(), runtime).mongodb.restartRequired, true)
  runtime = await resolveDatabaseConfig({ ...config, NODE_ENV: 'development' }, store)
  assert.equal(runtime.MONGO_URI, uri)
  assert.equal(adminSettings(await store.read(), runtime).mongodb.restartRequired, false)
  assert.equal((await resolveDatabaseConfig(config, store)).MONGO_URI, config.MONGO_URI)
  assert.equal((await resolveDatabaseConfig({ ...config, NODE_ENV: 'production', INTEGRATIONS_IGNORE_DATABASE: true }, store)).MONGO_URI, config.MONGO_URI)
})

test('Atlas probing closes connections, redacts driver failures, and checks the migrated admin', async () => {
  let closed = 0, target = null
  const account = { _id: new mongoose.Types.ObjectId(), password: 'hash', sessionVersion: 0, mfa: { enabled: true, secretEncrypted: 'cipher' } }
  class Client {
    async connect() { }
    db() { return { command: async () => ({}), admin: () => ({ command: async () => ({ setName: 'atlas' }) }), listCollections: () => ({ toArray: async () => [] }), collection: () => ({ findOne: async () => target }) } }
    async close() { closed++ }
  }
  await testAtlas(uri, undefined, Client)
  await assert.rejects(testAtlas(uri, account, Client), { status: 409 })
  target = account
  await testAtlas(uri, account, Client)
  class BadClient extends Client { async connect() { throw new Error(uri) } }
  await assert.rejects(testAtlas(uri, undefined, BadClient), error => error.status === 400 && !error.message.includes(uri))
  assert.equal(closed, 4)
})

test('cloudinary signs only on the server, validates images, and sanitizes provider failures', async () => {
  let calls = 0
  const fetcher = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.cloudinary.com/v1_1/sample-cloud/image/upload')
    const body = options.body, params = Object.fromEntries([...body.entries()].filter(([key]) => !['file', 'signature', 'api_key'].includes(key)))
    const expected = crypto.createHash('sha256').update(Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + cloud.apiSecret).digest('hex')
    assert.equal(body.get('signature'), expected)
    assert.equal(body.get('overwrite'), 'false')
    assert.equal(body.get('api_secret'), null)
    assert.equal(body.get('file').type, 'image/png')
    assert.equal(options.redirect, 'error')
    return { ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/sample-cloud/image/upload/v1/aurelia/test.png', public_id: 'aurelia/test', width: 1, height: 1 }) }
  }
  assert.match((await uploadImage(cloud, { buffer: png, mimetype: 'image/png' }, fetcher)).url, /^https:/)
  await assert.rejects(uploadImage(cloud, { buffer: Buffer.from('<svg/>'), mimetype: 'image/png' }, fetcher), { status: 400 })
  await assert.rejects(uploadImage(cloud, { buffer: png, mimetype: 'image/jpeg' }, fetcher), { status: 400 })
  await assert.rejects(uploadImage(cloud, { buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1), mimetype: 'image/png' }, fetcher), { status: 413 })
  assert.equal(calls, 1)
  await assert.rejects(testcloudinary(cloud, async () => { throw new Error(cloud.apiSecret) }), e => e.status === 502 && !e.message.includes(cloud.apiSecret))
  await testcloudinary(cloud, async (url, options) => {
    assert.equal(url, 'https://api.cloudinary.com/v1_1/sample-cloud/ping')
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from(cloud.apiKey + ':' + cloud.apiSecret).toString('base64')}`)
    return { ok: true, json: async () => ({ status: 'ok' }) }
  })
})

const password = 'IsolatedAdminPassword!123'
const account = { _id: new mongoose.Types.ObjectId(), name: 'Test admin', email: 'admin@example.test', role: 'admin', status: 'active', sessionVersion: 0, password: await argon2.hash(password), mfa: { enabled: true, secretEncrypted: 'test-cipher' } }
const originalFind = User.collection.findOne
let role = 'admin'
User.collection.findOne = async () => ({ ...account, role })
const routeStore = makeStore('routes')
let cloudChecks = 0, atlasChecks = 0, imageUploads = 0, databaseChecks = 0, lastUploadSettings
const runtimeSummary = { connected: true, atlas: true, host: 'cluster0.example.mongodb.net', database: 'aurelia_dev', productCount: 16, latestProduct: { id: '507f1f77bcf86cd799439011', slug: 'atlas-check-product' } }
const app = express()
app.locals.config = config
app.use(express.json())
app.use(session({ secret: 'isolated-test-session-secret-for-tests-only', resave: false, saveUninitialized: false }))
app.post('/test-session', (req, res) => { req.session.userId = String(account._id); req.session.sessionVersion = 0; req.session.mfaVerified = req.body.verified !== false; req.session.csrfToken = 'test-csrf'; res.json({}) })
app.use('/public', publicIntegrationRoutes(routeStore))
app.use('/integrations', requireCsrf, integrationRoutes({ store: routeStore, config, databaseStatus: async currentConfig => { databaseChecks++; assert.equal(currentConfig, config); return runtimeSummary }, cloudTest: async () => { cloudChecks++ }, atlasTest: async (_uri, admin) => { atlasChecks++; if (admin) assert.equal(String(admin._id), String(account._id)) }, imageUpload: async (settings, file) => { imageUploads++; lastUploadSettings = settings; assert.deepEqual(file.buffer, png); return { url: 'https://res.cloudinary.com/sample/image/upload/test.png' } } }))
app.use(errorHandler)
const server = app.listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))

test('integration endpoints enforce authentication, role, MFA, CSRF, password, and revision', async () => {
  const anonymous = request.agent(server)
  assert.equal((await anonymous.get('/integrations')).status, 401)
  assert.deepEqual((await anonymous.get('/public/whatsapp')).body, { enabled: false })
  const agent = request.agent(server)
  await agent.post('/test-session').send({ verified: false })
  assert.equal((await agent.get('/integrations')).status, 403)
  await agent.post('/test-session').send({})
  role = 'customer'; assert.equal((await agent.get('/integrations')).status, 403); role = 'admin'
  const configured = await agent.get('/integrations')
  assert.deepEqual(configured.body.cloudinary, { enabled: true, cloudName: 'sample-cloud', folder: 'aurelia/products', source: 'environment', apiKeySaved: true, apiSecretSaved: true })
  const environmentUpload = await agent.post('/integrations/cloudinary/upload').set('x-csrf-token', 'test-csrf').attach('image', png, 'sample.png')
  assert.equal(environmentUpload.status, 201)
  assert.deepEqual(lastUploadSettings, { enabled: true, cloudName: 'sample-cloud', apiKey: 'private-api-key', apiSecret: 'private-api-secret', folder: 'aurelia/products' })
  assert.equal(imageUploads, 1)
  const form = { revision: 0, ...cloud, currentPassword: password }
  assert.equal((await agent.put('/integrations/cloudinary').send(form)).status, 403)
  assert.equal((await agent.put('/integrations/cloudinary').set('x-csrf-token', 'test-csrf').send({ ...form, currentPassword: 'wrong' })).status, 403)
  assert.equal(cloudChecks, 0)
  const saved = await agent.put('/integrations/cloudinary').set('x-csrf-token', 'test-csrf').send(form)
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.ok(!JSON.stringify(saved.body).includes(cloud.apiSecret))
  assert.equal(saved.body.settings.revision, 1)
  assert.equal((await agent.put('/integrations/cloudinary').set('x-csrf-token', 'test-csrf').send(form)).status, 409)
  const retained = await agent.put('/integrations/cloudinary').set('x-csrf-token', 'test-csrf').send({ ...form, revision: 1, apiKey: '', apiSecret: '' })
  assert.equal(retained.status, 200)
  assert.equal((await routeStore.read()).cloudinary.apiSecret, cloud.apiSecret)
  const phone = await agent.put('/integrations/whatsapp').set('x-csrf-token', 'test-csrf').send({ ...defaultSettings().whatsapp, revision: 2, enabled: true, phone: '+91 98765 43210' })
  assert.equal(phone.status, 200)
  assert.equal((await agent.get('/public/whatsapp')).body.phone, '919876543210')
  const stage = await agent.put('/integrations/mongodb').set('x-csrf-token', 'test-csrf').send({ revision: 3, currentPassword: password, uri })
  assert.equal(stage.status, 200)
  assert.equal((await routeStore.read()).mongodb.activeUri, '')
  assert.equal((await agent.post('/integrations/mongodb/activate').set('x-csrf-token', 'test-csrf').send({ revision: 4, currentPassword: password, confirmMigration: false })).status, 400)
  const selected = await agent.post('/integrations/mongodb/activate').set('x-csrf-token', 'test-csrf').send({ revision: 4, currentPassword: password, confirmMigration: true })
  assert.equal(selected.status, 200)
  assert.equal(selected.body.settings.mongodb.restartRequired, true)
  assert.equal(atlasChecks, 2)
  assert.equal(config.MONGO_URI, 'mongodb://127.0.0.1:27017/source')
})

test('database status requires a verified administrator and returns an uncached read without changing settings', async () => {
  const agent = request.agent(server)
  const before = await routeStore.read()
  assert.equal((await agent.get('/integrations/mongodb/status')).status, 401)
  await agent.post('/test-session').send({ verified: false })
  assert.equal((await agent.get('/integrations/mongodb/status')).status, 403)
  await agent.post('/test-session').send({})
  role = 'customer'
  assert.equal((await agent.get('/integrations/mongodb/status')).status, 403)
  role = 'admin'
  assert.equal(databaseChecks, 0)
  const response = await agent.get('/integrations/mongodb/status')
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(response.body, runtimeSummary)
  assert.equal(databaseChecks, 1)
  assert.deepEqual(await routeStore.read(), before)
})

test('multipart uploads require admin/CSRF and reject oversized and non-image uploads before provider calls', async () => {
  const agent = request.agent(server)
  assert.equal((await agent.post('/integrations/cloudinary/upload').attach('image', png, 'sample.png')).status, 403)
  await agent.post('/test-session').send({})
  const response = await agent.post('/integrations/cloudinary/upload').set('x-csrf-token', 'test-csrf').attach('image', png, { filename: 'sample.png', contentType: 'image/png' })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  assert.equal(imageUploads, 2)
  assert.equal((await agent.post('/integrations/cloudinary/upload').set('x-csrf-token', 'test-csrf').attach('image', Buffer.from('<svg/>'), { filename: 'bad.svg', contentType: 'image/svg+xml' })).status, 400)
  assert.equal((await agent.post('/integrations/cloudinary/upload').set('x-csrf-token', 'test-csrf').attach('image', Buffer.alloc(MAX_IMAGE_BYTES + 1), { filename: 'large.png', contentType: 'image/png' })).status, 413)
  assert.equal(imageUploads, 2)
})

function fakeDb(seed = {}) {
  const records = new Map(Object.entries(seed)), metadata = new Map(), indexes = new Map()
  const collection = name => ({
    countDocuments: async () => (records.get(name) || []).length,
    find: () => ({ sort: () => ({ async *[Symbol.asyncIterator]() { for (const doc of records.get(name) || []) yield doc } }) }),
    listIndexes: () => ({ toArray: async () => indexes.get(name) || [{ name: '_id_', key: { _id: 1 } }, { v: 2, name: 'email_1', key: { email: 1 }, unique: true }] }),
    insertMany: async docs => records.get(name).push(...docs),
    createIndexes: async values => indexes.set(name, values),
  })
  return { records, metadata, indexes, collection, listCollections: () => ({ toArray: async () => [...records.keys()].map(name => ({ name, type: 'collection', options: metadata.get(name) || {} })) }), createCollection: async (name, options) => { records.set(name, []); metadata.set(name, options); return collection(name) } }
}

test('migration requires an empty target and explicit pause; preserves BSON, indexes, validators, and source', async () => {
  const doc = { _id: new mongoose.Types.ObjectId(), email: 'test@example.test', created: new Date('2026-01-01'), amount: mongoose.mongo.Decimal128.fromString('10.25') }
  const source = fakeDb({ users: [doc], sessions: [{ _id: 'private-session' }] }), target = fakeDb()
  source.metadata.set('users', { validator: { email: { $type: 'string' } }, validationLevel: 'strict' })
  assert.equal((await migrationPlan(source, target)).length, 1)
  await assert.rejects(copyDatabase(source, target), { status: 409 })
  assert.equal(target.records.size, 0)
  await assert.rejects(copyDatabase(source, fakeDb({ existing: [] }), { confirmed: true, sourcePaused: true }), { status: 409 })
  const before = mongoose.mongo.BSON.serialize(doc)
  const result = await copyDatabase(source, target, { confirmed: true, sourcePaused: true })
  assert.deepEqual(result, [{ name: 'users', documents: 1, verified: true }])
  assert.deepEqual(mongoose.mongo.BSON.serialize(target.records.get('users')[0]), before)
  assert.deepEqual(mongoose.mongo.BSON.serialize(source.records.get('users')[0]), before)
  assert.equal(target.records.has('sessions'), false)
  assert.deepEqual(target.metadata.get('users'), source.metadata.get('users'))
  assert.equal(target.indexes.get('users')[0].unique, true)
})

test.after(async () => { User.collection.findOne = originalFind; await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
