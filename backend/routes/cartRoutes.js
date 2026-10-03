import { Router } from 'express'
import { z } from 'zod'
import { protect } from '../middleware/authMiddleware.js'
import { Cart, ProductVariant } from '../models/domainModels.js'
import { findPublicProducts } from '../services/catalog.js'
import { objectId, fail } from '../services/validation.js'
const router = Router(); router.use(protect)
const inputSchema = z.object({ items: z.array(z.object({ variantId: objectId, quantity: z.number().int().min(1).max(99) }).strict()).max(100) }).strict()
async function hydrate(customer) {
  const cart = await Cart.findOne({ customer }).lean()
  const variants = await ProductVariant.find({ _id: { $in: (cart?.items || []).map(i => i.variant) } }).lean()
  const products = await findPublicProducts(variants.map(v => v.product))
  return (cart?.items || []).flatMap(i => {
    const v = variants.find(v => String(v._id) === String(i.variant)); const p = products.find(p => String(p._id) === String(v?.product))
    return p && v?.active ? [{ ...p, variantId: String(v._id), price: v.price, stock: v.stockOnHand - v.reservedQuantity, quantity: i.quantity }] : []
  })
}
router.get('/', async (req, res) => res.json({ items: await hydrate(req.user._id) }))
router.put('/', async (req, res) => {
  const { items } = inputSchema.parse(req.body)
  if (new Set(items.map(i => i.variantId)).size !== items.length) throw fail(400, 'Duplicate cart items')
  const variants = await ProductVariant.find({ _id: { $in: items.map(i => i.variantId) }, active: true }).lean()
  if (variants.length !== items.length) throw fail(409, 'A product is no longer available. Refresh your bag.')
  await Cart.updateOne({ customer: req.user._id }, { $set: { items: items.map(i => ({ variant: i.variantId, quantity: i.quantity })), updatedAt: new Date() } }, { upsert: true, runValidators: true })
  res.json({ items: await hydrate(req.user._id) })
})
router.delete('/', async (req, res) => { await Cart.updateOne({ customer: req.user._id }, { $set: { items: [], updatedAt: new Date() } }); res.json({ items: [] }) })
export default router
