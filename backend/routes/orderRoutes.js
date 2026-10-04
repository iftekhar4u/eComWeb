import { Router } from 'express'
import { z } from 'zod'
import { protect } from '../middleware/authMiddleware.js'
import { Order, Payment } from '../models/domainModels.js'
import { addressInput, lineItemsInput, objectId, fail } from '../services/validation.js'
import { quote, createOrder, reconcilePayment, checkOrder, cancelUnpaid, resumeCheckout } from '../services/commerce.js'
const router = Router()
router.get('/config', (req, res) => res.json({ razorpayEnabled: req.app.locals.gateway.enabled, codEnabled: Boolean(req.app.locals.config.COD_ENABLED) }))
router.use(protect)
router.post('/quote', async (req, res) => {
  const { items } = z.object({ items: lineItemsInput }).strict().parse(req.body)
  res.json(await quote(items))
})
router.post('/', async (req, res) => {
  const input = z.object({ items: lineItemsInput, deliveryAddress: addressInput, paymentMethod: z.enum(['razorpay', 'cod']), idempotencyKey: z.string().uuid(), expectedTotalPaise: z.number().int().positive() }).strict().parse(req.body)
  res.status(201).json(await createOrder(req.user._id, input, req.app.locals.config, req.app.locals.gateway))
})
router.get('/', async (req, res) => res.json({ orders: await Order.find({ customer: req.user._id }).sort({ createdAt: -1 }).limit(100).lean() }))
router.use('/:id', async (req, res, next) => {
  const id = objectId.parse(req.params.id)
  req.order = await Order.findOne({ _id: id, customer: req.user._id })
  if (!req.order) throw fail(404, 'Order not found')
  next()
})
router.get('/:id', (req, res) => res.json({ order: req.order }))
router.post('/:id/check', async (req, res) => res.json({ order: await checkOrder(req.order, req.app.locals.gateway) }))
router.post('/:id/resume', async (req, res) => res.json(await resumeCheckout(req.order, req.app.locals.gateway)))
router.post('/:id/cancel', async (req, res) => res.json({ order: await cancelUnpaid(req.order, req.app.locals.gateway) }))
router.post('/:id/verify', async (req, res) => {
  const input = z.object({ razorpay_order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/), razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i) }).strict().parse(req.body)
  const gateway = req.app.locals.gateway
  const payment = await Payment.findOne({ order: req.order._id, provider: 'razorpay' })
  if (!payment || payment.providerOrderId !== input.razorpay_order_id || !gateway.verifyCheckout(payment.providerOrderId, input.razorpay_payment_id, input.razorpay_signature)) throw fail(400, 'Payment verification failed.')
  res.json({ order: await reconcilePayment(payment, gateway, input.razorpay_payment_id) })
})
export default router
