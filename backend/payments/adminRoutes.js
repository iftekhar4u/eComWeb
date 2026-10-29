import { Router } from 'express'
import { z } from 'zod'
import argon2 from 'argon2'
import { rateLimit } from 'express-rate-limit'
import User from '../models/User.js'
import { Order, Payment, PaymentEvent, AuditLog } from '../models/domainModels.js'
import { PaymentAttempt, Refund, CommerceOperation, PaymentJob } from './models.js'
import { settingsInput } from './settings.js'
import { requestRefund } from './refunds.js'
import { codOperation, recordReturn } from './lifecycle.js'
import { checkOrder } from '../services/commerce.js'
import { protect, requireAdmin } from '../middleware/authMiddleware.js'
import { objectId, fail } from '../services/validation.js'

const router = Router()
router.use(protect, requireAdmin)
router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next() })
const sensitive = rateLimit({ windowMs: 900000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
export async function reauthenticatePayment(req, password) {
  const account = await User.findById(req.user._id).select('+password')
  if (!account?.password || !await argon2.verify(account.password, password).catch(() => false)) throw fail(403, 'The current administrator password is incorrect.')
}
const password = z.string().min(1).max(128)
const operationKey = z.string().uuid()
const amountPaise = z.number().int().min(1).max(100000000)
const pageInput = z.object({ page: z.coerce.number().int().min(1).default(1), environment: z.enum(['sandbox','live','unknown']).optional(), status: z.string().max(40).optional() }).strict()
async function pageOf(Model, filter, page) { return { items: await Model.find(filter).sort({ createdAt: -1 }).skip((page-1)*25).limit(25).lean(), page, total: await Model.countDocuments(filter) } }
export async function paymentDetails(orderId) {
  const [attempts, refunds, operations] = await Promise.all([PaymentAttempt.find({ order: orderId }).sort({ createdAt: -1 }).lean(), Refund.find({ order: orderId }).sort({ createdAt: -1 }).lean(), CommerceOperation.find({ order: orderId }).sort({ createdAt: -1 }).lean()])
  return { attempts, refunds, operations }
}
router.get('/payments/settings', async (req,res) => res.json(await req.app.locals.payments.adminView()))
router.put('/payments/settings', sensitive, async (req,res) => {
  const input = settingsInput.parse(req.body); await reauthenticatePayment(req, input.currentPassword)
  await req.app.locals.payments.save(input, req.user._id)
  res.json(await req.app.locals.payments.adminView())
})
router.post('/payments/settings/validate', sensitive, async (req,res) => {
  const input = z.object({ profileId: z.string().min(1).max(80), currentPassword: password }).strict().parse(req.body)
  await reauthenticatePayment(req,input.currentPassword)
  res.json(await req.app.locals.payments.validate(input.profileId))
})
router.get('/payments', async (req,res) => { const q = pageInput.parse(req.query); res.json(await pageOf(Payment, { ...(q.environment && { environment: q.environment }), ...(q.status && { status: q.status }) }, q.page)) })
router.get('/refunds', async (req,res) => { const q = pageInput.parse(req.query); res.json(await pageOf(Refund, { ...(q.environment && { environment: q.environment }), ...(q.status && { status: q.status }) }, q.page)) })
router.post('/orders/:id/refunds', sensitive, async (req,res) => {
  const input = z.object({ attemptId: objectId, amountPaise, operationKey, reason: z.string().trim().min(3).max(300), currentPassword: password }).strict().parse(req.body)
  await reauthenticatePayment(req, input.currentPassword)
  const order = await Order.findById(objectId.parse(req.params.id))
  if (!order) throw fail(404, 'Order not found.')
  // Import Dashboard-originated refunds before allowing a fresh commitment.
  await checkOrder(order, req.app.locals.payments)
  const { currentPassword: _password, ...data } = input
  res.status(202).json({ refund: await requestRefund(order._id, data, req.user._id) })
})
for (const [path, kind] of [['collect','cod_collect'],['remit','cod_remit'],['reimburse','cod_reimburse']]) {
  router.post(`/orders/:id/cod/${path}`, sensitive, async (req,res) => {
    const input = z.object({ operationKey, amountPaise, reference: z.string().trim().min(3).max(200), evidence: z.string().trim().min(5).max(500), currentPassword: password }).strict().parse(req.body)
    await reauthenticatePayment(req,input.currentPassword)
    const { currentPassword: _password, ...data } = input
    res.json({ order: await codOperation(objectId.parse(req.params.id), kind, data, req.user._id) })
  })
}
router.post('/orders/:id/returns', sensitive, async (req,res) => {
  const input = z.object({ operationKey, status: z.enum(['failed_delivery','refused','returning','received']), inspected: z.boolean().default(false), evidence: z.string().trim().min(5).max(500), currentPassword: password }).strict().parse(req.body)
  await reauthenticatePayment(req,input.currentPassword)
  const { currentPassword: _password, ...data } = input
  res.json({ order: await recordReturn(objectId.parse(req.params.id),data,req.user._id) })
})
router.get('/payments/health', async (_req,res) => {
  const [heartbeat, events, jobs, refunds] = await Promise.all([
    PaymentJob.findOne({ key: 'worker-heartbeat' }).select('lastSuccessAt').lean(),
    PaymentEvent.find({ state: { $nin: ['processed','ignored'] } }).sort({ nextAttemptAt: 1 }).limit(50).lean(),
    PaymentJob.find({ kind: { $ne: 'heartbeat' }, state: { $ne: 'done' }, failureCode: { $exists: true } }).sort({ nextAttemptAt: 1 }).limit(50).select('-snapshot').lean(),
    Refund.find({ status: { $in: ['unknown','failed','review'] } }).sort({ updatedAt: -1 }).limit(50).lean(),
  ])
  res.json({ lastHeartbeatAt: heartbeat?.lastSuccessAt, workerHealthy: Boolean(heartbeat?.lastSuccessAt && Date.now() - heartbeat.lastSuccessAt.getTime() < 180000), events, jobs, refunds })
})
router.post('/payments/jobs/:id/retry', sensitive, async (req,res) => {
  const input = z.object({ kind: z.enum(['event','job','refund']), currentPassword: password }).strict().parse(req.body)
  await reauthenticatePayment(req,input.currentPassword)
  const Model = input.kind === 'event' ? PaymentEvent : input.kind === 'refund' ? Refund : PaymentJob
  const field = input.kind === 'refund' ? 'status' : 'state', initial = input.kind === 'refund' ? 'unknown' : input.kind === 'event' ? 'received' : 'ready'
  const changed = await Model.findOneAndUpdate({ _id: objectId.parse(req.params.id), [field]: 'review', $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: new Date() } }] }, { $set: { [field]: initial, attempts: 0, nextAttemptAt: new Date() }, $unset: { leaseUntil: 1, leaseToken: 1 } }, { new: true })
  if (!changed) throw fail(409, 'Only unclaimed review items can be retried. Failed refunds require a new explicit refund operation.')
  await AuditLog.create({ actor: req.user._id, action: 'payments.retry', resourceType: input.kind, resourceId: req.params.id, summary: 'Operator requested reconciliation with the original operation identity.' })
  res.json({ message: 'Recovery scheduled using the existing operation key.' })
})
export default router
