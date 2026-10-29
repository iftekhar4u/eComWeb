import { notification, queueOrderNotifications, scheduleOrder } from '../payments/outbox.js'
import { PaymentAttempt, PaymentSettings } from '../payments/models.js'
import { applyMethodPolicy } from '../payments/policy.js'
import { ensureAutomaticRefunds, syncRefunds } from '../payments/refunds.js'
import { cancelOrder, lockCustomer } from '../payments/lifecycle.js'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import Product from '../models/Product.js'
import { Order, Payment, ProductVariant, InventoryReservation, InventoryMovement, SiteSettings, PaymentEvent, Cart } from '../models/domainModels.js'
import { fail } from './validation.js'

export async function assertTransactions() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 })
  if (!hello.setName && hello.msg !== 'isdbgrid') throw fail(503, 'Checkout needs MongoDB Atlas or a replica set. Follow the database setup in README.')
}
export async function transaction(work) {
  await assertTransactions()
  const session = await mongoose.startSession()
  try { return await session.withTransaction(() => work(session)) } finally { await session.endSession() }
}
export async function quote(items, session = null) {
  const settings = await SiteSettings.findOne({ key: 'site' }).session(session).lean()
  const lines = []
  for (const input of items) {
    const variant = await ProductVariant.findOne({ _id: input.variantId, active: true }).session(session)
    const product = variant && await Product.findOne({ _id: variant.product, status: 'published' }).session(session)
    if (!product || !variant) throw fail(409, 'A product is no longer available. Please update your bag.')
    if (variant.stockOnHand - variant.reservedQuantity < input.quantity) throw fail(409, `Not enough stock for ${product.name}. Please update your bag.`)
    lines.push({ variant: variant._id, sku: variant.sku, name: product.name, quantity: input.quantity, unitPricePaise: variant.price, lineTotalPaise: variant.price * input.quantity })
  }
  const subtotalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0)
  const shippingPaise = subtotalPaise >= (settings?.freeShippingThresholdPaise ?? 99900) ? 0 : (settings?.shippingPaise ?? 9900)
  const totalPaise = subtotalPaise + shippingPaise
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 100 || totalPaise > 100000000) throw fail(400, 'Order total must be between Rs. 1 and Rs. 10,00,000.')
  return { items: lines, subtotalPaise, shippingPaise, discountPaise: 0, totalPaise, currency: 'INR' }
}

