import { createIntegrationStore } from '../integrations/store.js'
import { resolveDatabaseConfig } from '../integrations/atlas.js'
import { getConfig, getMongoUri } from '../config/env.js'
import { migrateDatabase } from '../db/migrate.js'
const isTest = process.argv.includes('--test')
const production = process.argv.includes('--production')
const dryRun = process.argv.includes('--dry-run')
if (isTest && production) throw new Error('Choose test or production, not both')
const baseConfig = getConfig({ ...process.env, NODE_ENV: production ? 'production' : isTest ? 'test' : 'development' })
const config = isTest ? baseConfig : await resolveDatabaseConfig(baseConfig, createIntegrationStore(baseConfig))
const uri = isTest ? getMongoUri(config, 'test') : config.MONGO_URI
const name = decodeURIComponent(new URL(uri).pathname.slice(1))
if (production && (!name || ['admin', 'local', 'config'].includes(name) || !process.argv.includes(`--confirm-database=${name}`))) throw new Error('For a deliberate production migration, supply --production --confirm-database=YOUR_DATABASE after taking a backup. --dry-run checks index conflicts first.')
const result = await migrateDatabase({ uri, dryRun, ...(production && { allowDatabase: [name] }) })
console.log(JSON.stringify({ version: result.version, database: result.database, applied: result.applied, conflicts: result.conflicts.length, collections: result.collections?.length || 0 }))
if (result.conflicts.length) process.exitCode = 2
