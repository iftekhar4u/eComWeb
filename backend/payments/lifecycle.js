import { Order, Payment, InventoryReservation, ProductVariant, InventoryMovement, AuditLog, Cart } from '../models/domainModels.js'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { CommerceOperation } from './models.js'
import { transaction, releaseStock } from '../services/commerce.js'
import { assertDispatch, cancellationEligibility } from './policy.js'
import { hash, ensureAutomaticRefunds } from './refunds.js'
import { queueOrderNotifications, scheduleOrder } from './outbox.js'
import { fail } from '../services/validation.js'

export async function restoreCommittedStock(order, session, actor) {
  for (const item of order.items) {
    const restored = await InventoryReservation.findOneAndUpdate({ order: order._id, variant: item.variant, state: 'consumed' }, { $set: { state: 'restored', releasedAt: new Date() } }, { session, new: true })
    if (!restored) throw fail(409, 'Consumed stock evidence is unavailable; inventory requires review.')
    const variant = await ProductVariant.findByIdAndUpdate(item.variant, { $inc: { stockOnHand: item.quantity } }, { session, new: true, runValidators: true })
    if (!variant) throw fail(409, 'The stock record is unavailable; inventory requires review.')
    await Product.updateOne({ _id: variant.product }, { $set: { stock: variant.stockOnHand }, $inc: { __v: 1 } }, { session })
    await InventoryMovement.create([{ variant: item.variant, order: order._id, actor, delta: item.quantity, reason: 'return', note: 'Verified pre-dispatch cancellation or inspected return' }], { session })
  }
  order.inventoryStatus = 'released'
}
export async function cancelOrder(orderId, { actor, reason = 'Customer cancellation', admin = false, expired = false, now = new Date() } = {}) {
  return transaction(async session => {
    const order = await Order.findById(orderId).session(session)
    if (!order) throw fail(404, 'Order not found.')
    if (order.fulfillmentStatus === 'cancelled') return order
    if (!admin && !expired && !cancellationEligibility(order, now).eligible) throw fail(409, cancellationEligibility(order, now).reason)
    if (!['pending','processing'].includes(order.fulfillmentStatus)) throw fail(409, 'Dispatched orders require a return workflow.')
    if (expired && (order.inventoryStatus !== 'reserved' || order.expiresAt > now || ['paid','refunded'].includes(order.paymentStatus))) return order
    const before = { paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, refundedPaise: order.refundedPaise }
    if (order.inventoryStatus === 'reserved') { await releaseStock(order, session, expired ? 'expired' : 'released'); order.inventoryStatus = 'released' }
    else if (order.inventoryStatus === 'committed') await restoreCommittedStock(order, session, actor)
    order.fulfillmentStatus = 'cancelled'; order.cancelledAt = now; order.cancelledBy = actor; order.cancellationReason = reason
    // Authorization/unknown payment remains visible. Cancellation never calls capture.
    if (order.paymentMethod === 'cod') order.paymentStatus = order.codCollectedPaise ? 'paid' : 'failed'
    else { await ensureAutomaticRefunds(order, session); await scheduleOrder(order._id, session) }
    await order.save({ session })
    await AuditLog.create([{ actor, action: 'order.cancelled', resourceType: 'order', resourceId: String(order._id), summary: `${expired ? 'Reservation expired' : 'Cancellation accepted'}: ${reason}` }], { session })
    await queueOrderNotifications(before, order, session)
    return order
  })
}
export async function fulfillOrder(orderId, input, actor) {
  if (input.fulfillmentStatus === 'cancelled') return cancelOrder(orderId, { actor, admin: true, reason: 'Administrator cancellation' })
  return transaction(async session => {
    const order = await Order.findById(orderId).session(session)
    if (!order) throw fail(404, 'Order not found.')
    const before = { paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, refundedPaise: order.refundedPaise }
    if (input.fulfillmentStatus !== order.fulfillmentStatus) {
      if (input.fulfillmentStatus === 'shipped') assertDispatch(order)
      else if (!(order.fulfillmentStatus === 'shipped' && input.fulfillmentStatus === 'delivered' && order.returnStatus === 'none')) throw fail(409, 'Invalid fulfillment transition.')
    }
    if (order.cancelledAt || order.fulfillmentStatus === 'cancelled') throw fail(409, 'A cancelled order cannot be fulfilled.')
    order.fulfillmentStatus = input.fulfillmentStatus; order.trackingNumber = input.trackingNumber
    await order.save({ session }); await queueOrderNotifications(before, order, session)
    await AuditLog.create([{ actor, action: 'order.fulfillment', resourceType: 'order', resourceId: String(order._id), summary: `Fulfillment: ${order.fulfillmentStatus}` }], { session })
    return order
  })
}
export async function codOperation(orderId, kind, input, actor) {
  return transaction(async session => {
    const order = await Order.findById(orderId).session(session)
    if (!order || order.paymentMethod !== 'cod') throw fail(409, 'This action requires a cash-on-delivery order.')
    const requestHash = hash({ kind, amountPaise: input.amountPaise, reference: input.reference, evidence: input.evidence })
    const prior = await CommerceOperation.findOne({ order: orderId, operationKey: input.operationKey }).session(session)
    if (prior) { if (prior.requestHash !== requestHash) throw fail(409, 'Operation key reused with different evidence.'); return order }
    if (kind === 'cod_collect') {
      if (!['shipped','delivered'].includes(order.fulfillmentStatus) || order.cancelledAt || order.returnStatus !== 'none') throw fail(409, 'Collection requires an active dispatched order.')
      if (order.codCollectedPaise || input.amountPaise !== order.totalPaise) throw fail(409, 'Record exactly the full outstanding COD amount once.')
      order.codCollectedPaise = input.amountPaise; order.paymentStatus = 'paid'; order.legacyCollectionUnverified = false
    } else if (kind === 'cod_remit') {
      if (!order.codCollectedPaise || order.codRemittedPaise || input.amountPaise !== order.codCollectedPaise) throw fail(409, 'Record exactly the collected amount as a single remittance.')
      order.codRemittedPaise = input.amountPaise
    } else {
      if (!['cancelled'].includes(order.fulfillmentStatus) && order.returnStatus !== 'received') throw fail(409, 'Reimbursement requires cancellation or an inspected return.')
      if (!order.codCollectedPaise || input.amountPaise > order.codCollectedPaise - order.codReimbursedPaise) throw fail(409, 'Reimbursement exceeds evidenced COD collection.')
      order.codReimbursedPaise += input.amountPaise; order.refundedPaise = order.codReimbursedPaise
      if (order.codReimbursedPaise === order.codCollectedPaise) order.paymentStatus = 'refunded'
    }
    await CommerceOperation.create([{ order: orderId, kind, requestHash, ...input, actor }], { session })
    await AuditLog.create([{ actor, action: kind, resourceType: 'order', resourceId: String(orderId), summary: `${kind}: ${input.amountPaise} paise; reference ${input.reference}` }], { session })
    await order.save({ session }); return order
  })
}
export async function recordReturn(orderId, input, actor) {
  return transaction(async session => {
    const order = await Order.findById(orderId).session(session)
    if (!order || !['shipped','delivered'].includes(order.fulfillmentStatus)) throw fail(409, 'Returns require a dispatched order.')
    const prior = await CommerceOperation.findOne({ order: orderId, operationKey: input.operationKey }).session(session)
    const requestHash = hash(input)
    if (prior) { if (prior.requestHash !== requestHash) throw fail(409, 'Return operation key changed.'); return order }
    const allowed = { none: ['failed_delivery','refused','returning'], failed_delivery: ['returning'], refused: ['returning'], returning: ['received'], received: [] }
    if (!allowed[order.returnStatus || 'none'].includes(input.status)) throw fail(409, 'Invalid return transition.')
    if (input.status === 'received') {
      if (!input.inspected) throw fail(400, 'Confirm physical receipt and inspection before restoring stock.')
      if (order.inventoryStatus === 'committed') await restoreCommittedStock(order, session, actor)
    }
    order.returnStatus = input.status
    await order.save({ session })
    await CommerceOperation.create([{ order: orderId, operationKey: input.operationKey, kind: 'return_received', requestHash, actor, evidence: input.evidence, result: input.status }], { session })
    await AuditLog.create([{ actor, action: 'order.return', resourceType: 'order', resourceId: String(orderId), summary: `Return: ${input.status}; ${input.evidence}` }], { session })
    return order
  })
}
export async function cleanPurchasedCart(orderId, customer) {
  return transaction(async session => {
    const order = await Order.findOne({ _id: orderId, customer }).session(session)
    if (!order) throw fail(404, 'Order not found.')
    if (order.cartCleanedAt) return { cleaned: true }
    if (order.fulfillmentStatus === 'cancelled' || !(order.paymentStatus === 'paid' || order.paymentMethod === 'cod' && order.inventoryStatus === 'committed')) throw fail(409, 'The bag is preserved until order confirmation.')
    const cart = await Cart.findOne({ customer }).session(session)
    let result = 'newer_cart_preserved'
    if (cart && order.cartVersion != null && (cart.__v || 0) === order.cartVersion) {
      const items = cart.items.flatMap(i => { const line = order.items.find(l => String(l.variant) === String(i.variant)); const quantity = i.quantity - (line?.quantity || 0); return quantity > 0 ? [{ variant: i.variant, quantity }] : [] })
      const changed = await Cart.updateOne({ _id: cart._id, __v: cart.__v || 0 }, { $set: { items, updatedAt: new Date() }, $inc: { __v: 1 } }, { session })
      if (!changed.modifiedCount) throw fail(409, 'The bag changed; refresh to retry.')
      result = 'purchased_snapshot_removed'
    }
    order.cartCleanedAt = new Date(); await order.save({ session })
    await CommerceOperation.create([{ order: orderId, operationKey: 'cart-cleanup', requestHash: hash({ customer: String(customer), cartVersion: order.cartVersion }), kind: 'cart_cleanup', actor: customer, result }], { session })
    return { cleaned: true, result }
  })
}
// A write to the customer document serializes concurrent pending-order limit checks.
export async function lockCustomer(customer, session) { await User.updateOne({ _id: customer }, { $inc: { __v: 1 } }, { session }) }
