import mongoose from 'mongoose'
import { getConfig, getMongoUri } from '../config/env.js'
import Product from '../models/Product.js'
import { ProductVariant } from '../models/domainModels.js'

if (!process.argv.includes('--confirm-seed')) throw new Error('Seeding is opt-in. Re-run with --confirm-seed')
const config = getConfig({ ...process.env, NODE_ENV: 'development' })
const uri = getMongoUri(config, 'development')
if (new URL(uri).pathname.slice(1) !== 'aurelia_dev') throw new Error('Seeding is restricted to aurelia_dev')
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false })
const existing = await Product.countDocuments()
if (existing > 0) throw new Error('Refusing to seed a non-empty product collection')
const product = await Product.create({ name: 'Aurelia Botanical Cleanser', slug: 'aurelia-botanical-cleanser', brand: 'AURELIA', category: 'skincare', price: 129900, stock: 100, sku: 'AUR-CLEAN-100', status: 'draft', description: 'Development-only catalog fixture.' })
await ProductVariant.create({ product: product._id, sku: 'AUR-CLEAN-100-V1', price: 129900, stockOnHand: 100, reservedQuantity: 0, active: true })
console.log(JSON.stringify({ seeded: true, productId: product._id.toString(), pricePaise: 129900 }))
await mongoose.disconnect()