export async function createOrder(customer, input, config, gateway) {
  const policy = config.paymentPolicy || new PaymentSettings({ policy: { prepaidEnabled: Boolean(gateway.enabled), codEnabled: Boolean(config.COD_ENABLED), reservationMinutes: config.CHECKOUT_RESERVATION_MINUTES || 30 } }).policy.toObject()
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ ...input, items: [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId)) })).digest('hex')
  let order = await Order.findOne({ customer, idempotencyKey: input.idempotencyKey })
  if (!order) {
    if (input.paymentMethod === 'razorpay' && !gateway.enabled) throw fail(503, 'Online payments are not configured yet.')
    try {
      order = await transaction(async session => {
        await lockCustomer(customer, session)
        if (input.paymentMethod === 'cod' && await Order.countDocuments({ customer, paymentMethod: 'cod', fulfillmentStatus: { $in: ['pending','processing','shipped'] } }).session(session) >= policy.codMaxOpenOrders) throw fail(409, 'Complete or cancel an existing cash-on-delivery order first.')
        const pending = await Order.countDocuments({ customer, paymentMethod: 'razorpay', inventoryStatus: 'reserved' }).session(session)
        if (pending >= 5) throw fail(409, 'Please complete or cancel an existing pending order first.')
        const totals = applyMethodPolicy(await quote(input.items, session), input.paymentMethod, input.deliveryAddress, policy)
        if (input.expectedTotalPaise !== totals.totalPaise) throw fail(409, 'Your order total changed. Refresh checkout before paying.')
        const placedAt = new Date()
        const cart = await Cart.findOne({ customer }).session(session)
        const [created] = await Order.create([{ ...totals, placedAt, cancellationDeadline: new Date(placedAt.getTime() + policy.cancellationHours * 3600000), policyRevision: config.paymentRevision || 0, paymentEnvironment: input.paymentMethod === 'cod' ? policy.activeMode : gateway.environment, accountId: gateway.accountId, credentialProfileId: gateway.credentialProfileId, cartVersion: input.cartVersion === (cart?.__v || 0) ? input.cartVersion : undefined, customer, requestHash, idempotencyKey: input.idempotencyKey, deliveryAddress: input.deliveryAddress, paymentMethod: input.paymentMethod, orderNumber: `AUR-${crypto.randomBytes(10).toString('hex').toUpperCase()}`, expiresAt: new Date(Date.now() + policy.reservationMinutes * 60000) }], { session })
        for (const item of totals.items) {
          const reserved = await ProductVariant.updateOne({ _id: item.variant, active: true, $expr: { $gte: [{ $subtract: ['$stockOnHand', '$reservedQuantity'] }, item.quantity] } }, { $inc: { reservedQuantity: item.quantity } }, { session })
          if (!reserved.modifiedCount) throw fail(409, `${item.name} is no longer available in that quantity.`)
          await InventoryReservation.create([{ order: created._id, variant: item.variant, quantity: item.quantity, expiresAt: created.expiresAt }], { session })
        }
        if (input.paymentMethod === 'cod') {
          await consumeStock(created, session)
          created.inventoryStatus = 'committed'; created.fulfillmentStatus = 'processing'
          await created.save({ session })
          await notification('order_confirmation', created, session)
        } else { await Payment.create([{ accountId: gateway.accountId || 'legacy', credentialProfileId: gateway.credentialProfileId, order: created._id, provider: 'razorpay', environment: gateway.environment, amountPaise: created.totalPaise, currency: 'INR' }], { session }); await scheduleOrder(created._id, session) }
        return created
      })
    } catch (error) {
      if (error.code !== 11000) throw error
      order = await Order.findOne({ customer, idempotencyKey: input.idempotencyKey })
      if (!order) throw error
    }
  }
  if (order.requestHash !== requestHash) throw fail(409, 'This checkout key belongs to different order details. Start a new checkout.')
  if (order.paymentMethod === 'cod' || order.paymentStatus === 'paid') return { order: order.toObject() }
  if (order.inventoryStatus !== 'reserved' || order.expiresAt < new Date()) throw fail(409, 'This checkout expired or was cancelled. Start a new checkout from your bag.')
  try {
    const payment = await initializePayment(order, gateway)
    const current = await Order.findById(order._id)
    if (current.fulfillmentStatus === 'cancelled') throw fail(409, 'This checkout was cancelled. Its payment outcome will be reconciled.')
    return checkoutResponse(current, payment, gateway)
  } catch (error) { error.orderId = String(order._id); throw error }
}

