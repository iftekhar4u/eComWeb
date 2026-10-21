import { subscribe } from '../email/publicRoutes.js'
import { Router } from 'express'
import mongoose from 'mongoose'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { Category, SiteSettings, Homepage, BlogPost, Page, ProductCollection, Subscriber, ContactMessage, Review } from '../models/domainModels.js'
import { protect } from '../middleware/authMiddleware.js'
import { objectId, fail } from '../services/validation.js'
import { findPublicProducts } from '../services/catalog.js'
import User from '../models/User.js'
import Product from '../models/Product.js'
import { transaction } from '../services/commerce.js'
const router = Router()
router.get('/storefront', async (_req, res) => {
  const [categories, settings, homepage, blogs, collections] = await Promise.all([
    Category.find({ active: true }).sort({ order: 1 }).select('name slug image description seo').lean(),
    SiteSettings.findOne({ key: 'site' }).select('-updatedBy -__v').lean(),
    Homepage.findOne({ key: 'home', status: 'published' }).select('sections').lean(),
    BlogPost.find({ status: 'published' }).sort({ publishedAt: -1 }).limit(30).select('title slug excerpt image seo').lean(),
    ProductCollection.find({ status: 'published' }).sort({ order: 1 }).select('name slug description').lean(),
  ])
  res.json({ categories, settings, sections: homepage?.sections.filter(s => s.visible).sort((a,b) => a.order - b.order) || [], blogs, collections })
})
router.get('/blogs/:slug', async (req, res) => { const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' }).select('title slug excerpt image content seo').lean(); if (!post) throw fail(404, 'Article not found'); res.json(post) })
router.get('/pages/:slug', async (req, res) => { const page = await Page.findOne({ slug: req.params.slug, status: 'published' }).select('title slug content seo').lean(); if (!page) throw fail(404, 'Page not found'); res.json(page) })
router.get('/collections/:slug', async (req, res) => { const collection = await ProductCollection.findOne({ slug: req.params.slug, status: 'published' }).lean(); if (!collection) throw fail(404, 'Collection not found'); res.json({ collection, products: await findPublicProducts(collection.products) }) })
const submissions = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Please try again later.' } })
router.post('/newsletter', submissions, async (req, res) => {
  const { email } = z.object({ email: z.string().trim().email().max(254), consent: z.literal(true) }).strict().parse(req.body)
  await subscribe(email, req.app.locals.email)
  res.json({ message: 'Your subscription request has been saved. Confirmation is required before newsletters are sent.' })
})
router.post('/contact', submissions, async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), message: z.string().trim().min(10).max(3000) }).strict().parse(req.body)
  await transaction(async session => {
    const [message] = await ContactMessage.create([input], { session })
    await req.app.locals.email.event('contact', { messageId: String(message._id), contactName: input.name, contactEmail: input.email, contactMessage: input.message }, { session })
  })
  res.status(201).json({ message: 'Your message has been saved for our team.' })
})
router.get('/reviews/:productId', async (req, res) => {
  const product = objectId.parse(req.params.productId)
  const reviews = await Review.find({ product, moderation: 'approved' }).sort({ createdAt: -1 }).limit(50).select('customer rating comment createdAt').lean()
  const users = await User.find({ _id: { $in: reviews.map(r => r.customer) } }).select('name').lean()
  res.json({ reviews: reviews.map(r => ({ id: r._id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, name: users.find(u => String(u._id) === String(r.customer))?.name?.split(' ')[0] || 'Customer' })) })
})
router.post('/reviews/:productId', protect, async (req, res) => {
  const product = objectId.parse(req.params.productId)
  if (!(await findPublicProducts([product])).length) throw fail(404, 'Product not found')
  const input = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(10).max(3000) }).strict().parse(req.body)
  await transaction(async session => {
    await Review.findOneAndUpdate({ product, customer: req.user._id }, { $set: { ...input, moderation: 'pending' } }, { upsert: true, runValidators: true, session })
    const values = await Review.aggregate([{ $match: { product: new mongoose.Types.ObjectId(product), moderation: 'approved' } }, { $group: { _id: null, rating: { $avg: '$rating' }, count: { $sum: 1 } } }]).session(session)
    await Product.updateOne({ _id: product }, { $set: { rating: values[0]?.rating || 0, numReviews: values[0]?.count || 0 } }, { session })
  })
  res.status(201).json({ message: 'Thank you. Your review is awaiting moderation.' })
})
export default router
