import fs from 'node:fs/promises'
import mongoose from 'mongoose'
import { getConfig } from '../config/env.js'
import User from '../models/User.js'
import Product from '../models/Product.js'
import { Category, ProductVariant, SiteSettings, Homepage, BlogPost, Page, ProductCollection, Cart, Wishlist } from '../models/domainModels.js'
const data = JSON.parse(await fs.readFile(new URL('../data/storefront-seed.json', import.meta.url), 'utf8'))
export async function seedStorefront(author) {
  if (!author) throw new Error('Create an administrator first with npm run create-admin --prefix backend')
  for (const [index, slug] of data.categoryOrder.entries()) {
    const c = data.categoryDetails[slug]
    await Category.updateOne({ slug }, { $setOnInsert: { name: c.label, image: c.image, description: c.description, order: index, active: true } }, { upsert: true, runValidators: true })
  }
  const ids = []
  for (const [index, item] of data.products.entries()) {
    let product = await Product.findOne({ slug: item.slug })
    if (!product) product = await Product.create({ name: item.name, slug: item.slug, category: item.category, gender: item.gender, description: item.description, benefits: item.highlights, price: item.oldPrice * 100, discountPrice: item.price * 100, images: item.images, thumbnail: item.thumbnail, stock: 25, sku: `AUR-${String(item.id).padStart(3,'0')}`, status: 'published', bestSeller: index < 4, newArrival: index >= 4, rating: item.rating, numReviews: item.numReviews, tags: [item.tag], createdAt: new Date(Date.now() - index * 1000) })
    ids.push(product._id)
    if (!await ProductVariant.exists({ product: product._id })) await ProductVariant.create({ product: product._id, sku: product.sku || `AUR-${product._id}`, price: product.discountPrice ?? product.price, compareAtPrice: product.discountPrice !== undefined ? product.price : undefined, stockOnHand: product.stock, reservedQuantity: 0, active: product.status === 'published' })
  }
  await ProductCollection.updateOne({ slug: 'the-glow-collection' }, { $setOnInsert: { name: 'The glow collection', description: 'Build a simple skincare routine for naturally radiant-looking skin.', products: ids.slice(0,4), status: 'published', order: 0 } }, { upsert: true, runValidators: true })
  await SiteSettings.updateOne({ key: 'site' }, { $setOnInsert: { brandName: 'Aurelia Botanical Beauty', announcement: 'Complimentary shipping on orders above Rs. 999', contactEmail: '', shippingPaise: 9900, freeShippingThresholdPaise: 99900, testimonials: data.testimonials, updatedBy: author } }, { upsert: true, runValidators: true })
  const image = (id, width = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`
  await Homepage.updateOne({ key: 'home' }, { $setOnInsert: { status: 'published', updatedBy: author, publishedAt: new Date(), sections: [
    { slot: 'hero', type: 'hero', order: 0, visible: true, eyebrow: 'Aurelia botanical beauty', heading: 'YOUR BEAUTY.\nYOUR RADIANCE.', body: 'Discover skincare and beauty essentials designed for your everyday routine.', image: image('photo-1612817288484-6f916006741a'), buttonText: 'Shop now', link: '/shop' },
    { slot: 'featured', type: 'promo', order: 1, visible: true, eyebrow: 'The glow collection', heading: 'Glow with confidence.', body: 'Build a simple skincare routine for naturally radiant-looking skin.', image: image('photo-1556229010-6c3f2c9c10c1', 1100), buttonText: 'Shop the collection', link: '/collections/the-glow-collection' },
    { slot: 'promo', type: 'promo', order: 2, visible: true, eyebrow: 'Aurelia essentials', heading: 'Your daily beauty essentials', body: 'Discover everyday skincare and personal care favorites.', image: image('photo-1551969014-7ee047889906', 1100), buttonText: 'Explore now', link: '/shop' },
  ] } }, { upsert: true, runValidators: true })
  for (const blog of data.blogs) await BlogPost.updateOne({ slug: blog.slug }, { $setOnInsert: { title: blog.title, excerpt: blog.excerpt, image: blog.image, content: blog.body, author, status: 'published', publishedAt: new Date() } }, { upsert: true, runValidators: true })
  for (const page of [{ slug: 'shipping-returns', title: 'Shipping & returns', content: 'Delivery fees are shown before payment. You can check the progress of your order in My Orders.\n\nFor shipping questions, cancellations or a return request, contact our team with your order number. The store will confirm eligibility and next steps.' }, { slug: 'privacy', title: 'Privacy', content: 'We use the account, address and contact details you provide to manage your account and process orders. Payment details are entered securely in Razorpay checkout; this website does not store your card number or UPI PIN.\n\nContact our team with questions about your information.' }]) await Page.updateOne({ slug: page.slug }, { $setOnInsert: { ...page, status: 'published', author, publishedAt: new Date() } }, { upsert: true, runValidators: true })
  // Preserve existing saved baskets when migrating from the original embedded User fields.
  for await (const user of User.find({ $or: [{ 'cart.0': { $exists: true } }, { 'wishlist.0': { $exists: true } }] }).cursor()) {
    if (user.wishlist?.length) await Wishlist.updateOne({ customer: user._id }, { $setOnInsert: { products: user.wishlist } }, { upsert: true })
    if (user.cart?.length) {
      const items = []
      for (const line of user.cart) { const v = await ProductVariant.findOne({ product: line.product, active: true }); if (v) items.push({ variant: v._id, quantity: Math.max(1, Math.min(99, line.quantity)) }) }
      await Cart.updateOne({ customer: user._id }, { $setOnInsert: { items } }, { upsert: true })
    }
  }
  return { products: ids.length, categories: data.categoryOrder.length, existingRecordsPreserved: true }
}
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--confirm-seed')) throw new Error('Re-run with --confirm-seed to import the supplied demo storefront.')
  const config = getConfig()
  if (!['aurelia_dev','aurelia_test'].includes(new URL(config.MONGO_URI).pathname.slice(1))) throw new Error('Storefront sample seeding is limited to aurelia_dev/aurelia_test')
  try { await mongoose.connect(config.MONGO_URI, { autoIndex: false }); const admin = await User.findOne({ role: 'admin' }); console.log(await seedStorefront(admin?._id)) } finally { await mongoose.disconnect() }
}
