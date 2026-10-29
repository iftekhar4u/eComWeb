import { fail } from '../services/validation.js'
export function cancellationEligibility(order, now = new Date()) {
  if (order.fulfillmentStatus === 'cancelled') return { eligible: false, reason: 'Already cancelled', alreadyCancelled: true }
  if (!['pending', 'processing'].includes(order.fulfillmentStatus)) return { eligible: false, reason: 'This order has left the pre-dispatch cancellation stage. Contact support for returns.' }
  if (!order.cancellationDeadline || now >= new Date(order.cancellationDeadline)) return { eligible: false, reason: 'The cancellation window has ended. Contact support.' }
  return { eligible: true, reason: '', deadline: order.cancellationDeadline }
}
export function assertDispatch(order, now = new Date()) {
  if (order.fulfillmentStatus !== 'processing' || order.cancelledAt) throw fail(409, 'Only active processing orders can be dispatched.')
  if (order.cancellationDeadline && now < new Date(order.cancellationDeadline)) throw fail(409, 'Dispatch is held until the customer cancellation deadline.')
  if (order.inventoryStatus !== 'committed' || (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid')) throw fail(409, 'Confirmed stock and captured payment are required before dispatch.')
}
export function applyMethodPolicy(totals, method, address, policy) {
  if (method === 'cod') {
    if (!policy.codEnabled) throw fail(409, 'Cash on delivery is currently unavailable.')
    if (totals.totalPaise < policy.codMinPaise || totals.totalPaise > policy.codMaxPaise) throw fail(409, 'This bag is outside the permitted cash-on-delivery order value.')
    if (policy.codPincodes.length && !policy.codPincodes.includes(address?.postalCode)) throw fail(409, 'Cash on delivery is not available for this PIN code.')
    if (totals.items.some(i => policy.codExcludedSkus.includes(i.sku))) throw fail(409, 'A product in this bag is not eligible for cash on delivery.')
  } else if (!policy.prepaidEnabled) throw fail(409, 'Online checkout is currently unavailable.')
  const codFeePaise = method === 'cod' ? policy.codFeePaise : 0
  const totalPaise = totals.totalPaise + codFeePaise
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 100 || totalPaise > 100000000) throw fail(400, 'Invalid order total.')
  return { ...totals, codFeePaise, totalPaise }
}
export function publicOrder(order, now = new Date()) {
  const result = order.toObject ? order.toObject() : { ...order }
  for (const key of ['requestHash', 'idempotencyKey', 'credentialProfileId', 'accountId', 'financialRevision', 'cartVersion']) delete result[key]
  return { ...result, serverNow: now, cancellation: cancellationEligibility(order, now) }
}
// Used by every sales summary; unclassified historical payments are deliberately excluded.
export const liveRevenueFilter = { paymentEnvironment: 'live' }
