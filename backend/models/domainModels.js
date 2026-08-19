import mongoose from 'mongoose'

const { Schema } = mongoose
const id = () => ({ type: Schema.Types.ObjectId, required: true })
const timestamps = { timestamps: true, strict: 'throw', optimisticConcurrency: true }
const money = { type: Number, required: true, min: 0, max: 100000000, validate: Number.isInteger }
const quantity = { type: Number, required: true, min: 1, max: 10000, validate: Number.isInteger }
const state = (values, defaultValue) => ({ type: String, enum: values, default: defaultValue })
const collectionNames = {
  AuthToken: 'auth_tokens', ProductVariant: 'product_variants', ProductCollection: 'product_collections',
  SiteSettings: 'site_settings', BlogPost: 'blog_posts', PaymentEvent: 'payment_events', InventoryReservation: 'inventory_reservations',
  InventoryMovement: 'inventory_movements', CouponRedemption: 'coupon_redemptions', AuditLog: 'audit_logs',
}
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema, collectionNames[name])

const tokenSchema = new Schema({
  user: id(), tokenHash: { type: String, required: true, maxlength: 128 },
  purpose: state(['email_verification', 'password_reset'], 'email_verification'),
  expiresAt: { type: Date, required: true }, consumedAt: { type: Date, default: null },
}, timestamps)
tokenSchema.index({ tokenHash: 1, purpose: 1 }, { unique: true })
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const AuthToken = model('AuthToken', tokenSchema)

const variantSchema = new Schema({
  product: id(), sku: { type: String, required: true, uppercase: true, trim: true, maxlength: 64 },
  size: { type: String, maxlength: 50 }, shade: { type: String, maxlength: 50 },
  price: money, compareAtPrice: { ...money, required: false },
  stockOnHand: { type: Number, required: true, min: 0, max: 100000000, validate: Number.isInteger },
  reservedQuantity: { type: Number, required: true, default: 0, min: 0, max: 100000000, validate: Number.isInteger },
  images: { type: [String], default: [], validate: (value) => value.length <= 12 },
  active: { type: Boolean, default: true },
}, timestamps)
variantSchema.path('reservedQuantity').validate(function (value) { return value <= this.stockOnHand }, 'Reserved quantity cannot exceed stock on hand')
variantSchema.index({ sku: 1 }, { unique: true })
variantSchema.index({ product: 1, active: 1 })
export const ProductVariant = model('ProductVariant', variantSchema)

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 }, slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
  parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null }, image: { type: String, maxlength: 2048 }, order: { type: Number, default: 0, min: 0, max: 100000, validate: Number.isInteger }, active: { type: Boolean, default: true },
}, timestamps)
categorySchema.index({ slug: 1 }, { unique: true })
export const Category = model('Category', categorySchema)

const collectionSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 }, slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 140 }, description: { type: String, maxlength: 1000 },
  products: { type: [{ type: Schema.Types.ObjectId, ref: 'Product' }], default: [], validate: (value) => value.length <= 500 },
  status: state(['draft', 'published', 'archived'], 'draft'), order: { type: Number, default: 0, min: 0, max: 100000, validate: Number.isInteger },
}, timestamps)
collectionSchema.index({ slug: 1 }, { unique: true })
export const ProductCollection = model('ProductCollection', collectionSchema)

const mediaSchema = new Schema({
  owner: id(), provider: { type: String, enum: ['cloudinary', 'local'], required: true }, providerAssetId: { type: String, required: true, maxlength: 300 }, url: { type: String, required: true, maxlength: 2048 },
  contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], required: true }, bytes: { type: Number, required: true, min: 1, max: 10485760, validate: Number.isInteger }, width: { type: Number, min: 1, max: 10000, validate: Number.isInteger }, height: { type: Number, min: 1, max: 10000, validate: Number.isInteger },
  verified: { type: Boolean, default: false }, state: state(['quarantined', 'verified', 'rejected', 'attached'], 'quarantined'),
}, timestamps)
mediaSchema.index({ provider: 1, providerAssetId: 1 }, { unique: true })
export const Media = model('Media', mediaSchema)

const sectionSchema = new Schema({
  type: { type: String, enum: ['hero', 'category_grid', 'product_grid', 'rich_text', 'promo'], required: true }, order: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger }, visible: { type: Boolean, default: true },
  heading: { type: String, maxlength: 200 }, body: { type: String, maxlength: 10000 }, imageMedia: { type: Schema.Types.ObjectId, ref: 'Media' }, link: { type: String, maxlength: 500 }, productIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Product' }], default: [], validate: (value) => value.length <= 50 },
}, { _id: true, strict: 'throw' })
const homepageSchema = new Schema({ key: { type: String, enum: ['home'], unique: true, required: true }, status: state(['draft', 'published'], 'draft'), sections: { type: [sectionSchema], required: true, validate: (value) => value.length <= 20 }, publishedAt: Date, updatedBy: id() }, timestamps)
export const Homepage = model('Homepage', homepageSchema)

