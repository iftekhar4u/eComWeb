import mongoose from 'mongoose'
import { getConfig, getMongoUri } from '../config/env.js'

const isTest = process.argv.includes('--test')
const config = getConfig({ ...process.env, NODE_ENV: isTest ? 'test' : 'development' })
const uri = getMongoUri(config, isTest ? 'test' : 'development')
const parsed = new URL(uri)
if (!['aurelia_dev', 'aurelia_test'].includes(parsed.pathname.slice(1))) throw new Error('Diagnostics are limited to aurelia_dev and aurelia_test')
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
const db = mongoose.connection.db
const hello = await db.admin().command({ hello: 1 })
const buildInfo = await db.admin().command({ buildInfo: 1 })
const collections = await db.listCollections({}, { nameOnly: true }).toArray()
const collectionInfo = []
for (const entry of collections) {
  const info = await db.command({ listCollections: 1, filter: { name: entry.name }, nameOnly: false })
  const descriptor = info.cursor.firstBatch[0]
  const indexes = await db.collection(entry.name).indexes().catch(() => [])
  collectionInfo.push({ name: entry.name, validator: Boolean(descriptor?.options?.validator), validationLevel: descriptor?.options?.validationLevel || null, validationAction: descriptor?.options?.validationAction || null, indexes: indexes.map((index) => index.name) })
}
console.log(JSON.stringify({ database: db.databaseName, serverVersion: buildInfo.version, topology: hello.setName ? 'replicaSet' : 'standalone', setName: hello.setName || null, authenticatedUsers: (await db.admin().command({ connectionStatus: 1 })).authInfo.authenticatedUsers.length, collections: collectionInfo }, null, 2))
await mongoose.disconnect()