export function checkoutResponse(order, payment, gateway) {
  if (payment.environment !== gateway.environment) throw fail(409, 'This order belongs to another payment environment.')
  return { order: order.toObject ? order.toObject() : order, checkout: { key: gateway.keyId, order_id: payment.providerOrderId, amount: payment.amountPaise, currency: 'INR', ...(gateway.appearance || {}) } }
}
export async function initializePayment(order, gateway) {
  let payment = await Payment.findOne({ order: order._id })
  if (payment.environment !== gateway.environment) throw fail(409, 'Payment environment changed for this order.')
  if (payment.providerOrderId) return payment
  // Claim initialization durably. An ambiguous timeout is reconciled by receipt; never create a second provider order for the same local order.
  const claimed = await transaction(async session => {
    const fresh = await Order.findById(order._id).session(session)
    const current = await Payment.findById(payment._id).session(session)
    if (current.initializationStartedAt) return null
    if (fresh.fulfillmentStatus === 'cancelled' || fresh.inventoryStatus !== 'reserved' || fresh.expiresAt < new Date()) throw fail(409, 'Checkout is no longer payable.')
    current.status = 'pending'; current.initializationStartedAt = new Date()
    fresh.financialRevision = (fresh.financialRevision || 0) + 1
    await fresh.save({ session }); await current.save({ session })
    return current
  })
  let remote
  if (claimed) remote = await gateway.createOrder(order)
  else {
    if (Date.now() - new Date(payment.initializationStartedAt).getTime() < 20000) throw fail(409, 'Payment checkout is being prepared. Check this order again shortly.')
    const result = await gateway.findOrders(order.orderNumber)
    const matches = result.items?.filter(o => o.receipt === order.orderNumber && o.notes?.localOrderId === String(order._id) && o.amount === order.totalPaise && o.currency === 'INR') || []
    if (matches.length > 1) throw fail(409, 'Multiple provider orders match this purchase. Manual review is required.')
    remote = matches[0]
    if (!remote) throw fail(503, 'Payment preparation is unresolved. Check this order later or cancel it before starting again.')
  }
  if (!remote?.id || remote.amount !== order.totalPaise || remote.currency !== 'INR') throw fail(502, 'Payment order details do not match.')
  payment = await Payment.findOneAndUpdate({ _id: payment._id, providerOrderId: { $exists: false } }, { $set: { providerOrderId: remote.id } }, { new: true }) || await Payment.findOne({ order: order._id })
  return payment
}
async function consumeStock(order, session) {
  for (const item of order.items) {
    const reservation = await InventoryReservation.findOneAndUpdate({ order: order._id, variant: item.variant, state: 'active' }, { $set: { state: 'consumed' } }, { session, new: true })
    if (!reservation) throw fail(409, 'Inventory reservation requires review.')
    const variant = await ProductVariant.findOneAndUpdate({ _id: item.variant, stockOnHand: { $gte: item.quantity }, reservedQuantity: { $gte: item.quantity } }, { $inc: { stockOnHand: -item.quantity, reservedQuantity: -item.quantity } }, { session, new: true })
    if (!variant) throw fail(409, 'Inventory requires review.')
    await Product.updateOne({ _id: variant.product }, { $set: { stock: variant.stockOnHand }, $inc: { __v: 1 } }, { session })
    await InventoryMovement.create([{ variant: item.variant, delta: -item.quantity, reason: 'purchase', order: order._id }], { session })
  }
}
export async function releaseStock(order, session, state = 'released') {
  for (const item of order.items) {
    const released = await InventoryReservation.findOneAndUpdate({ order: order._id, variant: item.variant, state: 'active' }, { $set: { state, releasedAt: new Date() } }, { session, new: true })
    if (released) {
      const updated = await ProductVariant.updateOne({ _id: item.variant, reservedQuantity: { $gte: item.quantity } }, { $inc: { reservedQuantity: -item.quantity } }, { session })
      if (!updated.modifiedCount) throw fail(409, 'Inventory reservation requires review.')
    }
  }
}
export function validatePayment(payment, remote) {
  if (!/^pay_[a-zA-Z0-9]+$/.test(remote?.id || '') || remote.order_id !== payment.providerOrderId || remote.amount !== payment.amountPaise || remote.currency !== payment.currency || !Number.isSafeInteger(remote.amount_refunded || 0) || (remote.amount_refunded || 0) < 0 || (remote.amount_refunded || 0) > remote.amount) throw fail(400, 'Payment amount, currency or order does not match.')
}
export async function reconcilePayment(payment, gateway, remotePaymentId, event) {
  if (payment.environment !== gateway.environment || payment.accountId && gateway.accountId && payment.accountId !== gateway.accountId) throw fail(409, 'Payment context mismatch.')
  const remote = await gateway.fetchPayment(remotePaymentId)
  if (remote.id !== remotePaymentId) throw fail(400, 'Payment identity mismatch.')
  validatePayment(payment, remote)
  // Automatic capture is configured at Razorpay. Reconciliation and cancellation
  // deliberately NEVER initiate capture; an authorization is not a paid order.
  return transaction(async session => {
    const current = await Payment.findById(payment._id).session(session)
    const order = await Order.findById(current.order).session(session)
    const before = { paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, refundedPaise: order.refundedPaise }
    if (event) {
      const prior = await PaymentEvent.findOne({ provider: 'razorpay', accountId: gateway.accountId || 'legacy', environment: gateway.environment, providerEventId: event.id }).session(session)
      if (prior && prior.payloadHash !== event.hash) throw fail(400, 'Webhook event contents changed.')
      if (prior?.state === 'processed') return order
    }
    let attempt = await PaymentAttempt.findOne({ accountId: current.accountId || gateway.accountId || 'legacy', environment: current.environment, providerPaymentId: remote.id }).session(session)
    if (attempt && String(attempt.order) !== String(order._id)) throw fail(409, 'Payment is already associated with another order.')
    if (!attempt) attempt = new PaymentAttempt({ order: order._id, payment: current._id, providerOrderId: current.providerOrderId, providerPaymentId: remote.id, accountId: current.accountId || gateway.accountId || 'legacy', credentialProfileId: current.credentialProfileId, environment: current.environment, amountPaise: remote.amount, refundedPaise: current.providerPaymentId === remote.id ? Math.min(current.amountPaise, order.refundedPaise || 0) : 0, currency: 'INR' })
    const captured = ['captured','refunded'].includes(remote.status)
    if (captured) {
      attempt.capturedAt ||= new Date()
      attempt.refundedPaise = Math.max(attempt.refundedPaise, remote.amount_refunded || 0)
      attempt.status = attempt.refundedPaise === attempt.amountPaise ? 'refunded' : 'captured'
      if (!current.providerPaymentId) current.providerPaymentId = remote.id
      if (current.providerPaymentId === remote.id) {
        if (order.inventoryStatus === 'reserved') {
          if (attempt.status === 'refunded' || order.fulfillmentStatus === 'cancelled') { await releaseStock(order, session); order.inventoryStatus = 'released' }
          else { await consumeStock(order, session); order.inventoryStatus = 'committed' }
        } else if (order.inventoryStatus === 'released' && order.fulfillmentStatus !== 'cancelled' && attempt.status !== 'refunded') order.inventoryStatus = 'review'
        if (attempt.status === 'refunded' && ['pending','processing'].includes(order.fulfillmentStatus)) order.fulfillmentStatus = 'cancelled'
        else if (order.inventoryStatus === 'committed' && order.fulfillmentStatus === 'pending') order.fulfillmentStatus = 'processing'
        current.status = attempt.status === 'refunded' ? 'refunded' : 'succeeded'
      }
      await current.save({ session })
    } else if (!['captured','refunded'].includes(attempt.status)) {
      if (['created','authorized','failed'].includes(remote.status)) attempt.status = remote.status
      if (remote.status === 'authorized' && !['paid','refunded'].includes(order.paymentStatus)) order.paymentStatus = 'authorized'
    }
    attempt.lastCheckedAt = new Date(); await attempt.save({ session })
    await ensureAutomaticRefunds(order, session)
    if (order.paymentStatus === 'refunded') { current.status = 'refunded'; await current.save({ session }) }
    await order.save({ session }); await queueOrderNotifications(before, order, session)
    if (event) await PaymentEvent.updateOne({ provider: 'razorpay', accountId: gateway.accountId || 'legacy', environment: gateway.environment, providerEventId: event.id }, { $set: { payment: current._id, payloadHash: event.hash, state: 'processed', processedAt: new Date() } }, { upsert: true, session })
    return order
  })
}
export async function checkOrder(order, gateway) {
  let payment = await Payment.findOne({ order: order._id, provider: 'razorpay' })
  if (!payment) return order
  if (gateway.resolve) gateway = await gateway.resolve(payment)
  if (!payment.providerOrderId) {
    // A cancelled/expired order may still need recovery of an already-started
    // provider create. Never initiate a new provider order after cancellation.
    if (!payment.initializationStartedAt && order.inventoryStatus !== 'reserved') return order
    try { payment = await initializePayment(order, gateway) } catch (e) { if (e.status === 409) return order; throw e }
  }
  if (payment.environment !== gateway.environment) throw fail(409, 'Payment environment mismatch.')
  const result = await gateway.orderPayments(payment.providerOrderId)
  for (const remote of result.items || []) await reconcilePayment(payment, gateway, remote.id)
  if (gateway.paymentRefunds) {
    const attempts = await PaymentAttempt.find({ order: order._id, status: { $in: ['captured','refunded'] } })
    for (const attempt of attempts) await syncRefunds(attempt, gateway)
  }
  return Order.findById(order._id)
}
export async function cancelUnpaid(order, _gateway, { expired = false } = {}) {
  return cancelOrder(order._id, { expired, reason: expired ? 'Payment reservation expired' : 'Customer cancellation' })
}
export async function reconcileExpired(gateway) {
  // Compatibility entrypoint. Production uses the durable worker and claims.
  const orders = await Order.find({ paymentMethod: 'razorpay', inventoryStatus: 'reserved', expiresAt: { $lt: new Date() } }).sort({ expiresAt: 1 }).limit(50)
  for (const order of orders) { await checkOrder(order, gateway); await cancelOrder(order._id, { expired: true, reason: 'Payment reservation expired' }) }
}
export async function resumeCheckout(order, gateway) {
  const payment = await Payment.findOne({ order: order._id })
  if (gateway.resolve && payment) gateway = await gateway.resolve(payment)
  order = await checkOrder(order, gateway)
  if (order.fulfillmentStatus === 'cancelled') throw fail(409, 'This order is cancelled. Its payment state will continue to reconcile.')
  if (order.paymentStatus === 'paid' || order.paymentMethod === 'cod') return { order }
  if (order.inventoryStatus !== 'reserved' || order.expiresAt < new Date()) throw fail(409, 'This checkout expired. Return to your bag for a new checkout.')
  return checkoutResponse(order, await initializePayment(order, gateway), gateway)
}
