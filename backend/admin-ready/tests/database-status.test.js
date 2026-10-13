import test from 'node:test'
import assert from 'node:assert/strict'
import { databaseTarget, databaseFailureMessage, connectedDatabaseTarget, readDatabaseStatus } from '../../integrations/database-status.js'

const uri = 'mongodb+srv://private-user:private-password@cluster0.example.mongodb.net/aurelia_dev?authSource=admin'

test('database diagnostics expose only host/name and never echo invalid URIs or driver messages', () => {
  assert.deepEqual(databaseTarget(uri), { host: 'cluster0.example.mongodb.net', database: 'aurelia_dev' })
  assert.deepEqual(databaseTarget('not a URI with private-password'), { host: null, database: null })
  assert.deepEqual(databaseTarget('https://example.com/password'), { host: null, database: null })
  const auth = Object.assign(new Error(uri), { code: 18 })
  const nested = { reason: { servers: new Map([['example', { error: { cause: auth } }]]) } }
  assert.match(databaseFailureMessage(nested), /authentication failed/)
  assert.match(databaseFailureMessage({ code: 13 }), /readWrite/)
  assert.match(databaseFailureMessage({ cause: { code: 'ENOTFOUND' } }), /DNS/)
  assert.match(databaseFailureMessage({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), /TLS/)
  const cycle = { message: uri }; cycle.cause = cycle
  for (const error of [auth, nested, cycle, { message: uri }, undefined]) {
    const message = databaseFailureMessage(error)
    for (const secret of ['private-user', 'private-password', uri]) assert.ok(!message.includes(secret))
  }
})

function connectionFixture({ host = 'cluster0.example.mongodb.net', readyState = 1, failure } = {}) {
  const calls = []
  const latest = { _id: '507f1f77bcf86cd799439011', name: 'Atlas check product', slug: 'atlas-check-product', updatedAt: new Date('2026-10-21T12:00:00Z'), unrelatedSecret: 'do-not-return' }
  const connection = {
    readyState, name: 'aurelia_dev', host: 'replica-member.example.mongodb.net',
    getClient: () => ({ options: { srvHost: host, credentials: { password: 'do-not-return' } } }),
    db: {
      databaseName: 'aurelia_dev',
      command: async (command, options) => { calls.push(['command', command, options]); if (failure) throw failure; return { ok: 1 } },
      collection: name => {
        assert.equal(name, 'products')
        return {
          countDocuments: async (filter, options) => { calls.push(['count', filter, options]); return 16 },
          findOne: async (filter, options) => { calls.push(['find', filter, options]); return latest },
        }
      },
    },
  }
  return { connection, calls, latest }
}

test('live status reads products from the connected client, not a staged URI or local fallback', async () => {
  const { connection, calls, latest } = connectionFixture()
  const status = await readDatabaseStatus({ MONGO_URI: 'mongodb://127.0.0.1:27017/wrong', INTEGRATIONS_ATLAS_ACTIVE: true }, connection)
  assert.equal(status.connected, true)
  assert.equal(status.atlas, true)
  assert.equal(status.host, 'cluster0.example.mongodb.net')
  assert.equal(status.database, 'aurelia_dev')
  assert.equal(status.source, 'admin')
  assert.equal(status.productCount, 16)
  assert.equal(status.latestProduct.id, latest._id)
  assert.equal(status.latestProduct.slug, latest.slug)
  assert.ok(!JSON.stringify(status).includes('do-not-return'))
  assert.deepEqual(calls.map(([name]) => name), ['command', 'count', 'find'])
  for (const [, , options] of calls) {
    assert.equal(options.readPreference, 'primary')
    assert.equal(options.maxTimeMS, 5000)
  }
  assert.deepEqual(calls[2][2].projection, { _id: 1, name: 1, slug: 1, updatedAt: 1 })
  assert.deepEqual(calls[2][2].sort, { updatedAt: -1, _id: -1 })
})

test('disconnected and failed reads never report a successful Atlas verification', async () => {
  const offline = connectionFixture({ readyState: 0 })
  const status = await readDatabaseStatus({ INTEGRATIONS_ATLAS_ACTIVE: true }, offline.connection)
  assert.equal(status.connected, false)
  assert.equal(status.productCount, undefined)
  assert.equal(offline.calls.length, 0)
  const failed = connectionFixture({ failure: Object.assign(new Error(uri), { code: 13 }) })
  await assert.rejects(readDatabaseStatus({}, failed.connection), error => error.status === 503 && /permission denied/.test(error.message) && !error.message.includes(uri))
})

test('Atlas supplied by environment is recognized; ordinary local MongoDB is not labeled Atlas', () => {
  const atlas = connectionFixture()
  assert.equal(connectedDatabaseTarget(atlas.connection).atlas, true)
  const local = { readyState: 1, host: '127.0.0.1', name: 'aurelia_dev', getClient: () => ({ options: {} }) }
  assert.deepEqual(connectedDatabaseTarget(local), { host: '127.0.0.1', database: 'aurelia_dev', atlas: false })
})
