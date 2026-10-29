import crypto from 'node:crypto'
import { Order, Payment, PaymentEvent } from '../models/domainModels.js'
import { PaymentJob, Refund, PaymentAttempt } from './models.js'
import { checkOrder, initializePayment, reconcilePayment } from '../services/commerce.js'
import { cancelOrder } from './lifecycle.js'
import { processRefund, ingestRefund } from './refunds.js'
import { emailEvent, emailEventsAvailable } from '../email/events.js'
import { fail } from '../services/validation.js'

const leaseMs = 120000
export async function claim(Model, filter, now = new Date()) {
  const leaseToken = crypto.randomUUID()
  return Model.findOneAndUpdate({ ...filter, nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
    { $set: { leaseUntil: new Date(now.getTime() + leaseMs), leaseToken }, $inc: { attempts: 1 } }, { sort: { nextAttemptAt: 1, _id: 1 }, new: true })
}
export const retryDelay = attempts => Math.min(3600000, 5000 * 2 ** Math.min(attempts, 10))
export async function processEvent(event, settings) {
  const gateway = await settings.resolve({ accountId: event.accountId, credentialProfileId: event.credentialProfileId, environment: event.environment })
  const remote = event.remotePaymentId && await gateway.fetchPayment(event.remotePaymentId)
  const providerOrderId = remote?.order_id || event.remoteOrderId
  let payment = await Payment.findOne({ providerOrderId, environment: event.environment })
  if (!payment && providerOrderId) {
    const providerOrder = await gateway.fetchOrder(providerOrderId)
    const localId = providerOrder.notes?.localOrderId
    if (/^[a-f\d]{24}$/i.test(localId || '')) {
      const order = await Order.findById(localId)
      const candidate = await Payment.findOne({ order: localId, environment: event.environment, providerOrderId: { $exists: false } })
      if (order && candidate && providerOrder.receipt === order.orderNumber && providerOrder.amount === order.totalPaise && providerOrder.currency === 'INR' && (candidate.accountId === event.accountId || candidate.accountId === `legacy-${event.environment}`)) {
        await initializePayment(order, await settings.resolve(candidate))
        payment = await Payment.findOne({ providerOrderId, environment: event.environment })
      }
    }
  }
  if (!payment) throw Object.assign(fail(409, 'Webhook mapping is not available yet.'), { code: 'ORPHANED_MAPPING' })
  if (payment.accountId !== event.accountId && payment.accountId !== `legacy-${event.environment}`) throw Object.assign(fail(409, 'Merchant mapping requires review.'), { code: 'ACCOUNT_MISMATCH' })
  const bound = await settings.resolve(payment)
  if (remote) await reconcilePayment(payment, bound, remote.id)
  else await checkOrder(await Order.findById(payment.order), settings)
  if (event.remoteRefundId) {
    const refund = await bound.fetchRefund(event.remoteRefundId)
    const attempt = await PaymentAttempt.findOne({ order: payment.order, providerPaymentId: refund.payment_id })
    if (!attempt) throw fail(409, 'Refund payment evidence is not available yet.')
    await ingestRefund(attempt, refund)
  }
  await PaymentEvent.updateOne({ _id: event._id, leaseToken: event.leaseToken }, { $set: { payment: payment._id, state: 'processed', processedAt: new Date() }, $unset: { failureCode: 1 } })
}
export function createPaymentWorker(settings) {
  let stopping = false, inFlight = null, timer
  async function leased(Model, filter, work, limit, kind) {
    for (let i = 0; i < limit && !stopping; i++) {
      const record = await claim(Model, filter)
      if (!record) break
      const ownership = { _id: record._id, leaseToken: record.leaseToken }
      const renew = setInterval(() => { void Model.updateOne(ownership, { $set: { leaseUntil: new Date(Date.now() + leaseMs) } }).catch(() => {}) }, 30000)
      renew.unref()
      try {
        const delay = await work(record)
        await Model.updateOne(ownership, { $set: { nextAttemptAt: new Date(Date.now() + (delay || 60000)) }, $unset: { leaseUntil: 1, leaseToken: 1 } })
      } catch (error) {
        const settingsValue = await settings.read()
        const stateField = kind === 'refund' ? 'status' : 'state'
        const set = { nextAttemptAt: new Date(Date.now() + retryDelay(record.attempts)), failureCode: /^[A-Z_0-9]{1,80}$/.test(error.code || '') ? error.code : 'PROCESSING_RETRY' }
        if (record.attempts >= settingsValue.policy.retryLimit) set[stateField] = 'review'
        await Model.updateOne({ ...ownership, [stateField]: { $nin: kind === 'refund' ? ['processed','failed'] : ['processed','done'] } }, { $set: set, $unset: { leaseUntil: 1, leaseToken: 1 } })
      } finally { clearInterval(renew) }
    }
  }
  async function tick() {
    if (stopping || inFlight) return inFlight
    inFlight = (async () => {
      const current = await settings.read()
      await leased(PaymentEvent, { state: { $in: ['received','processing','failed'] } }, e => processEvent(e, settings), 10, 'event')
      await leased(Refund, { status: { $in: ['requested','submitting','unknown','pending'] } }, r => processRefund(r, settings), 10, 'refund')
      await leased(PaymentJob, { kind: { $in: ['reconcile','notification'] }, state: { $in: ['ready','running'] } }, async job => {
        if (job.kind === 'notification') {
          if (!emailEventsAvailable()) throw fail(503, 'Notification dispatcher is unavailable.')
          await emailEvent(job.notificationKind, JSON.parse(job.snapshot))
          await PaymentJob.updateOne({ _id: job._id, leaseToken: job.leaseToken }, { $set: { state: 'done', lastSuccessAt: new Date() }, $unset: { failureCode: 1 } })
          return
        }
        const order = await Order.findById(job.order)
        if (!order) throw fail(409, 'Reconciliation order is missing.')
        let error
        try { await checkOrder(order, settings) } catch (e) { error = e }
        if (order.inventoryStatus === 'reserved' && order.expiresAt < new Date()) await cancelOrder(order._id, { expired: true, reason: 'Payment reservation expired' })
        if (error) throw error
        await PaymentJob.updateOne({ _id: job._id, leaseToken: job.leaseToken }, { $set: { attempts: 0, lastSuccessAt: new Date() }, $unset: { failureCode: 1 } })
        return ['paid','refunded'].includes(order.paymentStatus) ? 900000 : current.policy.reconcileSeconds * 1000
      }, 10, 'job')
      await PaymentJob.updateOne({ key: 'worker-heartbeat' }, { $set: { kind: 'heartbeat', state: 'done', lastSuccessAt: new Date() } }, { upsert: true })
    })().finally(() => { inFlight = null })
    return inFlight
  }
  return { tick, start() {
    timer = setInterval(() => { void tick().catch(() => console.error('Payment worker unavailable; durable work will retry.')) }, 5000); timer.unref()
    void tick().catch(() => console.error('Payment worker unavailable; check database migration and settings.'))
    return async () => { stopping = true; clearInterval(timer); await inFlight?.catch(() => {}) }
  } }
}
