import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const requested = process.argv[2]
const files = requested === 'database' ? ['tests/database.test.js'] : requested === 'commerce' ? ['tests/commerce.test.js'] : ['tests/database.test.js','tests/commerce.test.js','tests/migration-dry-run.test.js']
console.log('WARNING: These tests clear application collections in the disposable aurelia_test database. Never point them at customer data.')
const result = spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url)),'run','--fileParallelism=false',...files],{stdio:'inherit',env:{...process.env,NODE_ENV:'test',RUN_DB_TESTS:'1'}})
process.exit(result.status ?? 1)
