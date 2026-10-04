import { Router } from 'express'
import { z } from 'zod'
import Product from '../models/Product.js'
import { publicProducts, publicFields } from '../services/catalog.js'

const router = Router()
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  bestSeller: z.enum(['true', 'false']).optional(),
  newArrival: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  sort: z.enum(['newest', 'price-low', 'price-high']).default('newest'),
}).strict()

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
router.get('/', async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query)
    const page = query.page; const limit = query.limit
    const filter = { status: 'published' }
    if (query.search) filter.$or = [{ name: new RegExp(escapeRegex(query.search), 'i') }, { shortDescription: new RegExp(escapeRegex(query.search), 'i') }]
    if (query.category) { if (['women', 'men'].includes(query.category)) filter.$and = [{ $or: [{ category: query.category }, { gender: query.category }] }]; else filter.category = query.category }
    if (query.bestSeller) filter.bestSeller = query.bestSeller === 'true'
    if (query.newArrival) filter.newArrival = query.newArrival === 'true'
    const stages = [{ $match: filter }, { $addFields: { sellingPrice: { $ifNull: ['$discountPrice', '$price'] } } }]
    if (query.minPrice !== undefined || query.maxPrice !== undefined) stages.push({ $match: { sellingPrice: { ...(query.minPrice !== undefined && { $gte: query.minPrice }), ...(query.maxPrice !== undefined && { $lte: query.maxPrice }) } } })
    const sort = query.sort === 'price-low' ? { sellingPrice: 1, _id: 1 } : query.sort === 'price-high' ? { sellingPrice: -1, _id: 1 } : { createdAt: -1, _id: 1 }
    const selected = Object.fromEntries(publicFields.split(' ').map(field => [field, 1]))
    const [result] = await Product.aggregate([...stages, { $facet: { products: [{ $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: selected }], count: [{ $count: 'total' }] } }])
    const products = result.products, total = result.count[0]?.total || 0
    res.json({ products: await publicProducts(products), page, pages: Math.ceil(total / limit), total })
  } catch (error) { next(error) }
})
router.get('/:slug', async (req, res, next) => { try { const product = await Product.findOne({ slug: req.params.slug, status: 'published' }).select(publicFields).lean(); if (!product) return res.status(404).json({ message: 'Product not found' }); res.json((await publicProducts([product]))[0]) } catch (error) { next(error) } })
export default router
