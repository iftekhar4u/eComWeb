import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { migrateDatabase } from '../db/migrate.js'
import { getConfig } from '../config/env.js'
import '../email/models.js'
import '../payments/models.js'
const base = new URL(getConfig({ ...process.env, NODE_ENV: 'test' }).MONGO_TEST_URI)
if (base.pathname !== '/aurelia_test') throw new Error('Migration tests require disposable aurelia_test')
base.pathname = '/aurelia_test_dry_run'
const uri = base.href
describe.skipIf(process.env.RUN_DB_TESTS !== '1')('read-only migration preflight', () => {
  const clean = async () => { await mongoose.connect(uri, { autoIndex: false, autoCreate: false }); await mongoose.connection.db.dropDatabase(); await mongoose.disconnect() }
  beforeAll(clean); afterAll(clean)
  it('creates no collections or indexes in a fresh database during a dry run', async () => {
    const result = await migrateDatabase({ uri, allowDatabase: ['aurelia_test_dry_run'], dryRun: true })
    expect(result.applied).toBe(false); expect(mongoose.connection.readyState).toBe(0)
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
    expect(await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).toEqual([])
    await mongoose.disconnect()
  })
})
