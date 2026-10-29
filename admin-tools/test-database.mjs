import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runNode } from './run.mjs'
// Never reads an operator's URI; all writes belong to this disposable replica set.
const directory = await mkdtemp(path.join(tmpdir(), 'aurelia-db-tests-'))
let replica
try {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.15' }, instanceOpts: [{ dbPath: directory, args: process.platform === 'win32' ? [] : ['--nounixsocket'] }], replSet: { count: 1, storageEngine: 'wiredTiger' } })
  await runNode(['node_modules/vitest/vitest.mjs', 'run', '--fileParallelism=false', 'tests/database.test.js', 'tests/commerce.test.js', 'tests/migration-dry-run.test.js'], { directory: 'backend', env: { NODE_ENV: 'test', RUN_DB_TESTS: '1', MONGO_URI: '', MONGO_TEST_URI: replica.getUri('aurelia_test') } })
} catch (error) { console.error(error.message); process.exitCode = 1 }
finally { await replica?.stop(); await rm(directory, { recursive: true, force: true }) }
