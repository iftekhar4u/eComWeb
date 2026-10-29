import { runNode } from './run.mjs'
try {
  await runNode(['--test', 'backend/admin-ready/tests/*.test.js', 'backend/email/tests/*.test.js', 'backend/seo/tests/*.test.js', 'backend/production/tests/*.test.js'])
  await runNode(['node_modules/vitest/vitest.mjs', 'run', '--fileParallelism=false', 'tests/security.test.js', 'tests/payments.test.js', 'tests/reconciliation.test.js', 'tests/payment-upgrade.test.js'], { directory: 'backend', env: { NODE_ENV: 'test' } })
} catch (error) { console.error(error.message); process.exitCode = 1 }
