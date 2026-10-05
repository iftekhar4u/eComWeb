import crypto from 'node:crypto'
import { Payment, Order } from '../models/domainModels.js'
import { reconcilePayment } from '../services/commerce.js'
import { fail } from '../services/validation.js'
export async function razorpayWebhook(req, res) {
  const gateway = req.app.locals.gateway
  if (!Buffer.isBuffer(req.body) || !gateway.verifyWebhook(req.body, req.get('x-razorpay-signature'))) throw fail(400, 'Invalid webhook signature')
  let payload
  try { payload = JSON.parse(req.body.toString('utf8')) } catch { throw fail(400, 'Invalid JSON') }
  if (!['payment.authorized', 'payment.captured', 'payment.failed', 'order.paid', 'refund.processed'].includes(payload.event)) return res.json({ received: true })
  const remote = payload.payload?.payment?.entity
  const remoteId = remote?.id || payload.payload?.refund?.entity?.payment_id
  if (!remoteId || !/^pay_[a-zA-Z0-9]+$/.test(remoteId)) throw fail(400, 'Missing payment ID')
  const fetched = await gateway.fetchPayment(remoteId)
  let payment = await Payment.findOne({ providerOrderId: fetched.order_id, environment: gateway.environment })
  // Recover a provider order created before a network timeout / process restart.
  if (!payment && /^[a-f\d]{24}$/i.test(fetched.notes?.localOrderId || '')) {
    const candidate = await Payment.findOne({ order: fetched.notes.localOrderId, environment: gateway.environment, providerOrderId: { $exists: false } })
    if (candidate && candidate.amountPaise === fetched.amount && fetched.currency === 'INR') {
      const order = await Order.findById(candidate.order)
      const orders = await gateway.findOrders(order.orderNumber)
      if (orders.items?.some(o => o.id === fetched.order_id && o.notes?.localOrderId === String(candidate.order))) payment = await Payment.findOneAndUpdate({ _id: candidate._id, providerOrderId: { $exists: false } }, { $set: { providerOrderId: fetched.order_id } }, { new: true })
    }
  }
  if (!payment) return res.json({ received: true, ignored: true })
  const hash = crypto.createHash('sha256').update(req.body).digest('hex')
  const id = req.get('x-razorpay-event-id') || hash
  if (id.length > 200) throw fail(400, 'Invalid event identifier')
  await reconcilePayment(payment, gateway, remoteId, { id, hash })
  res.json({ received: true })
}
