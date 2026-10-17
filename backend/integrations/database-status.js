import mongoose from 'mongoose'
import { integrationError } from './store.js'

// Allow only host/database metadata into logs and the authenticated admin API.
// Never serialize a MongoClient, URI, or raw driver error.
function safeHost(value) {
  return typeof value === 'string' && /^[a-z0-9.:[\]-]+$/i.test(value) ? value : null
}
function safeDatabase(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,63}$/.test(value) ? value : null
}
export function databaseTarget(uri) {
  try {
    const url = new URL(uri)
    if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol)) return { host: null, database: null }
    return { host: safeHost(url.hostname), database: safeDatabase(url.pathname.slice(1)) }
  } catch { return { host: null, database: null } }
}

export function databaseFailureMessage(error) {
  // Selection errors can wrap DNS/TLS/authentication errors per replica member.
  const errors = [], pending = [error], seen = new Set()
  while (pending.length && errors.length < 32) {
    const item = pending.shift()
    if (!item || typeof item !== 'object' || seen.has(item)) continue
    seen.add(item); errors.push(item)
    pending.push(item.cause, item.reason)
    if (Array.isArray(item.errors)) pending.push(...item.errors.slice(0, 32))
    if (item.servers instanceof Map) for (const server of item.servers.values()) pending.push(server.error)
  }
  // Keep useful error identifiers while excluding arbitrary driver messages,
  // connection strings, credentials, certificate contents and stack traces.
  const codes = [...new Set(errors.map(e => e.code).filter(code =>
    Number.isSafeInteger(code) || (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(code))
  ))].slice(0, 8)
  const explain = message => `${message} MongoDB error codes: ${codes.length ? codes.join(', ') : 'unavailable'}.`
  if (errors.some(e => e.code === 18 || e.codeName === 'AuthenticationFailed')) return explain('MongoDB authentication failed. Check the database user, password encoding, and authSource. Atlas account login credentials are different from database credentials.')
  if (errors.some(e => e.code === 13 || e.codeName === 'Unauthorized')) return explain('MongoDB permission denied. The database user needs readWrite access to the application database.')
  if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ENODATA', 'EREFUSED'].includes(code))) return explain('MongoDB DNS lookup failed. Check the cluster hostname, cluster availability, and DNS/network connection.')
  if (codes.some(code => ['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CRL_HAS_EXPIRED', 'CRL_NOT_YET_VALID'].includes(code))) return explain('MongoDB TLS certificate date validation failed. Sync Windows date/time. If the clock is correct, check the presented certificate and any network TLS inspection.')
  if (codes.some(code => ['UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_UNTRUSTED'].includes(code))) return explain('MongoDB TLS certificate chain is not trusted. On Windows with Node 24, test from the backend folder using: node --use-system-ca --watch server.js. This adds trusted Windows certificates and keeps TLS verification enabled.')
  if (codes.some(code => ['ERR_TLS_CERT_ALTNAME_INVALID', 'HOSTNAME_MISMATCH'].includes(code))) return explain('MongoDB TLS certificate hostname does not match. Check the Atlas hostname and DNS/network TLS inspection. Keep hostname verification enabled.')
  if (codes.some(code => /CERT|TLS|SSL/.test(String(code)))) return explain('MongoDB TLS handshake failed. Check that today\'s public IP is allowed in Atlas, then check cluster availability and VPN/firewall/network access. This code alone does not prove that the certificate is expired. Keep TLS verification enabled.')
  return explain('MongoDB connection could not be verified. Check the database credentials, Atlas Network Access for this computer\'s current public IP, cluster availability, and firewall/network access. The app has not switched to another database.')
}

export function connectedDatabaseTarget(connection = mongoose.connection) {
  // srvHost is the actual client's seed hostname, rather than a newly saved URI
  // that will only take effect at the next restart.
  const client = connection.getClient?.()
  const host = safeHost(client?.options?.srvHost || connection.host)
  return { host, database: safeDatabase(connection.db?.databaseName || connection.name), atlas: Boolean(host && /\.mongodb\.net$/i.test(host)) }
}

export async function readDatabaseStatus(config, connection = mongoose.connection) {
  const target = connectedDatabaseTarget(connection)
  const status = { ...target, connected: false, source: config.INTEGRATIONS_ATLAS_ACTIVE ? 'admin' : 'environment' }
  if (connection.readyState !== 1 || !connection.db) {
    return { ...status, checkedAt: new Date().toISOString(), message: 'The running backend is not connected to MongoDB. Check its terminal and restart after fixing the connection.' }
  }
  try {
    const options = { readPreference: 'primary', maxTimeMS: 5000 }
    await connection.db.command({ ping: 1 }, options)
    const products = connection.db.collection('products')
    const [productCount, latest] = await Promise.all([
      products.countDocuments({}, options),
      products.findOne({}, { ...options, sort: { updatedAt: -1, _id: -1 }, projection: { _id: 1, name: 1, slug: 1, updatedAt: 1 } }),
    ])
    return {
      ...status, connected: true, checkedAt: new Date().toISOString(), productCount,
      latestProduct: latest ? { id: String(latest._id), name: latest.name, slug: latest.slug, updatedAt: latest.updatedAt } : null,
    }
  } catch (error) { throw integrationError(503, databaseFailureMessage(error)) }
}
