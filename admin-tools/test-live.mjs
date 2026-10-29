import { MongoMemoryReplSet } from 'mongodb-memory-server'
import selfsigned from 'selfsigned'
import { spawn } from 'node:child_process'
import { createServer as httpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { requestChildShutdown, root, runNode } from './run.mjs'
import mongoose from '../backend/node_modules/mongoose/index.js'
import Product from '../backend/models/Product.js'
import { ProductVariant, Order, InventoryMovement } from '../backend/models/domainModels.js'
const directory = await mkdtemp(path.join(tmpdir(), 'aurelia-live-test-'))
let replica, child, proxy, childExit, productionReadyMs
try {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.15' }, instanceOpts: [{ dbPath: directory, args: process.platform === 'win32' ? [] : ['--nounixsocket'] }], replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const uri = replica.getUri('aurelia_test')
  const cert = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 1, keySize: 2048, extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }] })
  const env = { ...process.env, NODE_ENV: 'production', PORT: '5444', CLIENT_URL: 'https://localhost:5443', PAYMENT_PUBLIC_ORIGIN: 'https://localhost:5443', MONGO_URI: uri, INTEGRATIONS_DIRECTORY: path.join(directory, 'vault'), INTEGRATIONS_IGNORE_DATABASE: 'true', SESSION_SECRET: crypto.randomBytes(48).toString('hex'), MFA_ENCRYPTION_KEY: crypto.randomBytes(48).toString('hex'), PAYMENT_ENCRYPTION_KEY: crypto.randomBytes(48).toString('hex'), EMAIL_ENCRYPTION_KEY: '', EMAIL_ENABLED: 'false', GOOGLE_AUTH_ENABLED: 'false', COD_ENABLED: 'true', TRUST_PROXY: '1', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' }
  const startupStarted = performance.now()
  child = spawn(process.execPath, ['admin-tools/production.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  childExit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  child.stdout.on('data', chunk => process.stdout.write(chunk)); child.stderr.on('data', chunk => process.stderr.write(chunk))
  let ready = false
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error('Production process exited before readiness')
    ready = await fetch('http://127.0.0.1:5444/readyz').then(response => response.ok).catch(() => false)
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Production server must become ready')
  productionReadyMs = performance.now() - startupStarted
  console.log(`PASS: production process reached readiness in ${productionReadyMs.toFixed(1)} ms.`)
  await runNode(['admin-tools/deploy-check.mjs', '--database'], { env })
  await runNode(['admin-tools/deploy-smoke.mjs', 'http://127.0.0.1:5444'])
  await mongoose.connect(uri, { autoCreate: false, autoIndex: false })
  const product = await Product.create({ name: 'Deployment Cleanser', slug: 'deployment-cleanser', description: 'Disposable deployment test product.', category: 'skin-care', brand: 'AURELIA', price: 10000, stock: 10, status: 'published', thumbnail: 'https://localhost:5443/favicon.svg', images: ['https://localhost:5443/favicon.svg'], bestSeller: true, newArrival: true })
  const variant = await ProductVariant.create({ product: product._id, sku: 'DEPLOYMENT-QA-ONLY', price: 10000, stockOnHand: 10, reservedQuantity: 0 })
  proxy = httpsServer({ key: cert.private, cert: cert.cert }, (req, res) => {
    const upstream = httpRequest({ hostname: '127.0.0.1', port: 5444, method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress, 'x-forwarded-proto': 'https', 'x-forwarded-host': 'localhost:5443' } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res) })
    upstream.on('error', () => { res.writeHead(502); res.end() }); req.pipe(upstream)
  })
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(5443, '127.0.0.1', resolve) })
  await runNode(['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.live.config.js'], { directory: 'frontend' })
  const orders = await Order.find().lean()
  assert.equal(orders.length, 1); assert.equal(orders[0].fulfillmentStatus, 'cancelled'); assert.equal(orders[0].paymentStatus, 'failed', 'Cancelled unpaid COD must not become paid')
  assert.equal(orders[0].items[0].quantity, 1); assert.equal((await ProductVariant.findById(variant._id)).stockOnHand, 10)
  assert.ok(await mongoose.connection.db.collection('sessions').countDocuments() > 0)
  console.log('PASS: one order, customer/session persistence and exact stock restoration verified directly in MongoDB.')
  const samples = [], statuses = []
  for (let batch = 0; batch < 10; batch++) await Promise.all(Array.from({ length: 5 }, async () => {
    const start = performance.now(), response = await fetch('http://127.0.0.1:5444/api/products?limit=20')
    await response.arrayBuffer(); samples.push(performance.now() - start); statuses.push(response.status)
  }))
  assert.ok(statuses.every(status => status === 200)); samples.sort((a, b) => a - b)
  const report = { scenario: 'Local production API + real disposable MongoDB; one product; 50 requests; concurrency 5. Not a hosting capacity estimate.', productionReadyMs, requests: 50, errors: 0, p50Ms: samples[24], p95Ms: samples[47], p99Ms: samples[49], orderCount: orders.length, inventoryMovements: await InventoryMovement.countDocuments() }
  await mkdir(path.join(root, 'reports'), { recursive: true }); await writeFile(path.join(root, 'reports/live-commerce.json'), JSON.stringify(report, null, 2) + '\n')
  await requestChildShutdown(child)
  const stopped = await Promise.race([childExit, new Promise(resolve => { const timer = setTimeout(() => resolve(null), 30000); timer.unref() })])
  assert.deepEqual(stopped, { code: 0, signal: null }); console.log(`PASS: production process drains and exits cleanly via ${process.platform === 'win32' ? 'IPC shutdown' : 'SIGTERM'}.`)
} catch (error) { console.error(error); process.exitCode = 1 }
finally {
  if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)) }
  if (child && child.exitCode === null && child.signalCode === null) { await requestChildShutdown(child); await childExit }
  await mongoose.disconnect(); await replica?.stop(); await rm(directory, { recursive: true, force: true })
}
