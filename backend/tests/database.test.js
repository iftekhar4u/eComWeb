import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getConfig, getMongoUri } from '../config/env.js'
import { migrateDatabase } from '../db/migrate.js'
import { applicationCollectionNames } from '../db/collectionDefinitions.js'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { ProductVariant } from '../models/domainModels.js'
import { createApp } from '../app.js'

const config = getConfig({ ...process.env, NODE_ENV: 'test' })
const uri = getMongoUri(config, 'test')
const databaseName = new URL(uri).pathname.slice(1)
if (databaseName !== 'aurelia_test') throw new Error('Database tests are restricted to aurelia_test')

const validProduct = () => ({ name: 'Test Cleanser', slug: `test-cleanser-${Date.now()}-${Math.random().toString(16).slice(2)}`, brand: 'AURELIA', category: 'skincare', price: 129900, stock: 10, status: 'draft' })

describe('real MongoDB schema and index enforcement', () => {
  beforeAll(async () => {
    await migrateDatabase({ uri })
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 })
    for (const name of applicationCollectionNames) await mongoose.connection.db.collection(name).deleteMany({})
  })

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 })
    for (const name of applicationCollectionNames) await mongoose.connection.db.collection(name).deleteMany({})
    await mongoose.disconnect()
  })

  it('accepts valid application writes with integer paise', async () => {
    const product = await Product.create(validProduct())
    expect(product.price).toBe(129900)
    expect(Number.isInteger(product.price)).toBe(true)
    const variant = await ProductVariant.create({ product: product._id, sku: `TEST-${Date.now()}`, price: 129900, stockOnHand: 10, reservedQuantity: 0 })
    expect(variant.reservedQuantity).toBe(0)
  })

  it('rejects invalid raw product documents at the database layer', async () => {
    const base = { name: 'Raw invalid', slug: `raw-${Date.now()}`, brand: 'AURELIA', category: 'skincare', price: 100, stock: 0, status: 'draft' }
    await expect(mongoose.connection.db.collection('products').insertOne({ ...base, price: 100.5 })).rejects.toThrow()
    await expect(mongoose.connection.db.collection('products').insertOne({ ...base, slug: `${base.slug}-unknown`, unexpected: true })).rejects.toThrow()
  })

  it('rejects negative stock and reservations greater than stock', async () => {
    await expect(Product.create({ ...validProduct(), slug: `negative-${Date.now()}`, stock: -1 })).rejects.toThrow()
    const product = await Product.create(validProduct())
    await expect(mongoose.connection.db.collection('product_variants').insertOne({ product: product._id, sku: `BAD-${Date.now()}`, price: 100, stockOnHand: 1, reservedQuantity: 2 })).rejects.toThrow()
  })

  it('enforces normalized unique email and product SKU indexes', async () => {
    const password = 'argon2id-test-hash'
    await User.create({ name: 'First Customer', email: 'duplicate@example.com', password })
    await expect(User.create({ name: 'Second Customer', email: 'duplicate@example.com', password })).rejects.toMatchObject({ code: 11000 })
    const first = await Product.create({ ...validProduct(), slug: `sku-a-${Date.now()}`, sku: 'DUPLICATE-SKU' })
    await expect(Product.create({ ...validProduct(), slug: `sku-b-${Date.now()}`, sku: first.sku })).rejects.toMatchObject({ code: 11000 })
  })

  it('accepts Google-only users without creating a local password and rejects duplicate identities', async () => {
    const googleUser = await User.create({ name: 'Google Customer', email: 'google@example.com', google: { issuer: 'https://accounts.google.com', subject: 'google-subject-1', linkedAt: new Date() } })
    expect(googleUser.password).toBeUndefined()
    await expect(User.create({ name: 'Duplicate Google Customer', email: 'other@example.com', google: { issuer: 'https://accounts.google.com', subject: 'google-subject-1', linkedAt: new Date() } })).rejects.toMatchObject({ code: 11000 })
  })

  it('preserves data when the migration is rerun', async () => {
    const product = await Product.create(validProduct())
    const before = await Product.countDocuments({ _id: product._id })
    await mongoose.disconnect()
    const result = await migrateDatabase({ uri })
    expect(result.conflicts).toHaveLength(0)
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 })
    expect(await Product.countDocuments({ _id: product._id })).toBe(before)
  })

  it('reports transaction capability instead of pretending standalone MongoDB is transactional', async () => {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 })
    if (!hello.setName) {
      console.warn('TRANSACTION TEST NOT RUN: aurelia_test is on a standalone MongoDB instance')
      expect(hello.setName || null).toBeNull()
      return
    }
    const session = await mongoose.startSession()
    await session.withTransaction(async () => {})
    await session.endSession()
    expect(hello.setName).toBeTruthy()
  })

  it('supports local Passport registration, current-user restoration, and logout', async () => {
    const agent = (await import('supertest')).default.agent(createApp({ config: { NODE_ENV: 'test', PORT: 5000, CLIENT_URL: 'http://localhost:5173', TRUST_PROXY: 0, SESSION_SECRET: 'test-session-secret-test-session-secret', MONGO_URI: uri, GOOGLE_AUTH_ENABLED: false } }))
    const csrf = await agent.get('/api/v1/auth/csrf-token')
    const registered = await agent.post('/api/v1/auth/register').set('X-CSRF-Token', csrf.body.csrfToken).send({ name: 'Local Customer', email: 'local-passport@example.com', password: 'local-password-123' })
    expect(registered.status).toBe(201)
    expect(registered.body.user.role).toBe('customer')
    expect(registered.body.user).not.toHaveProperty('password')
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200)
    const logout = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', registered.body.csrfToken)
    expect(logout.status).toBe(200)
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401)
  })
})
