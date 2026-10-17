import mongoose from 'mongoose'
import { integrationError } from './store.js'
import { databaseFailureMessage } from './database-status.js'

export function validateAtlasUri(value) {
  const message = 'Enter an Atlas mongodb+srv URI with a database username, encoded password, .mongodb.net host, and application database name. Do not disable TLS.'
  try {
    const url = new URL(value)
    if (value.length > 4096 || /[\s<>]/.test(value) || url.protocol !== 'mongodb+srv:' || !url.username || !url.password || url.port || url.hash || !/^[a-z0-9-]+\.[a-z0-9.-]+\.mongodb\.net$/i.test(url.hostname)) throw new Error()
    const name = url.pathname.slice(1)
    if (!/^[a-zA-Z0-9_-]{1,63}$/.test(name) || ['admin', 'local', 'config'].includes(name.toLowerCase())) throw new Error()
    const allowed = new Set(['retrywrites', 'w', 'appname', 'authsource', 'readpreference', 'maxpoolsize'])
    const seen = new Set()
    for (const [key] of url.searchParams) {
      if (!allowed.has(key.toLowerCase()) || seen.has(key.toLowerCase())) throw new Error()
      seen.add(key.toLowerCase())
    }
    return value
  } catch { throw integrationError(400, message) }
}

export async function withAtlas(uri, work, Client = mongoose.mongo.MongoClient) {
  validateAtlasUri(uri)
  let client
  try {
    client = new Client(uri, { serverSelectionTimeoutMS: 30000, connectTimeoutMS: 15000, socketTimeoutMS: 15000, maxPoolSize: 2, tls: true })
    await client.connect()
    const db = client.db()
    await db.command({ ping: 1 })
    const hello = await db.admin().command({ hello: 1 })
    if (!hello.setName && hello.msg !== 'isdbgrid') throw integrationError(400, 'This database does not support the replica-set transactions required by checkout.')
    return await work(db)
  } catch (error) {
    if (error.status) throw error
    // Driver errors may contain the URI or credentials. Never return/log raw errors.
    throw integrationError(400, databaseFailureMessage(error))
  } finally { await client?.close().catch(() => {}) }
}

export async function testAtlas(uri, account, Client) {
  return withAtlas(uri, async db => {
    await db.listCollections({}, { nameOnly: true }).toArray()
    if (account) {
      const target = await db.collection('users').findOne({ _id: account._id, role: 'admin', status: 'active' })
      if (!target || target.password !== account.password || target.sessionVersion !== account.sessionVersion || Boolean(target.mfa?.enabled) !== Boolean(account.mfa?.enabled) || (target.mfa?.secretEncrypted || '') !== (account.mfa?.secretEncrypted || '')) {
        throw integrationError(409, 'Copy and verify your current database first. Atlas must contain this same active administrator, password, and authenticator before activation.')
      }
    }
    return { connected: true, transactionsSupported: true }
  }, Client)
}

export async function resolveDatabaseConfig(config, integrations) {
  const result = { ...config, BOOTSTRAP_MONGO_URI: config.MONGO_URI, INTEGRATIONS_ATLAS_ACTIVE: false }
  if (config.NODE_ENV === 'test' || config.INTEGRATIONS_IGNORE_DATABASE) return result
  const settings = await integrations.read()
  if (settings.mongodb.activeUri) {
    result.MONGO_URI = validateAtlasUri(settings.mongodb.activeUri)
    result.INTEGRATIONS_ATLAS_ACTIVE = true
  }
  return result
}
