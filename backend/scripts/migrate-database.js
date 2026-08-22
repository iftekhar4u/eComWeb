import { getConfig, getMongoUri } from '../config/env.js'
import { migrateDatabase } from '../db/migrate.js'

const isTest = process.argv.includes('--test')
const dryRun = process.argv.includes('--dry-run')
const config = getConfig({ ...process.env, NODE_ENV: isTest ? 'test' : 'development' })
const result = await migrateDatabase({ uri: getMongoUri(config, isTest ? 'test' : 'development'), dryRun })
console.log(JSON.stringify({ database: result.database, applied: result.applied, conflicts: result.conflicts.length, collections: result.collections.length }))
if (result.conflicts.length) process.exitCode = 2