const pageSchema = new Schema({
  title: { type: String, required: true, maxlength: 200 }, slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 }, content: { type: String, required: true, maxlength: 50000 }, status: state(['draft', 'published', 'archived'], 'draft'), seo: { title: { type: String, maxlength: 160 }, description: { type: String, maxlength: 320 } }, author: id(), publishedAt: Date,
}, timestamps)
pageSchema.index({ slug: 1 }, { unique: true })
export const Page = model('Page', pageSchema)

const blogSchema = new Schema({
  title: { type: String, required: true, maxlength: 200 }, slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 }, excerpt: { type: String, maxlength: 1000 }, content: { type: String, required: true, maxlength: 50000 }, author: id(), status: state(['draft', 'published', 'archived'], 'draft'), seo: { title: { type: String, maxlength: 160 }, description: { type: String, maxlength: 320 } }, publishedAt: Date,
}, timestamps)
blogSchema.index({ slug: 1 }, { unique: true })
export const BlogPost = model('BlogPost', blogSchema)

const settingsSchema = new Schema({
  key: { type: String, enum: ['site'], unique: true, required: true }, brandName: { type: String, required: true, maxlength: 100 }, announcement: { type: String, maxlength: 300 }, contactEmail: { type: String, maxlength: 254 }, navigation: { type: [{ label: { type: String, required: true, maxlength: 80 }, href: { type: String, required: true, maxlength: 500 } }], validate: (value) => value.length <= 30 }, footerLinks: { type: [{ label: { type: String, required: true, maxlength: 80 }, href: { type: String, required: true, maxlength: 500 } }], validate: (value) => value.length <= 50 }, socialLinks: { type: [{ platform: { type: String, required: true, maxlength: 30 }, href: { type: String, required: true, maxlength: 500 } }], validate: (value) => value.length <= 20 }, updatedBy: id(),
}, timestamps)
export const SiteSettings = model('SiteSettings', settingsSchema)

const cartSchema = new Schema({ customer: id(), items: { type: [{ variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true }, quantity }], default: [], validate: (value) => value.length <= 100 }, updatedAt: { type: Date, default: Date.now } }, { strict: 'throw', versionKey: '__v' })
cartSchema.index({ customer: 1 }, { unique: true })
export const Cart = model('Cart', cartSchema)

const wishlistSchema = new Schema({ customer: id(), products: { type: [{ type: Schema.Types.ObjectId, ref: 'Product' }], default: [], validate: (value) => value.length <= 1000 } }, timestamps)
wishlistSchema.index({ customer: 1 }, { unique: true })
export const Wishlist = model('Wishlist', wishlistSchema)

const addressSnapshotSchema = new Schema({ name: { type: String, required: true, maxlength: 100 }, line1: { type: String, required: true, maxlength: 200 }, line2: { type: String, maxlength: 200 }, city: { type: String, required: true, maxlength: 100 }, state: { type: String, required: true, maxlength: 100 }, postalCode: { type: String, required: true, maxlength: 20 }, country: { type: String, required: true, maxlength: 2 }, phone: { type: String, maxlength: 30 } }, { _id: false, strict: 'throw' })
const orderItemSchema = new Schema({ variant: id(), sku: { type: String, required: true, maxlength: 64 }, name: { type: String, required: true, maxlength: 160 }, quantity, unitPricePaise: money, lineTotalPaise: money }, { _id: false, strict: 'throw' })
const orderSchema = new Schema({
  orderNumber: { type: String, required: true, uppercase: true, maxlength: 40 }, customer: id(), items: { type: [orderItemSchema], required: true, validate: (value) => value.length >= 1 && value.length <= 100 }, deliveryAddress: { type: addressSnapshotSchema, required: true }, subtotalPaise: money, discountPaise: { ...money, default: 0, required: true }, shippingPaise: { ...money, default: 0, required: true }, totalPaise: money, currency: { type: String, enum: ['INR'], default: 'INR' }, paymentStatus: state(['pending', 'authorized', 'paid', 'failed', 'refunded'], 'pending'), fulfillmentStatus: state(['pending', 'processing', 'shipped', 'delivered', 'cancelled'], 'pending'), idempotencyKey: { type: String, required: true, maxlength: 128 },
}, timestamps)
orderSchema.index({ orderNumber: 1 }, { unique: true })
orderSchema.index({ customer: 1, createdAt: -1 })
orderSchema.index({ customer: 1, idempotencyKey: 1 }, { unique: true })
export const Order = model('Order', orderSchema)

