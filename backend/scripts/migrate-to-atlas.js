import mongoose from 'mongoose'
import { getConfig } from '../config/env.js'
import { createIntegrationStore } from '../integrations/store.js'
import { withAtlas } from '../integrations/atlas.js'
import { copyDatabase, migrationPlan } from '../integrations/migrate.js'

// Deliberately uses the ORIGINAL .env database as source, never the runtime override.
const config = getConfig()
const options = new Set(process.argv.slice(2))
const copy = options.has('--confirm-copy')
let source
try {
  if ([...options].some(option => !['--dry-run', '--confirm-copy', '--source-paused'].includes(option)) || (copy && options.has('--dry-run'))) throw new Error('args')
  if (copy && !options.has('--source-paused')) throw new Error('paused')
  const settings = await createIntegrationStore(config).read()
  if (!settings.mongodb.uri) throw new Error('missing')
  source = new mongoose.mongo.MongoClient(config.MONGO_URI, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, socketTimeoutMS: 30000, maxPoolSize: 2 })
  await source.connect()
  const db = source.db()
  if (['admin', 'local', 'config'].includes(db.databaseName)) throw new Error('source')
  await withAtlas(settings.mongodb.uri, async target => {
    if (!copy) {
      const plan = await migrationPlan(db, target)
      console.log(JSON.stringify({ dryRun: true, collections: plan.map(({ name, documents }) => ({ name, documents })), note: 'No writes. Stop all source writers and take a backup before copying. Sessions are excluded.' }, null, 2))
      return
    }
    await copyDatabase(db, target, { confirmed: true, sourcePaused: options.has('--source-paused'), onProgress: result => console.log(JSON.stringify(result)) })
    console.log('Copy and BSON verification complete. The source is unchanged. Keep customer access closed; start the backend privately, select Atlas in Admin Settings, restart, and verify the store before reopening.')
  })
} catch (error) {
  // Never print driver errors, document contents, or connection strings.
  console.error(error.status ? error.message : 'Migration stopped. Check the saved Atlas settings, original .env source, network access, and command flags. Use --dry-run first, then --confirm-copy --source-paused only with all source writers stopped. See README_INTEGRATIONS.md.')
  console.error('If a copy started, the destination may be partial. Nothing is deleted automatically. Keep the source active and use a new empty destination after investigating.')
  process.exitCode = 1
} finally { await source?.close().catch(() => {}) }
