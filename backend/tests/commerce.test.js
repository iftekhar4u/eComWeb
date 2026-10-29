import { PaymentAttempt, Refund } from '../payments/models.js'
import { createPaymentWorker } from '../payments/worker.js'
import { cancelOrder, fulfillOrder } from '../payments/lifecycle.js'
import { requestRefund } from '../payments/refunds.js'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import argon2 from 'argon2'
import request from 'supertest'
import { generate } from 'otplib'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { getConfig } from '../config/env.js'
import { migrateDatabase } from '../db/migrate.js'
import { applicationCollectionNames } from '../db/collectionDefinitions.js'
import { seedStorefront } from '../scripts/seed-storefront.js'
import { createRazorpay } from '../services/razorpay.js'
import { quote, createOrder, reconcilePayment, cancelUnpaid, assertTransactions } from '../services/commerce.js'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { ProductVariant, Payment, Order, InventoryMovement, PaymentEvent, Category } from '../models/domainModels.js'

// This provider double exists only in tests. The running application has no fake-payment switch.
function provider() {
  let count = 0
  const orders = new Map(), payments = new Map()
  const keys = { RAZORPAY_KEY_ID:'rzp_test_Contract', RAZORPAY_KEY_SECRET:'test-provider-secret', RAZORPAY_WEBHOOK_SECRET:'test-webhook-secret' }
  return { ...createRazorpay(keys), orders, payments, keys, accountId:'acc_Test', credentialProfileId:'fixture-profile',
    async fetchOrder(id) { return orders.get(id) },
    async paymentRefunds() { return {items:[]} },
    async createOrder(local) { const o = { id:`order_${++count}`, amount:local.totalPaise, currency:'INR', receipt:local.orderNumber, notes:{localOrderId:String(local._id)} }; orders.set(o.id,o); return o },
    async findOrders(receipt) { return { items:[...orders.values()].filter(o=>o.receipt===receipt) } },
    async fetchPayment(id) { if (!payments.has(id)) throw new Error('Unknown test payment'); return {...payments.get(id)} },
    async orderPayments(id) { return { items:[...payments.values()].filter(p=>p.order_id===id) } },
    async capture(id) { const p = payments.get(id); p.status='captured'; return {...p} },
    pay(o, status='captured', overrides={}) { const p = { id:`pay_${payments.size+1}`, order_id:o.checkout.order_id, amount:o.order.totalPaise, currency:'INR', status, amount_refunded:0, ...overrides }; payments.set(p.id,p); return p },
  }
}
const config = { NODE_ENV:'test', CLIENT_URL:'http://localhost:5173', TRUST_PROXY:0, SESSION_SECRET:'integration-session-secret-32-characters', COD_ENABLED:true, CHECKOUT_RESERVATION_MINUTES:30 }
const address = { name:'QA Customer',line1:'10 Example Road',line2:'',city:'Delhi',state:'Delhi',postalCode:'110001',country:'IN',phone:'9876543210' }
const password = 'test-password-12345'
let gateway, app, customer, other, admin, variant, agent, csrf, connected = false
const uri = getConfig({...process.env,NODE_ENV:'test'}).MONGO_TEST_URI
const enabled = process.env.RUN_DB_TESTS === '1'
if (enabled && new URL(uri).pathname !== '/aurelia_test') throw new Error('Commerce tests may use only the disposable aurelia_test database')
const write = (method,path,body) => agent[method](path).set('X-CSRF-Token',csrf).send(body)
async function input(overrides={}) { const items=[{variantId:String(variant._id),quantity:1}]; const totals=await quote(items); return {items,deliveryAddress:address,paymentMethod:'razorpay',idempotencyKey:crypto.randomUUID(),expectedTotalPaise:totals.totalPaise,...overrides} }
async function place(overrides={}) { return createOrder(customer._id,await input(overrides),config,gateway) }
async function paymentFor(o) { return Payment.findOne({order:o.order._id}) }