const paymentSchema = new Schema({ order: id(), provider: { type: String, enum: ['disabled', 'sandbox'], required: true }, environment: { type: String, enum: ['sandbox', 'live'], required: true }, providerPaymentId: { type: String, maxlength: 200 }, amountPaise: money, currency: { type: String, enum: ['INR'], default: 'INR' }, status: state(['created', 'pending', 'succeeded', 'failed', 'refunded'], 'created') }, timestamps)
paymentSchema.index({ provider: 1, environment: 1, providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } })
export const Payment = model('Payment', paymentSchema)

const paymentEventSchema = new Schema({ provider: { type: String, required: true, maxlength: 50 }, environment: { type: String, enum: ['sandbox', 'live'], required: true }, providerEventId: { type: String, required: true, maxlength: 200 }, payment: { type: Schema.Types.ObjectId, ref: 'Payment' }, payloadHash: { type: String, required: true, maxlength: 128 }, state: state(['received', 'processed', 'ignored', 'failed'], 'received'), processedAt: Date }, timestamps)
paymentEventSchema.index({ provider: 1, environment: 1, providerEventId: 1 }, { unique: true })
export const PaymentEvent = model('PaymentEvent', paymentEventSchema)

const reservationSchema = new Schema({ order: id(), variant: id(), quantity, expiresAt: { type: Date, required: true }, state: state(['active', 'released', 'consumed', 'expired'], 'active'), releasedAt: Date }, timestamps)
reservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
reservationSchema.index({ order: 1, variant: 1 }, { unique: true })
export const InventoryReservation = model('InventoryReservation', reservationSchema)

const movementSchema = new Schema({ variant: id(), delta: { type: Number, required: true, min: -100000000, max: 100000000, validate: Number.isInteger }, reason: { type: String, enum: ['purchase', 'restock', 'adjustment', 'return', 'reservation_release'], required: true }, actor: { type: Schema.Types.ObjectId, ref: 'User' }, order: { type: Schema.Types.ObjectId, ref: 'Order' }, note: { type: String, maxlength: 500 } }, { timestamps: true, strict: 'throw', versionKey: false })
export const InventoryMovement = model('InventoryMovement', movementSchema)

const couponSchema = new Schema({ code: { type: String, required: true, uppercase: true, trim: true, maxlength: 50 }, type: { type: String, enum: ['percentage', 'fixed'], required: true }, percentage: { type: Number, min: 1, max: 100 }, amountPaise: { type: Number, min: 1, max: 100000000, validate: Number.isInteger }, startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true }, usageLimit: { type: Number, min: 1, max: 100000000, validate: Number.isInteger }, usageCount: { type: Number, default: 0, min: 0, max: 100000000, validate: Number.isInteger }, active: { type: Boolean, default: true } }, timestamps)
couponSchema.index({ code: 1 }, { unique: true })
couponSchema.path('endsAt').validate(function (value) { return !this.startsAt || value > this.startsAt }, 'Coupon end must be after start')
couponSchema.pre('validate', function (next) { if (this.type === 'percentage' && this.percentage == null) this.invalidate('percentage', 'Percentage coupon requires percentage'); if (this.type === 'fixed' && this.amountPaise == null) this.invalidate('amountPaise', 'Fixed coupon requires amount'); next() })
export const Coupon = model('Coupon', couponSchema)

const redemptionSchema = new Schema({ coupon: id(), customer: id(), order: id(), state: state(['reserved', 'redeemed', 'released'], 'reserved'), amountPaise: money }, timestamps)
redemptionSchema.index({ coupon: 1, customer: 1, order: 1 }, { unique: true })
export const CouponRedemption = model('CouponRedemption', redemptionSchema)

const reviewSchema = new Schema({ product: id(), customer: id(), order: { type: Schema.Types.ObjectId, ref: 'Order' }, rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger }, comment: { type: String, required: true, maxlength: 3000 }, moderation: state(['pending', 'approved', 'rejected'], 'pending') }, timestamps)
reviewSchema.index({ product: 1, moderation: 1, createdAt: -1 })
reviewSchema.index({ product: 1, customer: 1 }, { unique: true })
export const Review = model('Review', reviewSchema)

const auditSchema = new Schema({ actor: { type: Schema.Types.ObjectId, ref: 'User' }, action: { type: String, required: true, maxlength: 100 }, resourceType: { type: String, required: true, maxlength: 100 }, resourceId: { type: String, required: true, maxlength: 100 }, summary: { type: String, required: true, maxlength: 1000 }, requestId: { type: String, maxlength: 100 } }, { timestamps: true, strict: 'throw', versionKey: false })
auditSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 })
auditSchema.index({ actor: 1, createdAt: -1 })
export const AuditLog = model('AuditLog', auditSchema)
