import { access, mkdir, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { root } from './run.mjs'
process.chdir(path.join(root, 'backend'))
try {
  const { getConfig } = await import('../backend/config/env.js')
  const { createIntegrationStore } = await import('../backend/integrations/store.js')
  const { resolveDatabaseConfig } = await import('../backend/integrations/atlas.js')
  const base = getConfig({ ...process.env, NODE_ENV: 'production' })
  const store = createIntegrationStore(base), config = await resolveDatabaseConfig(base, store)
  await store.read()
  await access(path.join(root, 'frontend/dist-admin/index.html'))
  await mkdir(config.INTEGRATIONS_DIRECTORY, { recursive: true, mode: 0o700 })
  const temporary = path.join(config.INTEGRATIONS_DIRECTORY, `.write-check-${crypto.randomUUID()}`)
  const file = await open(temporary, 'wx', 0o600); await file.close(); await unlink(temporary)
  if (process.argv.includes('--database')) {
    const { default: mongoose } = await import('../backend/node_modules/mongoose/index.js')
    const { migrationVersion } = await import('../backend/db/migrate.js')
    try {
      await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 10000, autoIndex: false, autoCreate: false })
      const hello = await mongoose.connection.db.admin().command({ hello: 1 })
      if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Checkout needs a MongoDB replica set or Atlas.')
      const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()
      if (collections.length && !await mongoose.connection.db.collection('schema_migrations').findOne({ version: migrationVersion })) throw new Error('Existing database needs the explicit backed-up migration in docs/DEPLOYMENT.md.')
    } catch (error) {
      if (/^(Checkout needs|Existing database needs)/.test(error.message)) throw error
      throw new Error('Database preflight failed. Check URI, Atlas access list, permissions and connectivity; no database changes were made.')
    } finally { await mongoose.disconnect() }
  }
  console.log(`Production config, build and private storage: PASS${process.argv.includes('--database') ? '; database: PASS' : '. Add --database for read-only database checks.'}`)
  if (!config.PAYMENT_ENCRYPTION_KEY) console.log('Set a stable PAYMENT_ENCRYPTION_KEY before saving online payment credentials in admin.')
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Production build missing. Run npm run build.' : error.name === 'ZodError' ? `Invalid configuration fields: ${error.issues.map(issue => issue.path.join('.')).join(', ')}` : error.message)
  process.exitCode = 1
}