describe.skipIf(!enabled)('transactional commerce on a real disposable MongoDB replica set', () => {
  beforeAll(async () => {
    await migrateDatabase({uri})
    await mongoose.connect(uri,{autoIndex:false,serverSelectionTimeoutMS:5000}); connected=true
    await assertTransactions()
    for (const name of applicationCollectionNames) await mongoose.connection.db.collection(name).deleteMany({})
    const hash=await argon2.hash(password)
    admin=await User.create({name:'QA Admin',email:'admin@example.test',password:hash,role:'admin'})
    customer=await User.create({name:'QA Customer',email:'customer@example.test',password:hash})
    other=await User.create({name:'Other Customer',email:'other@example.test',password:hash})
    await seedStorefront(admin._id)
    variant=await ProductVariant.findOne().sort({createdAt:1})
    gateway=provider(); app=createApp({config,gateway}); agent=request.agent(app)
    const token=await agent.get('/api/auth/csrf-token')
    const login=await agent.post('/api/auth/login').set('X-CSRF-Token',token.body.csrfToken).send({email:customer.email,password})
    expect(login.status).toBe(200); csrf=login.body.csrfToken
  },30000)
  beforeEach(async () => {
    for (const name of ['orders','payments','payment_events','inventory_reservations','inventory_movements','payment_attempts','refunds','payment_jobs','commerce_operations','carts']) await mongoose.connection.db.collection(name).deleteMany({})
    await ProductVariant.updateMany({},{$set:{stockOnHand:25,reservedQuantity:0}})
    gateway.orders.clear(); gateway.payments.clear()
  })
  afterAll(async () => {
    if (connected) { for (const name of applicationCollectionNames) await mongoose.connection.db.collection(name).deleteMany({}); await mongoose.disconnect() }
  })
  it('seeds original content idempotently and preserves existing edits', async () => {
    const before=await Product.countDocuments()
    await Category.updateOne({slug:'skin-care'},{$set:{description:'Operator edited description'}})
    await seedStorefront(admin._id)
    expect(await Product.countDocuments()).toBe(before)
    expect((await Category.findOne({slug:'skin-care'})).description).toBe('Operator edited description')
  })
  it('prices on the server and rejects changed totals before reserving stock', async () => {
    await expect(place({expectedTotalPaise:1})).rejects.toMatchObject({status:409})
    expect(await Order.countDocuments()).toBe(0)
    expect((await ProductVariant.findById(variant._id)).reservedQuantity).toBe(0)
  })
  it('reuses the same order, provider order and reservation on a duplicate submit', async () => {
    const details=await input(); const first=await createOrder(customer._id,details,config,gateway); const second=await createOrder(customer._id,details,config,gateway)
    expect(String(first.order._id)).toBe(String(second.order._id)); expect(gateway.orders.size).toBe(1)
    expect((await ProductVariant.findById(variant._id)).reservedQuantity).toBe(1)
    await expect(createOrder(customer._id,{...details,deliveryAddress:{...address,city:'Noida'}},config,gateway)).rejects.toMatchObject({status:409})
  })
  it('allows only one of two customers to reserve the last unit', async () => {
    await ProductVariant.updateOne({_id:variant._id},{$set:{stockOnHand:1}})
    const a=await input(), b=await input()
    const results=await Promise.allSettled([createOrder(customer._id,a,config,gateway),createOrder(other._id,b,config,gateway)])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(await Order.countDocuments()).toBe(1)
    expect((await ProductVariant.findById(variant._id)).reservedQuantity).toBe(1)
  })
  it('consumes stock only after captured evidence and only once across repeated events', async () => {
    const order=await place(), payment=await paymentFor(order), remote=gateway.pay(order,'captured')
    const event={id:'evt_1',hash:'a'.repeat(64)}
    await reconcilePayment(payment,gateway,remote.id,event); await reconcilePayment(payment,gateway,remote.id,event)
    const saved=await Order.findById(order.order._id), stock=await ProductVariant.findById(variant._id)
    expect(saved.paymentStatus).toBe('paid'); expect(saved.inventoryStatus).toBe('committed')
    expect(stock.stockOnHand).toBe(24); expect(stock.reservedQuantity).toBe(0)
    expect(await InventoryMovement.countDocuments({reason:'purchase'})).toBe(1)
    expect(await PaymentEvent.countDocuments()).toBe(1)
  })
  it('does not mark an order paid for a different amount, currency or provider order', async () => {
    const order=await place(), payment=await paymentFor(order)
    for (const changed of [{amount:1},{currency:'USD'},{order_id:'order_another'}]) { const remote=gateway.pay(order,'captured',changed); await expect(reconcilePayment(payment,gateway,remote.id)).rejects.toMatchObject({status:400}) }
    expect((await Order.findById(order.order._id)).paymentStatus).toBe('pending')
  })
  it('does not downgrade a captured payment when an older failed attempt arrives', async () => {
    const order=await place(), payment=await paymentFor(order), captured=gateway.pay(order)
    await reconcilePayment(payment,gateway,captured.id)
    const failed=gateway.pay(order,'failed'); await reconcilePayment(payment,gateway,failed.id)
    expect((await Order.findById(order.order._id)).paymentStatus).toBe('paid')
  })
  it('releases expired reservations once and queues a late-capture refund without overselling', async () => {
    const order=await place(), payment=await paymentFor(order)
    await Order.updateOne({_id:order.order._id},{$set:{expiresAt:new Date(Date.now()-1000)}})
    await cancelUnpaid(await Order.findById(order.order._id),gateway,{expired:true})
    await cancelUnpaid(await Order.findById(order.order._id),gateway,{expired:true})
    const remote=gateway.pay(order); await reconcilePayment(payment,gateway,remote.id)
    expect((await Order.findById(order.order._id)).inventoryStatus).toBe('released')
    expect(await Refund.countDocuments({order:order.order._id})).toBe(1)
    const stock=await ProductVariant.findById(variant._id); expect(stock.stockOnHand).toBe(25); expect(stock.reservedQuantity).toBe(0)
  })
  it('reconciles a timed-out provider create by receipt, without creating a second order', async () => {
    const create=gateway.createOrder
    gateway.createOrder=async o=>{await create(o); throw Object.assign(new Error('timeout'),{status:503})}
    const details=await input()
    await expect(createOrder(customer._id,details,config,gateway)).rejects.toMatchObject({status:503})
    gateway.createOrder=create
    await Payment.updateMany({},{$set:{initializationStartedAt:new Date(Date.now()-30000)}})
    const result=await createOrder(customer._id,details,config,gateway)
    expect(result.checkout.order_id).toBeTruthy(); expect(gateway.orders.size).toBe(1)
  })
  it('tracks partial and full refunds without automatically restocking uninspected items', async () => {
    const order=await place(), payment=await paymentFor(order), remote=gateway.pay(order)
    await reconcilePayment(payment,gateway,remote.id)
    remote.amount_refunded=100; await reconcilePayment(payment,gateway,remote.id)
    expect((await Order.findById(order.order._id)).refundedPaise).toBe(100)
    remote.amount_refunded=remote.amount; remote.status='refunded'; await reconcilePayment(payment,gateway,remote.id)
    expect((await Order.findById(order.order._id)).paymentStatus).toBe('refunded')
    expect((await ProductVariant.findById(variant._id)).stockOnHand).toBe(24)
  })
  it('enforces order ownership, admin privileges and callback signatures through HTTP', async () => {
    const foreign=await createOrder(other._id,await input(),config,gateway)
    expect((await agent.get(`/api/orders/${foreign.order._id}`)).status).toBe(404)
    expect((await agent.get('/api/admin/dashboard')).status).toBe(403)
    const own=await place()
    const response=await write('post',`/api/orders/${own.order._id}/verify`,{razorpay_order_id:own.checkout.order_id,razorpay_payment_id:'pay_123',razorpay_signature:'0'.repeat(64)})
    expect(response.status).toBe(400)
  })
  it('saves cart, wishlist and shipping addresses to the authenticated account', async () => {
    expect((await write('put','/api/cart',{version:0,items:[{variantId:String(variant._id),quantity:2}]})).status).toBe(200)
    expect((await agent.get('/api/cart')).body.items[0].quantity).toBe(2)
    expect((await write('put','/api/wishlist',{productIds:[String(variant.product)]})).status).toBe(200)
    expect((await agent.get('/api/wishlist')).body.items).toHaveLength(1)
    expect((await write('post','/api/auth/addresses',address)).status).toBe(201)
    expect((await agent.get('/api/auth/addresses')).body.addresses).toHaveLength(1)
  })
  it('denies invalid admin OTPs, accepts the authenticator and blocks unpaid fulfillment', async () => {
    const adminAgent=request.agent(app), token=await adminAgent.get('/api/auth/csrf-token')
    const login=await adminAgent.post('/api/auth/login').set('X-CSRF-Token',token.body.csrfToken).send({email:admin.email,password})
    let key=login.body.csrfToken
    expect((await adminAgent.get('/api/admin/dashboard')).status).toBe(403)
    const setup=await adminAgent.post('/api/auth/mfa/setup').set('X-CSRF-Token',key).send({})
    expect(setup.status).toBe(200)
    const code=await generate({secret:setup.body.secret})
    const invalid=code==='000000'?'111111':'000000'
    expect((await adminAgent.post('/api/auth/mfa/verify').set('X-CSRF-Token',key).send({code:invalid})).status).toBe(401)
    const verified=await adminAgent.post('/api/auth/mfa/verify').set('X-CSRF-Token',key).send({code})
    expect(verified.status).toBe(200)
    expect(verified.body.csrfToken).not.toBe(key)
    key=verified.body.csrfToken
    expect((await adminAgent.get('/api/admin/dashboard')).status).toBe(200)
    const order=await place()
    expect((await adminAgent.patch(`/api/admin/orders/${order.order._id}`).set('X-CSRF-Token',key).send({fulfillmentStatus:'shipped'})).status).toBe(409)
  })
  it('handles signed duplicate webhooks without duplicate stock movements', async () => {
    const order=await place(), remote=gateway.pay(order), body=JSON.stringify({account_id:'acc_Test',event:'payment.captured',payload:{payment:{entity:{id:remote.id}}}})
    const signature=crypto.createHmac('sha256',gateway.keys.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')
    for (let i=0;i<2;i++) expect((await request(app).post('/api/payments/razorpay/webhook').set('Content-Type','application/json').set('x-razorpay-signature',signature).set('x-razorpay-event-id','evt_http').send(body)).status).toBe(200)
    expect(await InventoryMovement.countDocuments({reason:'purchase'})).toBe(0)
    await createPaymentWorker(app.locals.payments).tick()
    expect(await InventoryMovement.countDocuments({reason:'purchase'})).toBe(1)
  })
  it('keeps online checkout disabled without credentials and supports explicitly enabled COD', async () => {
    const details=await input()
    await expect(createOrder(customer._id,details,config,createRazorpay({}))).rejects.toMatchObject({status:503})
    const cod=await place({paymentMethod:'cod'})
    expect(cod.order.paymentStatus).toBe('pending'); expect(cod.order.inventoryStatus).toBe('committed')
    expect(cod.checkout).toBeUndefined()
  })
  it('serializes concurrent refund commitments below captured value', async()=>{
    const result=await place(), p=await paymentFor(result), remote=gateway.pay(result)
    await reconcilePayment(p,gateway,remote.id)
    const attempt=await PaymentAttempt.findOne({order:result.order._id}), amountPaise=Math.ceil(result.order.totalPaise*.75)
    const outcomes=await Promise.allSettled([1,2].map(()=>requestRefund(result.order._id,{attemptId:attempt._id,amountPaise,operationKey:crypto.randomUUID(),reason:'Concurrent partial refund'},admin._id)))
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(await Refund.countDocuments()).toBe(1)
  })
  it('restores paid cancellation stock once across two simultaneous requests',async()=>{
    const result=await place(),p=await paymentFor(result),remote=gateway.pay(result)
    await reconcilePayment(p,gateway,remote.id)
    await Promise.all([cancelOrder(result.order._id,{actor:customer._id}),cancelOrder(result.order._id,{actor:customer._id})])
    expect((await ProductVariant.findById(variant._id)).stockOnHand).toBe(25)
    expect(await InventoryMovement.countDocuments({reason:'return'})).toBe(1)
    expect(await Refund.countDocuments()).toBe(1)
    await expect(fulfillOrder(result.order._id,{fulfillmentStatus:'shipped',trackingNumber:'TRACK'},admin._id)).rejects.toMatchObject({status:409})
  })
  it('rejects raw COD monetary inconsistencies with MongoDB validators',async()=>{
    const result=await place({paymentMethod:'cod'})
    await expect(mongoose.connection.db.collection('orders').updateOne({_id:result.order._id},{$set:{codFeePaise:100}})).rejects.toMatchObject({code:121})
    await expect(mongoose.connection.db.collection('orders').updateOne({_id:result.order._id},{$set:{codCollectedPaise:result.order.totalPaise+1}})).rejects.toMatchObject({code:121})
  })

})
