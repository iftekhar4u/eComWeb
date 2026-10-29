import crypto from 'node:crypto'
import { PaymentEvent } from '../models/domainModels.js'
import { PaymentProfile } from '../payments/models.js'
import { webhookEvents } from '../payments/settings.js'
import { fail } from '../services/validation.js'

export async function razorpayWebhook(req, res) {
  if (!Buffer.isBuffer(req.body)) throw fail(400, 'A raw JSON webhook body is required.')
  const profile = await req.app.locals.payments.verifyWebhook(req.body, req.get('x-razorpay-signature'), req.params.profileId)
  let payload
  try { payload = JSON.parse(req.body.toString('utf8')) } catch { throw fail(400, 'Invalid webhook JSON.') }
  if (typeof payload.event !== 'string' || payload.event.length > 80) throw fail(400, 'Invalid webhook event.')
  if (profile.accountId.startsWith('acc_') && payload.account_id !== profile.accountId) throw fail(400, 'Webhook merchant account mismatch.')
  const payloadHash = crypto.createHash('sha256').update(req.body).digest('hex')
  const eventId = req.get('x-razorpay-event-id')
  if (eventId && (eventId.length > 190 || !/^[\w.-]+$/.test(eventId))) throw fail(400, 'Invalid event identifier.')
  const providerEventId = eventId ? `id:${eventId}` : `sha256:${payloadHash}`
  const remotePaymentId = payload.payload?.payment?.entity?.id || payload.payload?.refund?.entity?.payment_id
  const remoteRefundId = payload.payload?.refund?.entity?.id
  const remoteOrderId = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id
  const supported = webhookEvents.includes(payload.event)
  if (supported && !/^pay_[a-zA-Z0-9]+$/.test(remotePaymentId || '') && !/^order_[a-zA-Z0-9]+$/.test(remoteOrderId || '')) throw fail(400, 'Missing provider mapping.')
  if (remoteRefundId && !/^rfnd_[a-zA-Z0-9]+$/.test(remoteRefundId)) throw fail(400, 'Invalid refund identifier.')
  const identity = { provider: 'razorpay', accountId: profile.accountId, environment: profile.environment, providerEventId }
  try {
    await PaymentEvent.create({ ...identity, credentialProfileId: profile.profileId, payloadHash, eventKind: payload.event,
      remotePaymentId, remoteRefundId, remoteOrderId, state: supported ? 'received' : 'ignored', nextAttemptAt: new Date() })
  } catch (error) {
    if (error.code !== 11000) throw error
    const existing = await PaymentEvent.findOne(identity).lean()
    if (!existing || existing.payloadHash !== payloadHash) throw fail(409, 'Event identifier was already used with different bytes.')
  }
  await PaymentProfile.updateOne({ profileId: profile.profileId }, { $set: { lastWebhookAt: new Date() } })
  res.json({ received: true })
}
