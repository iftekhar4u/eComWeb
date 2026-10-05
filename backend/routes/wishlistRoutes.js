import { Router } from 'express'
import { z } from 'zod'
import { protect } from '../middleware/authMiddleware.js'
import { Wishlist } from '../models/domainModels.js'
import { objectId } from '../services/validation.js'
import { findPublicProducts } from '../services/catalog.js'
const router = Router(); router.use(protect)
router.get('/', async (req, res) => { const list = await Wishlist.findOne({ customer: req.user._id }).lean(); res.json({ items: await findPublicProducts(list?.products || []) }) })
router.put('/', async (req, res) => {
  const { productIds } = z.object({ productIds: z.array(objectId).max(100) }).strict().parse(req.body)
  const products = await findPublicProducts([...new Set(productIds)])
  await Wishlist.updateOne({ customer: req.user._id }, { $set: { products: products.map(p => p._id) } }, { upsert: true, runValidators: true })
  res.json({ items: products })
})
export default router
