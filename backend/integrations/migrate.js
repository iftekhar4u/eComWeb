import crypto from 'node:crypto'
import mongoose from 'mongoose'
const { BSON } = mongoose.mongo
import { integrationError } from './store.js'

const fail = message => integrationError(409, message)
export async function migrationPlan(source, destination) {
  const collections = (await source.listCollections().toArray()).filter(c => c.name !== 'sessions' && !c.name.startsWith('system.'))
  if (collections.some(c => c.type !== 'collection' || c.options?.timeseries || c.options?.capped)) throw fail('This migration helper supports ordinary collections only. Use MongoDB Database Tools for views, time-series, or capped collections.')
  if (!collections.length) throw fail('The source database is empty. Check the original backend .env database selection.')
  const target = (await destination.listCollections({}, { nameOnly: true }).toArray()).filter(c => !c.name.startsWith('system.'))
  if (target.length) throw fail('The target database already has collections. Choose a NEW empty Atlas database; this helper never merges, overwrites, or drops data.')
  const plan = []
  for (const collection of collections) plan.push({ name: collection.name, documents: await source.collection(collection.name).countDocuments(), options: collection.options || {} })
  return plan
}
async function digest(collection) {
  const hash = crypto.createHash('sha256')
  let count = 0
  for await (const doc of collection.find({}, { promoteValues: false }).sort({ _id: 1 })) { hash.update(BSON.serialize(doc)); count++ }
  return { count, digest: hash.digest('hex') }
}
export async function copyDatabase(source, destination, { confirmed = false, sourcePaused = false, onProgress = () => {} } = {}) {
  if (!confirmed || !sourcePaused) throw fail('Stop all source writers, take a backup, and explicitly confirm the copy before proceeding.')
  const plan = await migrationPlan(source, destination)
  const results = []
  for (const item of plan) {
    const from = source.collection(item.name)
    const to = await destination.createCollection(item.name, item.options)
    const indexes = (await from.listIndexes().toArray()).filter(index => index.name !== '_id_').map(({ v: _v, ns: _ns, background: _background, ...index }) => index)
    if (indexes.length) await to.createIndexes(indexes)
    let batch = []
    for await (const doc of from.find({}, { promoteValues: false }).sort({ _id: 1 })) {
      batch.push(doc)
      if (batch.length === 200) { await to.insertMany(batch, { ordered: true }); batch = [] }
    }
    if (batch.length) await to.insertMany(batch, { ordered: true })
    const original = await digest(from), copied = await digest(to)
    if (original.count !== item.documents || original.count !== copied.count || original.digest !== copied.digest) throw fail('Source/target verification failed. Keep the original database active and investigate the partial target. No source records were changed.')
    const result = { name: item.name, documents: copied.count, verified: true }
    results.push(result)
    onProgress(result)
  }
  return results
}
