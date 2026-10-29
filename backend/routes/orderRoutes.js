import { Router } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { protect } from '../middleware/authMiddleware.js'
import { Order, Payment } from '../models/domainModels.js'
import { Refund } from '../payments/models.js'
import { applyMethodPolicy, publicOrder } from '../payments/policy.js'
import { cancelOrder, cleanPurchasedCart } from '../payments/lifecycle.js'
import { addressInput, lineItemsInput, objectId, fail } from '../services/validation.js'
import { quote, createOrder, reconcilePayment, checkOrder, resumeCheckout } from '../services/commerce.js'
const router = Router()
const result = data => ({ ...data, ...(data.order && { order: publicOrder(data.order) }) })
router.get('/config', async (req, res) => res.set('Cache-Control','no-store').json(await req.app.locals.payments.publicConfig()))
router.use(protect)
router.use(rateLimit({ windowMs: 60000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false }))
router.post('/quote', async (req, res) => {
  const input = z.object({ items: lineItemsInput, paymentMethod: z.enum(['razorpay','cod']).default('razorpay'), postalCode: z.string().max(6).default('') }).strict().parse(req.body)
  const settings = await req.app.locals.payments.read()
  res.json({ ...applyMethodPolicy(await quote(input.items), input.paymentMethod, { postalCode: input.postalCode }, settings.policy), settingsRevision: settings.revision })
})
router.get('/intent/:key', async (req,res) => {
  const idempotencyKey = z.string().uuid().parse(req.params.key)
  const order = await Order.findOne({ customer: req.user._id, idempotencyKey })
  res.json({ order: order ? publicOrder(order) : null })
})
router.post('/', async (req, res) => {
  const input = z.object({ items: lineItemsInput, deliveryAddress: addressInput, paymentMethod: z.enum(['razorpay', 'cod']), idempotencyKey: z.string().uuid(), expectedTotalPaise: z.number().int().positive(), cartVersion: z.number().int().nonnegative().optional() }).strict().parse(req.body)
  const settings = await req.app.locals.payments.read()
  const existing = await Order.findOne({ customer: req.user._id, idempotencyKey: input.idempotencyKey })
  const payment = existing && await Payment.findOne({ order: existing._id })
  const gateway = input.paymentMethod === 'cod' ? { enabled: false } : await req.app.locals.payments.resolve(payment || undefined)
  gateway.appearance = (await req.app.locals.payments.publicConfig()).appearance
  res.status(201).json(result(await createOrder(req.user._id, input, { ...req.app.locals.config, paymentPolicy: settings.policy, paymentRevision: settings.revision }, gateway)))
})
router.get('/', async (req, res) => res.json({ orders: (await Order.find({ customer: req.user._id }).sort({ createdAt: -1 }).limit(100)).map(o => publicOrder(o)) }))
router.use('/:id', async (req, res, next) => {
  req.order = await Order.findOne({ _id: objectId.parse(req.params.id), customer: req.user._id })
  if (!req.order) throw fail(404, 'Order not found')
  next()
})
const refundsFor = order => Refund.find({ order }).select('amountPaise status source reason providerRefundId processedAt createdAt failureCode').sort({ createdAt: -1 }).lean()
router.get('/:id', async (req, res) => res.json({ order: publicOrder(req.order), refunds: await refundsFor(req.order._id) }))
router.get('/:id/refunds', async (req,res) => res.json({ refunds: await refundsFor(req.order._id) }))
router.post('/:id/check', async (req, res) => res.json({ order: publicOrder(await checkOrder(req.order, req.app.locals.payments)) }))
router.post('/:id/resume', async (req, res) => res.json(result(await resumeCheckout(req.order, req.app.locals.payments))))
router.post('/:id/cancel', async (req, res) => {
  const input = z.object({ reason: z.string().trim().max(300).default('Customer cancellation') }).strict().parse(req.body || {})
  res.json({ order: publicOrder(await cancelOrder(req.order._id, { actor: req.user._id, reason: input.reason })) })
})
router.post('/:id/cart-cleanup', async (req,res) => res.json(await cleanPurchasedCart(req.order._id, req.user._id)))
router.post('/:id/verify', async (req, res) => {
  const input = z.object({ razorpay_order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/), razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i) }).strict().parse(req.body)
  const payment = await Payment.findOne({ order: req.order._id, provider: 'razorpay' })
  if (!payment || payment.providerOrderId !== input.razorpay_order_id) throw fail(400, 'Payment verification failed.')
  const gateway = await req.app.locals.payments.resolve(payment)
  if (!gateway.verifyCheckout(payment.providerOrderId, input.razorpay_payment_id, input.razorpay_signature)) throw fail(400, 'Payment verification failed.')
  res.json({ order: publicOrder(await reconcilePayment(payment, gateway, input.razorpay_payment_id)) })
})
export default router
