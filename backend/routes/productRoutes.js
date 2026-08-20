import { Router } from 'express'
import { z } from 'zod'
import Product from '../models/Product.js'

const router = Router()
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  sort: z.enum(['newest', 'price-low', 'price-high']).default('newest'),
}).strict()
const publicFields = 'name slug description shortDescription brand category subcategory price discountPrice discountPercentage images thumbnail stock rating numReviews ingredients benefits howToUse skinType concerns size variant featured bestSeller newArrival tags'
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
router.get('/', async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query)
    const page = query.page; const limit = query.limit
    const filter = { status: 'published' }
    if (query.search) filter.$or = [{ name: new RegExp(escapeRegex(query.search), 'i') }, { shortDescription: new RegExp(escapeRegex(query.search), 'i') }]
    if (query.category) filter.category = query.category
    if (query.minPrice !== undefined || query.maxPrice !== undefined) filter.price = { ...(query.minPrice !== undefined && { $gte: query.minPrice }), ...(query.maxPrice !== undefined && { $lte: query.maxPrice }) }
    const sort = query.sort === 'price-low' ? { price: 1 } : query.sort === 'price-high' ? { price: -1 } : { createdAt: -1 }
    const [products, total] = await Promise.all([Product.find(filter).select(publicFields).sort(sort).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(filter)])
    res.json({ products, page, pages: Math.ceil(total / limit), total })
  } catch (error) { next(error) }
})
router.get('/:slug', async (req, res, next) => { try { const product = await Product.findOne({ slug: req.params.slug, status: 'published' }).select(publicFields).lean(); if (!product) return res.status(404).json({ message: 'Product not found' }); res.json(product) } catch (error) { next(error) } })
export default router
