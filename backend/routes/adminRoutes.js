import { revenueExpression } from '../services/adminStudioMetrics.js'
import { fulfillOrder } from '../payments/lifecycle.js'
import { Router } from 'express'
import { seoInput } from '../seo/schema.js'
import { z } from 'zod'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { ProductVariant, Category, ProductCollection, BlogPost, Page, Homepage, SiteSettings, Order, Review, Subscriber, ContactMessage, InventoryMovement, AuditLog } from '../models/domainModels.js'
import { protect, requireAdmin } from '../middleware/authMiddleware.js'
import { objectId, slug, imageUrl, internalLink, fail } from '../services/validation.js'
import { transaction, checkOrder } from '../services/commerce.js'
const router = Router(); router.use(protect, requireAdmin)
const money = z.number().int().min(0).max(100000000)
const text = (max) => z.string().trim().max(max)
const status = z.enum(['draft', 'published', 'archived'])
const pagination = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), search: text(100).default('') }).strict()
const productInput = z.object({ seo: seoInput.optional(), name: text(160).min(2), slug, description: text(10000), shortDescription: text(500).default(''), category: slug, gender: z.enum(['women', 'men', 'unisex']), price: money.min(100), compareAtPrice: money.optional(), stock: z.number().int().min(0).max(100000000), sku: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/), thumbnail: imageUrl, images: z.array(imageUrl).max(12).default([]), benefits: z.array(text(500)).max(50).default([]), status, bestSeller: z.boolean(), newArrival: z.boolean(), featured: z.boolean().default(false), version: z.number().int().optional() }).strict().refine(p => !p.compareAtPrice || p.compareAtPrice >= p.price, 'Original price must be at least selling price')
const categoryInput = z.object({ seo: seoInput.optional(), name: text(100).min(2), slug, description: text(1000).default(''), image: imageUrl, order: z.number().int().min(0).max(100000), active: z.boolean() }).strict()
const articleInput = z.object({ seo: seoInput.optional(), title: text(200).min(2), slug, content: text(50000).min(1), status, excerpt: text(1000).optional(), image: imageUrl.optional(), updatedAt: z.string().datetime().optional() }).strict()
const collectionInput = z.object({ seo: seoInput.optional(), name: text(120).min(2), slug, description: text(1000), products: z.array(objectId).max(500), status, order: z.number().int().min(0).max(100000) }).strict()
const resources = { categories: [Category, categoryInput], blogs: [BlogPost, articleInput], pages: [Page, articleInput.omit({ excerpt: true, image: true })], collections: [ProductCollection, collectionInput] }
async function audit(req, action, type, id) { await AuditLog.create({ actor: req.user._id, action, resourceType: type, resourceId: String(id), summary: `${action} ${type}` }) }
router.get('/dashboard', async (req, res) => {
  const [products, customers, orders, pendingReviews, messages, sales, recentOrders] = await Promise.all([
    Product.countDocuments({ status: { $ne: 'archived' } }), User.countDocuments({ role: 'customer' }), Order.countDocuments(), Review.countDocuments({ moderation: 'pending' }), ContactMessage.countDocuments({ status: 'new' }),
    Order.aggregate([{ $match: { paymentStatus: 'paid', paymentEnvironment: 'live' } }, { $group: { _id: null, total: { $sum: revenueExpression } } }]), Order.find().sort({ createdAt: -1 }).limit(8).lean(),
  ])
  res.json({ products, customers, orders, pendingReviews, messages, revenuePaise: sales[0]?.total || 0, recentOrders, paymentsConfigured: (await req.app.locals.payments.publicConfig()).razorpayEnabled })
})
router.get('/options/categories', async (_req, res) => res.json({ items: await Category.find().sort({ order: 1 }).select('name slug active').lean() }))
router.get('/products', async (req, res) => {
  const { page, search } = pagination.parse(req.query)
  const filter = search ? { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}
  const [items, total] = await Promise.all([Product.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * 20).limit(20).lean(), Product.countDocuments(filter)])
  const variants = await ProductVariant.find({ product: { $in: items.map(p => p._id) } }).sort({ createdAt: 1 }).lean()
  res.json({ items: items.map(p => ({ ...p, inventory: variants.find(v => String(v.product) === String(p._id)) })), total, page, pages: Math.ceil(total / 20) })
})
async function saveProduct(req, res) {
  const input = productInput.parse(req.body)
  const product = await transaction(async session => {
    if (!await Category.exists({ slug: input.category }).session(session)) throw fail(400, 'Create the category before adding its products.')
    const p = req.params.id ? await Product.findById(objectId.parse(req.params.id)).session(session) : new Product()
    if (!p) throw fail(404, 'Product not found')
    if (req.params.id && input.version !== p.__v) throw fail(409, 'This product changed. Refresh it before saving.')
    const { compareAtPrice, version: _version, price, ...fields } = input
    p.set({ ...fields, price: compareAtPrice || price, discountPrice: compareAtPrice > price ? price : undefined })
    await p.save({ session })
    let variant = await ProductVariant.findOne({ product: p._id }).sort({ createdAt: 1 }).session(session)
    if (variant && variant.reservedQuantity > input.stock) throw fail(409, 'Stock cannot be below the quantity reserved by pending orders.')
    if (!variant) variant = new ProductVariant({ product: p._id, reservedQuantity: 0 })
    const difference = input.stock - (variant.stockOnHand || 0)
    variant.set({ sku: input.sku, price, compareAtPrice: compareAtPrice || undefined, stockOnHand: input.stock, active: input.status === 'published', images: input.images })
    await variant.save({ session })
    if (difference) await InventoryMovement.create([{ variant: variant._id, delta: difference, reason: 'adjustment', actor: req.user._id, note: 'Admin catalog update' }], { session })
    return p
  })
  await audit(req, req.params.id ? 'update' : 'create', 'product', product._id)
  res.json({ item: product })
}
router.post('/products', saveProduct); router.put('/products/:id', saveProduct)
router.delete('/products/:id', async (req, res) => {
  const id = objectId.parse(req.params.id)
  await transaction(async session => { await Product.updateOne({ _id: id }, { $set: { status: 'archived' }, $inc: { __v: 1 } }, { session }); await ProductVariant.updateMany({ product: id }, { $set: { active: false } }, { session }) })
  await audit(req, 'archive', 'product', id); res.json({ message: 'Product archived' })
})
router.get('/settings', async (_req, res) => res.json({ settings: await SiteSettings.findOne({ key: 'site' }).lean(), homepage: await Homepage.findOne({ key: 'home' }).lean() }))
router.put('/settings', async (req, res) => {
  const link = z.object({ label: text(80).min(1), href: internalLink }).strict()
  const input = z.object({ brandName: text(100).min(1), announcement: text(300), contactEmail: z.union([z.string().email().max(254), z.literal('')]), shippingPaise: money, freeShippingThresholdPaise: money, navigation: z.array(link).max(30).optional(), footerLinks: z.array(link).max(50).optional(), testimonials: z.array(z.object({ name: text(100).min(1), text: text(1000).min(1), rating: z.number().int().min(1).max(5) }).strict()).max(30) }).strict().parse(req.body)
  const settings = await SiteSettings.findOneAndUpdate({ key: 'site' }, { $set: { ...input, updatedBy: req.user._id } }, { upsert: true, new: true, runValidators: true })
  await audit(req, 'update', 'settings', settings._id); res.json({ settings })
})
router.put('/homepage', async (req, res) => {
  const input = z.object({ status: z.enum(['draft', 'published']), sections: z.array(z.object({ slot: z.enum(['hero', 'featured', 'promo']), type: z.enum(['hero', 'promo']), heading: text(200), body: text(10000), eyebrow: text(100), image: imageUrl, buttonText: text(80), link: internalLink, visible: z.boolean(), order: z.number().int().min(0).max(100) }).strict()).max(20) }).strict().parse(req.body)
  const homepage = await Homepage.findOneAndUpdate({ key: 'home' }, { $set: { ...input, updatedBy: req.user._id, publishedAt: new Date() } }, { upsert: true, new: true, runValidators: true })
  await audit(req, 'update', 'homepage', homepage._id); res.json({ homepage })
})
router.get('/orders', async (req, res) => { const { page } = pagination.parse(req.query); res.json({ items: await Order.find().sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(), total: await Order.countDocuments(), page, pages: Math.ceil(await Order.countDocuments() / 20) }) })
router.post('/orders/:id/check', async (req, res) => { const order = await Order.findById(objectId.parse(req.params.id)); if (!order) throw fail(404, 'Order not found'); res.json({ order: await checkOrder(order, req.app.locals.payments) }) })
router.patch('/orders/:id', async (req, res) => {
  const input = z.object({ fulfillmentStatus: z.enum(['processing','shipped','delivered','cancelled']), trackingNumber: z.string().max(100).default('') }).strict().parse(req.body)
  res.json({ order: await fulfillOrder(objectId.parse(req.params.id), input, req.user._id) })
})
router.get('/customers', async (req, res) => { const { page } = pagination.parse(req.query); const filter = { role: 'customer' }; const total = await User.countDocuments(filter); res.json({ items: await User.find(filter).select('name email phone status createdAt').sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(), page, total, pages: Math.ceil(total / 20) }) })
router.patch('/customers/:id', async (req, res) => { const { status } = z.object({ status: z.enum(['active', 'suspended']) }).strict().parse(req.body); const item = await User.findOneAndUpdate({ _id: objectId.parse(req.params.id), role: 'customer' }, { $set: { status }, $inc: { sessionVersion: 1 } }, { new: true }).select('name email status'); if (!item) throw fail(404, 'Customer not found'); await audit(req, 'update', 'customer', item._id); res.json({ item }) })
router.get('/reviews', async (req, res) => { const { page } = pagination.parse(req.query); const total = await Review.countDocuments(); res.json({ items: await Review.find().sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(), page, total, pages: Math.ceil(total / 20) }) })
router.patch('/reviews/:id', async (req, res) => {
  const { moderation } = z.object({ moderation: z.enum(['approved', 'rejected', 'pending']) }).strict().parse(req.body)
  await transaction(async session => {
    const review = await Review.findByIdAndUpdate(objectId.parse(req.params.id), { $set: { moderation } }, { new: true, session }); if (!review) throw fail(404, 'Review not found')
    const values = await Review.aggregate([{ $match: { product: review.product, moderation: 'approved' } }, { $group: { _id: null, rating: { $avg: '$rating' }, count: { $sum: 1 } } }]).session(session)
    await Product.updateOne({ _id: review.product }, { $set: { rating: values[0]?.rating || 0, numReviews: values[0]?.count || 0 } }, { session })
  })
  res.json({ message: 'Review updated' })
})
for (const [resource, Model] of [['subscribers', Subscriber], ['messages', ContactMessage]]) {
  router.get(`/${resource}`, async (req, res) => { const { page } = pagination.parse(req.query); const total = await Model.countDocuments(); res.json({ items: await Model.find().sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(), page, total, pages: Math.ceil(total / 20) }) })
}
router.patch('/messages/:id', async (req, res) => { await ContactMessage.updateOne({ _id: objectId.parse(req.params.id) }, { $set: { status: 'read' } }); res.json({ message: 'Marked as read' }) })
router.get('/pages/by-slug/:slug', async (req, res) => {
  const item = await Page.findOne({ slug: slug.parse(req.params.slug) }).lean()
  res.set('Cache-Control', 'no-store').json({ item })
})
for (const [resource, [Model, schema]] of Object.entries(resources)) {
  const isArticle = ['blogs', 'pages'].includes(resource)
  router.get(`/${resource}`, async (req, res) => {
    const input = (isArticle ? pagination.extend({ status: z.union([status, z.literal('')]).default('') }) : pagination).parse(req.query)
    const filter = isArticle ? {
      ...(input.status && { status: input.status }),
      ...(input.search && { title: { $regex: input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }),
    } : {}
    const [items, total] = await Promise.all([
      Model.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((input.page - 1) * 20).limit(20).lean(),
      Model.countDocuments(filter),
    ])
    res.set('Cache-Control', 'no-store').json({ items, page: input.page, total, pages: Math.ceil(total / 20) })
  })
  const save = async (req, res) => {
    const input = schema.parse(req.body)
    const updatedAt = input.updatedAt
    if (isArticle) {
      delete input.updatedAt
      const previous = req.params.id ? await Model.findById(objectId.parse(req.params.id)).select('publishedAt').lean() : null
      if (req.params.id && !previous) throw fail(404, 'Entry not found')
      input.author = req.user._id
      if (input.status === 'published' && !previous?.publishedAt) input.publishedAt = new Date()
    }
    if (resource === 'categories' && req.params.id) {
      const old = await Category.findById(objectId.parse(req.params.id))
      if (old && old.slug !== input.slug && await Product.exists({ category: old.slug })) throw fail(409, 'This category has products. Keep its slug or move the products first.')
    }
    let item
    try {
      item = req.params.id
        ? isArticle && updatedAt
          ? await Model.findOneAndUpdate({ _id: objectId.parse(req.params.id), updatedAt: new Date(updatedAt) }, { $set: input }, { new: true, runValidators: true })
          : await Model.findByIdAndUpdate(objectId.parse(req.params.id), { $set: input }, { new: true, runValidators: true })
        : await Model.create(input)
    } catch (error) {
      if (isArticle && error.code === 11000) throw fail(409, 'This page address is already in use. Choose another slug, or edit the existing entry.')
      throw error
    }
    if (!item && isArticle && updatedAt) throw fail(409, 'This content changed. Reload it before saving again.')
    if (!item) throw fail(404, 'Entry not found'); await audit(req, 'save', resource, item._id); res.json({ item })
  }
  router.post(`/${resource}`, save); router.put(`/${resource}/:id`, save)
  router.delete(`/${resource}/:id`, async (req, res) => { const id = objectId.parse(req.params.id); await Model.updateOne({ _id: id }, { $set: resource === 'categories' ? { active: false } : { status: 'archived' } }); await audit(req, 'archive', resource, id); res.json({ message: 'Entry archived' }) })
}
export default router
