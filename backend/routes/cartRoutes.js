import { Router } from 'express'
import { z } from 'zod'
import { protect } from '../middleware/authMiddleware.js'
import { Cart, ProductVariant } from '../models/domainModels.js'
import { findPublicProducts } from '../services/catalog.js'
import { objectId, fail } from '../services/validation.js'
const router = Router(); router.use(protect)
const inputSchema = z.object({ version: z.number().int().nonnegative(), items: z.array(z.object({ variantId: objectId, quantity: z.number().int().min(1).max(99) }).strict()).max(100) }).strict()
async function hydrate(cart) {
  const variants = await ProductVariant.find({ _id: { $in: (cart?.items || []).map(i => i.variant) } }).lean()
  const products = await findPublicProducts(variants.map(v => v.product))
  return (cart?.items || []).flatMap(i => {
    const v = variants.find(v => String(v._id) === String(i.variant)); const p = products.find(p => String(p._id) === String(v?.product))
    return p && v?.active ? [{ ...p, variantId: String(v._id), price: v.price, stock: v.stockOnHand - v.reservedQuantity, quantity: i.quantity }] : []
  })
}
async function response(customer) { const cart = await Cart.findOne({ customer }).lean(); return { items: await hydrate(cart), version: cart?.__v || 0 } }
router.get('/', async (req, res) => res.json(await response(req.user._id)))
router.put('/', async (req, res) => {
  const { items, version } = inputSchema.parse(req.body)
  if (new Set(items.map(i => i.variantId)).size !== items.length) throw fail(400, 'Duplicate cart items')
  const variants = await ProductVariant.find({ _id: { $in: items.map(i => i.variantId) }, active: true }).lean()
  if (variants.length !== items.length) throw fail(409, 'A product is no longer available. Refresh your bag.')
  const cart = await Cart.findOne({ customer: req.user._id })
  if ((cart?.__v || 0) !== version) throw fail(409, 'Your bag changed in another tab. Refresh before editing.')
  const next = { items: items.map(i => ({ variant: i.variantId, quantity: i.quantity })), updatedAt: new Date() }
  if (!cart) {
    try { await Cart.create({ ...next, customer: req.user._id, __v: 1 }) }
    catch (error) { if (error.code === 11000) throw fail(409, 'Your bag changed. Refresh before editing.'); throw error }
  } else if (!(await Cart.updateOne({ _id: cart._id, __v: version }, { $set: next, $inc: { __v: 1 } }, { runValidators: true })).modifiedCount) throw fail(409, 'Your bag changed. Refresh before editing.')
  res.json(await response(req.user._id))
})
router.delete('/', async (req, res) => {
  const { version } = z.object({ version: z.number().int().nonnegative() }).strict().parse(req.body)
  const result = await Cart.updateOne({ customer: req.user._id, __v: version }, { $set: { items: [], updatedAt: new Date() }, $inc: { __v: 1 } })
  if (!result.modifiedCount) throw fail(409, 'Your bag changed. Refresh before clearing it.')
  res.json(await response(req.user._id))
})
export default router
