import mongoose from 'mongoose'
import { getConfig, getMongoUri } from '../config/env.js'
import { applicationCollectionNames } from '../db/collectionDefinitions.js'

const isTest = process.argv.includes('--test')
const config = getConfig({ ...process.env, NODE_ENV: isTest ? 'test' : 'development' })
const uri = getMongoUri(config, isTest ? 'test' : 'development')
const databaseName = new URL(uri).pathname.slice(1)
if (!['aurelia_dev', 'aurelia_test'].includes(databaseName)) throw new Error('Verification is limited to aurelia_dev and aurelia_test')
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
const db = mongoose.connection.db
const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name))
const missing = [...applicationCollectionNames, 'schema_migrations'].filter((name) => !names.has(name))
const invalid = []
for (const name of [...applicationCollectionNames, 'schema_migrations']) {
  if (!names.has(name)) continue
  const descriptor = (await db.command({ listCollections: 1, filter: { name }, nameOnly: false })).cursor.firstBatch[0]
  if (descriptor.options?.validationLevel !== 'strict' || descriptor.options?.validationAction !== 'error') invalid.push({ name, reason: 'validator policy' })
}
console.log(JSON.stringify({ database: databaseName, missing, invalid, ok: missing.length === 0 && invalid.length === 0 }))
await mongoose.disconnect()
if (missing.length || invalid.length) process.exitCode = 1
