import mongoose from 'mongoose'
import { collectionDefinitions, applicationCollectionNames } from './collectionDefinitions.js'

const migrationVersion = '001_database_foundation'
const sessionDefinition = {
  validator: { $jsonSchema: { bsonType: 'object', required: ['_id', 'expires', 'session'], properties: { _id: { bsonType: 'string', maxLength: 256 }, expires: { bsonType: 'date' }, session: { bsonType: 'string', maxLength: 1048576 } }, additionalProperties: false } },
  indexes: [[{ expires: 1 }, { name: 'ttl_sessions', expireAfterSeconds: 0 }]],
}

function databaseName(uri) {
  const parsed = new URL(uri)
  return decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'admin'
}

function uniqueIndexConflicts(collection, key, options = {}) {
  const fieldExpression = (path) => path.split('.').reduce((input, field) => ({ $getField: { field, input } }), '$$CURRENT')
  const groupId = Object.fromEntries(Object.keys(key).map((field, index) => [`key${index}`, fieldExpression(field)]))
  const pipeline = []
  if (options.partialFilterExpression) pipeline.push({ $match: options.partialFilterExpression })
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  )
  return collection.aggregate(pipeline).toArray()
}

async function ensureIndex(collection, key, options) {
  const existing = await collection.listIndexes().toArray()
  const sameKey = existing.find((index) => JSON.stringify(index.key) === JSON.stringify(key))
  if (sameKey) {
    const ttlMatches = options.expireAfterSeconds === undefined || sameKey.expireAfterSeconds === options.expireAfterSeconds
    const uniqueMatches = options.unique === undefined || Boolean(sameKey.unique) === Boolean(options.unique)
    const partialMatches = options.partialFilterExpression === undefined || JSON.stringify(sameKey.partialFilterExpression || null) === JSON.stringify(options.partialFilterExpression)
    if (!ttlMatches || !uniqueMatches || !partialMatches) throw new Error(`Incompatible existing index ${sameKey.name} on ${collection.collectionName}`)
    return sameKey.name
  }
  return collection.createIndex(key, options)
}

export async function preflightDatabase(db) {
  const conflicts = []
  for (const [name, definition] of Object.entries(collectionDefinitions)) {
    if (!(await db.listCollections({ name }).hasNext())) continue
    const collection = db.collection(name)
    for (const [key, options] of definition.indexes.filter(([, indexOptions]) => indexOptions.unique)) {
      const duplicateGroups = await uniqueIndexConflicts(collection, key, options)
      if (duplicateGroups.length) conflicts.push({ collection: name, key, duplicateGroups })
    }
  }
  return conflicts
}

export async function migrateDatabase({ uri, allowDatabase = ['aurelia_dev', 'aurelia_test'], dryRun = false }) {
  const name = databaseName(uri)
  if (!allowDatabase.includes(name)) throw new Error(`Refusing migration for database ${name}; allowed: ${allowDatabase.join(', ')}`)
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 })
  const db = mongoose.connection.db
  const conflicts = await preflightDatabase(db)
  if (conflicts.length) {
    await mongoose.disconnect()
    return { database: name, conflicts, applied: false }
  }
  if (!dryRun) {
    for (const [collectionName, definition] of Object.entries(collectionDefinitions)) {
      const exists = await db.listCollections({ name: collectionName }).hasNext()
      if (!exists) await db.createCollection(collectionName, { validator: definition.validator, validationLevel: 'strict', validationAction: 'error' })
      else await db.command({ collMod: collectionName, validator: definition.validator, validationLevel: 'strict', validationAction: 'error' })
      for (const [key, options] of definition.indexes) await ensureIndex(db.collection(collectionName), key, options)
    }
    const sessionsExists = await db.listCollections({ name: 'sessions' }).hasNext()
    if (!sessionsExists) await db.createCollection('sessions', { validator: sessionDefinition.validator, validationLevel: 'strict', validationAction: 'error' })
    else await db.command({ collMod: 'sessions', validator: sessionDefinition.validator, validationLevel: 'strict', validationAction: 'error' })
    for (const [key, options] of sessionDefinition.indexes) await ensureIndex(db.collection('sessions'), key, options)
    const metadataExists = await db.listCollections({ name: 'schema_migrations' }).hasNext()
    if (!metadataExists) await db.createCollection('schema_migrations', { validator: { $jsonSchema: { bsonType: 'object', required: ['version', 'appliedAt'], properties: { _id: { bsonType: 'objectId' }, version: { bsonType: 'string', maxLength: 100 }, appliedAt: { bsonType: 'date' } }, additionalProperties: false } }, validationLevel: 'strict', validationAction: 'error' })
    await ensureIndex(db.collection('schema_migrations'), { version: 1 }, { unique: true, name: 'uq_schema_migrations_version' })
    await db.collection('schema_migrations').updateOne({ version: migrationVersion }, { $setOnInsert: { version: migrationVersion, appliedAt: new Date() } }, { upsert: true })
  }
  const result = { database: name, collections: [...applicationCollectionNames, 'sessions', 'schema_migrations'], conflicts, applied: !dryRun }
  await mongoose.disconnect()
  return result
}

export { migrationVersion }
