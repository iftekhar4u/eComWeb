import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import mongoose from 'mongoose'

if (!process.argv.includes('--confirm')) throw new Error('This changes MongoDB users and roles. Re-run with --confirm only after reviewing the impact.')
const adminUri = process.env.MONGO_ADMIN_URI
if (!adminUri) throw new Error('Set MONGO_ADMIN_URI for the bootstrap connection; do not put it in source control.')
const prompt = readline.createInterface({ input, output })
const passwords = {}
for (const name of ['bootstrap', 'runtimeDev', 'runtimeTest', 'migrationDev', 'migrationTest']) passwords[name] = await prompt.question(`${name} password: `)
prompt.close()

const client = new mongoose.mongo.MongoClient(adminUri, { serverSelectionTimeoutMS: 5000 })
const databases = ['aurelia_dev', 'aurelia_test']
const runtimePrivileges = [
  ['users', ['find', 'insert', 'update']], ['products', ['find']], ['product_variants', ['find', 'insert', 'update']], ['categories', ['find']], ['product_collections', ['find']], ['media', ['find', 'insert', 'update']], ['homepages', ['find']], ['pages', ['find']], ['blog_posts', ['find']], ['site_settings', ['find']], ['carts', ['find', 'insert', 'update', 'remove']], ['wishlists', ['find', 'insert', 'update', 'remove']], ['orders', ['find', 'insert', 'update']], ['payments', ['find', 'insert', 'update']], ['payment_events', ['find', 'insert']], ['inventory_reservations', ['find', 'insert', 'update']], ['inventory_movements', ['find', 'insert']], ['coupons', ['find', 'update']], ['coupon_redemptions', ['find', 'insert', 'update']], ['reviews', ['find', 'insert', 'update']], ['audit_logs', ['find', 'insert']], ['auth_tokens', ['find', 'insert', 'update', 'remove']], ['sessions', ['find', 'insert', 'update', 'remove']],
]

async function createOrUpdateUser(db, user, pwd, roles) {
  const existing = await db.command({ usersInfo: user })
  if (existing.users?.length) return
  await db.command({ createUser: user, pwd, roles })
}

try {
  await client.connect()
  const admin = client.db('admin')
  await createOrUpdateUser(admin, 'aurelia_bootstrap', passwords.bootstrap, [{ role: 'userAdminAnyDatabase', db: 'admin' }])
  for (const databaseName of databases) {
    const db = client.db(databaseName)
    const privileges = runtimePrivileges.map(([collection, actions]) => ({ resource: { db: databaseName, collection }, actions }))
    const roleInfo = await db.command({ rolesInfo: { role: 'aureliaRuntime', db: databaseName }, showPrivileges: true })
    if (roleInfo.roles?.length) await db.command({ updateRole: 'aureliaRuntime', privileges, roles: [] })
    else await db.command({ createRole: 'aureliaRuntime', privileges, roles: [] })
    await createOrUpdateUser(db, databaseName === 'aurelia_dev' ? 'aurelia_runtime_dev' : 'aurelia_runtime_test', databaseName === 'aurelia_dev' ? passwords.runtimeDev : passwords.runtimeTest, [{ role: 'aureliaRuntime', db: databaseName }])
    await createOrUpdateUser(db, databaseName === 'aurelia_dev' ? 'aurelia_migrator_dev' : 'aurelia_migrator_test', databaseName === 'aurelia_dev' ? passwords.migrationDev : passwords.migrationTest, [{ role: 'dbAdmin', db: databaseName }])
  }
  console.log('MongoDB access roles prepared. Existing users were never reset. Authentication enablement and service changes remain a separate approval-gated step.')
} finally {
  passwords.bootstrap = passwords.runtimeDev = passwords.runtimeTest = passwords.migrationDev = passwords.migrationTest = undefined
  await client.close()
}
