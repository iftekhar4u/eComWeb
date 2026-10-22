import mongoose from 'mongoose'
import { getConfig } from '../config/env.js'
import { createIntegrationStore } from '../integrations/store.js'
import { resolveDatabaseConfig } from '../integrations/atlas.js'
import { databaseTarget, databaseFailureMessage, readDatabaseStatus } from '../integrations/database-status.js'

const isTest = process.argv.includes('--test')
try {
  const baseConfig = getConfig({ ...process.env, NODE_ENV: isTest ? 'test' : 'development' })
  // Match server.js: the old diagnostic ignored the admin-selected Atlas URI.
  const config = await resolveDatabaseConfig(baseConfig, createIntegrationStore(baseConfig))
  if (!['aurelia_dev', 'aurelia_test'].includes(databaseTarget(config.MONGO_URI).database)) {
    console.error('Diagnostics are limited to aurelia_dev and aurelia_test.')
    process.exitCode = 1
  } else {
    await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 30000, autoIndex: false, autoCreate: false })
    const db = mongoose.connection.db
    const status = await readDatabaseStatus(config)
    const hello = await db.admin().command({ hello: 1 })
    const buildInfo = await db.admin().command({ buildInfo: 1 })
    const collections = await db.listCollections({}, { nameOnly: true }).toArray()
    const collectionInfo = []
    for (const entry of collections) {
      const info = await db.command({ listCollections: 1, filter: { name: entry.name }, nameOnly: false })
      const descriptor = info.cursor.firstBatch[0]
      const indexes = await db.collection(entry.name).indexes().catch(() => [])
      collectionInfo.push({ name: entry.name, validator: Boolean(descriptor?.options?.validator), validationLevel: descriptor?.options?.validationLevel || null, validationAction: descriptor?.options?.validationAction || null, indexes: indexes.map(index => index.name) })
    }
    console.log(JSON.stringify({ ...status, serverVersion: buildInfo.version, topology: hello.setName ? 'replicaSet' : hello.msg === 'isdbgrid' ? 'sharded' : 'standalone', setName: hello.setName || null, authenticatedUsers: (await db.admin().command({ connectionStatus: 1 })).authInfo.authenticatedUsers.length, collections: collectionInfo }, null, 2))
  }
} catch (error) {
  console.error(databaseFailureMessage(error))
  process.exitCode = 1
} finally { await mongoose.disconnect() }
