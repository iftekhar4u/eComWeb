import crypto from 'node:crypto'
import { PaymentAttempt, Refund, committedRefundStates } from './models.js'
import { Order, Payment, AuditLog } from '../models/domainModels.js'
import { transaction } from '../services/commerce.js'
import { fail } from '../services/validation.js'
import { queueOrderNotifications } from './outbox.js'

export const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function refundBody(refund) { return { amount: refund.amountPaise, speed: 'normal', notes: { localRefundId: String(refund._id) } } }
export async function refundBalance(attempt, session) {
  const refunds = await Refund.find({ attempt: attempt._id, status: { $in: committedRefundStates } }).session(session).lean()
  const processed = refunds.filter(r => r.status === 'processed').reduce((n, r) => n + r.amountPaise, 0)
  const pending = refunds.filter(r => r.status !== 'processed').reduce((n, r) => n + r.amountPaise, 0)
  return Math.max(0, attempt.amountPaise - Math.max(attempt.refundedPaise || 0, processed) - pending)
}
// Caller MUST hold/write the order document in the same transaction. This serializes all commitments.
export async function reserveRefund(order, attempt, { amountPaise, operationKey, reason, actor, source = 'admin' }, session) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) throw fail(400, 'Refund amount must be a positive integer in paise.')
  const requestHash = hash({ attempt: String(attempt._id), amountPaise, reason, source })
  const previous = await Refund.findOne({ order: order._id, operationKey }).session(session)
  if (previous) {
    if (previous.requestHash !== requestHash) throw fail(409, 'This refund operation key has different parameters.')
    return previous
  }
  if (!['captured', 'refunded'].includes(attempt.status) || amountPaise > await refundBalance(attempt, session)) throw fail(409, 'Refund exceeds the remaining captured balance, including pending refunds.')
  const [refund] = await Refund.create([{ order: order._id, attempt: attempt._id, providerPaymentId: attempt.providerPaymentId, accountId: attempt.accountId,
    environment: attempt.environment, credentialProfileId: attempt.credentialProfileId, operationKey, requestHash, idempotencyKey: crypto.randomUUID(), amountPaise, reason, actor, source }], { session })
  await AuditLog.create([{ actor, action: 'refund.requested', resourceType: 'order', resourceId: String(order._id), summary: `${source} refund requested: ${amountPaise} paise; operation ${operationKey}` }], { session })
  return refund
}
export async function updateRefundSummary(order, session) {
  const attempts = await PaymentAttempt.find({ order: order._id, status: { $in: ['captured', 'refunded'] } }).session(session).lean()
  const refunds = await Refund.find({ order: order._id, status: { $in: committedRefundStates } }).session(session).lean()
  const pending = refunds.filter(r => r.status !== 'processed').reduce((n, r) => n + r.amountPaise, 0)
  const processed = attempts.reduce((sum, attempt) => sum + Math.max(attempt.refundedPaise || 0, refunds.filter(r => String(r.attempt) === String(attempt._id) && r.status === 'processed').reduce((n,r) => n + r.amountPaise, 0)), 0)
  order.capturedPaise = attempts.reduce((n,a) => n + a.amountPaise, 0)
  order.refundedPaise = Math.max(order.refundedPaise || 0, processed)
  order.refundPendingPaise = pending
  if (order.capturedPaise > 0) order.paymentStatus = order.refundedPaise >= order.capturedPaise ? 'refunded' : 'paid'
  order.financialRevision = (order.financialRevision || 0) + 1
}
export async function ensureAutomaticRefunds(order, session) {
  const attempts = await PaymentAttempt.find({ order: order._id, status: { $in: ['captured', 'refunded'] } }).sort({ capturedAt: 1, _id: 1 }).session(session)
  const payment = await Payment.findOne({ order: order._id }).session(session)
  for (const attempt of attempts) {
    const source = order.fulfillmentStatus === 'cancelled' || order.inventoryStatus === 'review' ? 'cancellation' : attempt.providerPaymentId !== payment?.providerPaymentId ? 'overpayment' : null
    if (!source) continue
    const key = `${source}:${attempt.providerPaymentId}`
    // A failed request remains visible; an operator must explicitly create a new operation.
    if (await Refund.exists({ order: order._id, operationKey: key }).session(session)) continue
    const remaining = await refundBalance(attempt, session)
    if (remaining) await reserveRefund(order, attempt, { amountPaise: remaining, operationKey: key, reason: source === 'cancellation' ? 'Order cancelled before dispatch' : 'Additional captured payment for one purchase', source }, session)
  }
  await updateRefundSummary(order, session)
}
export async function requestRefund(orderId, input, actor) {
  return transaction(async session => {
    const order = await Order.findById(orderId).session(session)
    if (!order || order.paymentMethod !== 'razorpay') throw fail(409, 'Razorpay refunds require a prepaid order.')
    const attempt = await PaymentAttempt.findOne({ _id: input.attemptId, order: orderId }).session(session)
    if (!attempt) throw fail(404, 'Captured payment attempt not found.')
    const refund = await reserveRefund(order, attempt, { ...input, actor }, session)
    await updateRefundSummary(order, session); await order.save({ session })
    return refund
  })
}
export async function ingestRefund(attempt, remote) {
  if (!/^rfnd_[a-zA-Z0-9]+$/.test(remote?.id || '') || remote.payment_id !== attempt.providerPaymentId || remote.currency !== 'INR' || !Number.isSafeInteger(remote.amount) || remote.amount < 1 || remote.amount > attempt.amountPaise || !['pending','processed','failed'].includes(remote.status)) throw fail(502, 'Provider refund evidence does not match the captured payment.')
  return transaction(async session => {
    const order = await Order.findById(attempt.order).session(session)
    const before = { paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, refundedPaise: order.refundedPaise }
    const context = { accountId: attempt.accountId, environment: attempt.environment }
    let refund = await Refund.findOne({ ...context, providerRefundId: remote.id }).session(session)
    const localId = remote.notes?.localRefundId
    if (!refund && /^[a-f\d]{24}$/i.test(localId || '')) refund = await Refund.findOne({ _id: localId, attempt: attempt._id, ...context }).session(session)
    if (!refund) {
      const operationKey = `dashboard:${remote.id}`
      refund = new Refund({ ...context, order: order._id, attempt: attempt._id, providerPaymentId: attempt.providerPaymentId, credentialProfileId: attempt.credentialProfileId, providerRefundId: remote.id,
        operationKey, idempotencyKey: crypto.randomUUID(), requestHash: hash({ remote: remote.id, amount: remote.amount }), amountPaise: remote.amount, reason: 'Refund observed from provider', source: 'dashboard' })
    }
    if (refund.providerRefundId && refund.providerRefundId !== remote.id || refund.amountPaise !== remote.amount || String(refund.attempt) !== String(attempt._id)) throw fail(409, 'Refund mapping conflict requires review.')
    refund.providerRefundId = remote.id
    // Processed is monotonic; pending cannot undo a terminal result.
    if (refund.status !== 'processed' && !(refund.status === 'failed' && remote.status === 'pending')) refund.status = remote.status
    if (refund.status === 'processed') refund.processedAt ||= new Date()
    refund.bankReference = String(remote.acquirer_data?.arn || remote.acquirer_data?.rrn || '').slice(0,200)
    refund.failureCode = refund.status === 'failed' ? 'PROVIDER_REFUND_FAILED' : undefined
    refund.nextAttemptAt = new Date(Date.now() + 60000)
    await refund.save({ session })
    const evidence = await PaymentAttempt.findById(attempt._id).session(session)
    const processed = (await Refund.find({ attempt: attempt._id, status: 'processed' }).session(session)).reduce((n,r) => n + r.amountPaise, 0)
    if (processed > evidence.amountPaise) throw fail(409, 'Provider refund totals exceed captured evidence. Manual review is required.')
    evidence.refundedPaise = Math.max(evidence.refundedPaise || 0, processed)
    if (evidence.refundedPaise === evidence.amountPaise) evidence.status = 'refunded'
    await evidence.save({ session })
    await updateRefundSummary(order, session)
    // A refund alone never proves returned inventory. No stock mutation here.
    if (order.paymentStatus === 'refunded' && ['pending','processing'].includes(order.fulfillmentStatus)) order.fulfillmentStatus = 'cancelled'
    await order.save({ session }); await queueOrderNotifications(before, order, session)
    return refund
  })
}
export async function syncRefunds(attempt, gateway) {
  const result = await gateway.paymentRefunds(attempt.providerPaymentId)
  for (const remote of result.items || []) await ingestRefund(attempt, remote)
}
export async function processRefund(refund, settings) {
  const attempt = await PaymentAttempt.findById(refund.attempt)
  if (!attempt) throw fail(409, 'Missing payment evidence.')
  const gateway = await settings.resolve({ ...attempt.toObject(), environment: attempt.environment })
  if (refund.providerRefundId) return ingestRefund(attempt, await gateway.fetchRefund(refund.providerRefundId))
  // Reconcile a lost response (including Dashboard events arriving first).
  await syncRefunds(attempt, gateway)
  refund = await Refund.findById(refund._id)
  if (refund.providerRefundId || ['processed','failed'].includes(refund.status)) return refund
  // Razorpay's public page does not promise a retention duration. Bound automatic
  // uncertain resubmission to 24h; thereafter fetch/list only, with operator review.
  if (refund.submittedAt && Date.now() - refund.submittedAt.getTime() > 86400000) {
    await Refund.updateOne({ _id: refund._id }, { $set: { status: 'review', failureCode: 'IDEMPOTENCY_WINDOW_REVIEW' } })
    return
  }
  await Refund.updateOne({ _id: refund._id, status: { $nin: ['processed','failed'] } }, { $set: { status: 'submitting', submittedAt: refund.submittedAt || new Date() } })
  let remote
  try { remote = await gateway.createRefund(refund.providerPaymentId, refundBody(refund), refund.idempotencyKey) }
  catch (error) {
    // Never turn a late failure response into a downgrade of webhook-confirmed success.
    const status = error.outcomeUnknown !== false ? 'unknown' : 'failed'
    await transaction(async session => {
      const current = await Refund.findById(refund._id).session(session)
      const order = await Order.findById(refund.order).session(session)
      if (!current.providerRefundId && !['processed','failed'].includes(current.status)) { current.status = status; current.failureCode = error.code || 'PROVIDER_UNREACHABLE'; await current.save({ session }) }
      await updateRefundSummary(order, session); await order.save({ session })
    })
    throw error
  }
  return ingestRefund(attempt, remote)
}
