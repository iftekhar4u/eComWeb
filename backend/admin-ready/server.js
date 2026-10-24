import { migrationVersion } from '../db/migrate.js'
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import argon2 from 'argon2'
import User from '../models/User.js'
import { getConfig } from '../config/env.js'
import { createReadyApp, connectDatabase } from './app.js'
import { createPaymentSettings } from '../payments/settings.js'
import { createPaymentWorker } from '../payments/worker.js'
import { prepareDatabase } from './database.js'
import { createIntegrationStore } from '../integrations/store.js'
import { resolveDatabaseConfig } from '../integrations/atlas.js'
import { databaseTarget, connectedDatabaseTarget, databaseFailureMessage } from '../integrations/database-status.js'
import { ensureSeoDatabase } from '../seo/database.js'
import { ensureEmailDatabase } from '../email/database.js'
import { createEmailService } from '../email/service.js'
import { bindEmailEvents } from '../email/events.js'
const baseConfig = getConfig()
const integrations = createIntegrationStore(baseConfig)
const config = await resolveDatabaseConfig(baseConfig, integrations)
if (!config.SESSION_SECRET || !config.MFA_ENCRYPTION_KEY) throw new Error('Fill backend/.env first: SESSION_SECRET and MFA_ENCRYPTION_KEY are required. Run node admin-tools/setup.mjs from the project root.')
console.log('Database target:', databaseTarget(config.MONGO_URI))
try { await connectDatabase(config) } catch (error) {
  throw new Error(databaseFailureMessage(error))
}
console.log('Database connected successfully:', connectedDatabaseTarget())
const database = await prepareDatabase(mongoose.connection.db)
if (database.initialized) {
  await mongoose.connection.db.collection('schema_migrations').updateOne({ version: migrationVersion }, { $setOnInsert: { version: migrationVersion, appliedAt: new Date() } }, { upsert: true })
} else if (!await mongoose.connection.db.collection('schema_migrations').findOne({ version: migrationVersion })) {
  throw new Error('Payment schema upgrade required. Back up the database, run npm run db:migrate -- --dry-run from backend, then npm run db:migrate before restarting. See docs/PAYMENTS_SETUP.md; production requires the documented explicit database confirmation.')
}
await ensureSeoDatabase(mongoose.connection.db)
await ensureEmailDatabase(mongoose.connection.db)
console.log(database.initialized ? 'Empty application database initialized; no sample business data added.' : 'Existing database records and configuration preserved.')
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase(), password = process.env.ADMIN_PASSWORD || '', name = (process.env.ADMIN_NAME || '').trim()
if (email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL is invalid')
  const exists = await User.findOne({ email }).select('role status').lean()
  if (exists) {
    if (exists.role !== 'admin') throw new Error('ADMIN_EMAIL belongs to a customer. Choose a new admin email; customer accounts are never promoted automatically.')
    console.log('Existing admin account preserved. Use its current password and authenticator.')
  } else {
    if (name.length < 2 || password.length < 12 || password.length > 128) throw new Error('For a NEW admin, set ADMIN_NAME and an ADMIN_PASSWORD of 12–128 characters in backend/.env.')
    await User.create({ name, email, password: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }), role: 'admin', status: 'active' })
    console.log('Admin account created. Complete authenticator setup on first sign-in.')
  }
}
const emailService = createEmailService(config)
bindEmailEvents(emailService.event)
const paymentSettings = createPaymentSettings(config)
const staticDirectory = config.NODE_ENV === 'production' ? fileURLToPath(new URL('../../frontend/dist-admin/', import.meta.url)) : undefined
if (staticDirectory) await access(`${staticDirectory}/index.html`).catch(() => { throw new Error('Build the admin frontend first: node admin-tools/build.mjs') })
const app = createReadyApp({ config, paymentSettings, staticDirectory, integrations, emailService })
const server = app.listen(config.PORT, () => console.log(`AURELIA ready API: http://localhost:${config.PORT}; admin: ${config.CLIENT_URL}/admin`))
const stopEmail = emailService.start()
const stopPayments = createPaymentWorker(paymentSettings).start()
let stopping = false
const shutdown = () => {
  if (stopping) return
  stopping = true
  server.close(async () => {
    await stopPayments()
    await stopEmail()
    bindEmailEvents(null)
    await mongoose.disconnect()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)
