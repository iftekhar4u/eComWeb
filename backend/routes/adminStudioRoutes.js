import { paymentDetails } from '../payments/adminRoutes.js'
import { Router } from 'express'
import { z } from 'zod'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { Order, ProductVariant, Review, Category, InventoryMovement, AuditLog, Coupon, Payment } from '../models/domainModels.js'
import { protect, requireAdmin } from '../middleware/authMiddleware.js'
import { objectId, fail } from '../services/validation.js'
import { transaction } from '../services/commerce.js'
import { TIMEZONE, LOW_STOCK, periods, change, revenueExpression } from '../services/adminStudioMetrics.js'
const router = Router()
router.use(protect, requireAdmin)
const escaped = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const query = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), search: z.string().trim().max(100).default(''), status: z.string().max(30).default(''), category: z.string().max(120).default(''), from: z.string().date().optional(), to: z.string().date().optional() }).strict()
async function pageOf(Model, filter, page, selection) {
  const [items, total] = await Promise.all([Model.find(filter).select(selection || '').sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(), Model.countDocuments(filter)])
  return { items, total, page, pages: Math.ceil(total / 20) }
}
const available = { $subtract: ['$stockOnHand', '$reservedQuantity'] }
const lowFilter = { active: true, $expr: { $lte: [available, LOW_STOCK] } }
router.get('/overview', async (req, res) => {
  const { days, interval } = z.object({ days: z.coerce.number().refine(n => [7,30,90].includes(n)).default(30), interval: z.enum(['day','week']).default('day') }).strict().parse(req.query)
  const { start, end, previousStart } = periods(days)
  const range = { $gte: start, $lt: end }, before = { $gte: previousStart, $lt: start }
  const sales = async createdAt => (await Order.aggregate([{ $match: { createdAt, paymentStatus: 'paid', paymentEnvironment: 'live' } }, { $group: { _id: null, total: { $sum: revenueExpression } } }]))[0]?.total || 0
  const [revenue, previousRevenue, orders, previousOrders, customers, previousCustomers, lowStock, pendingReviews, toFulfill, recentOrders, series, bestSellers] = await Promise.all([
    sales(range), sales(before), Order.countDocuments({ createdAt: range }), Order.countDocuments({ createdAt: before }),
    User.countDocuments({ role: 'customer', createdAt: range }), User.countDocuments({ role: 'customer', createdAt: before }),
    ProductVariant.countDocuments(lowFilter), Review.countDocuments({ moderation: 'pending' }), Order.countDocuments({ fulfillmentStatus: 'processing', inventoryStatus: 'committed' }),
    Order.find({ createdAt: range }).sort({ createdAt: -1 }).limit(5).select('orderNumber deliveryAddress.name totalPaise paymentStatus fulfillmentStatus createdAt').lean(),
    Order.aggregate([{ $match: { createdAt: range, paymentStatus: 'paid', paymentEnvironment: 'live' } }, { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: interval, timezone: TIMEZONE, ...(interval === 'week' ? { startOfWeek: 'monday' } : {}) } }, amount: { $sum: revenueExpression } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: { createdAt: range, paymentStatus: 'paid', paymentEnvironment: 'live', refundedPaise: 0, fulfillmentStatus: { $ne: 'cancelled' } } }, { $unwind: '$items' }, { $group: { _id: '$items.sku', name: { $first: '$items.name' }, units: { $sum: '$items.quantity' } } }, { $sort: { units: -1, _id: 1 } }, { $limit: 4 }]),
  ])
  res.json({ days, interval, timezone: TIMEZONE, start, end, revenue, orders, customers, lowStock, pendingReviews, toFulfill, recentOrders, series, bestSellers, threshold: LOW_STOCK, paymentsConfigured: (await req.app.locals.payments.publicConfig()).razorpayEnabled, changes: { revenue: change(revenue, previousRevenue), orders: change(orders, previousOrders), customers: change(customers, previousCustomers) } })
})
router.get('/products', async (req,res) => {
  const { page, search, status, category } = query.parse(req.query)
  const filter = { ...(search && { $or: ['name','sku'].map(k => ({ [k]: { $regex: escaped(search), $options: 'i' } })) }), ...(status && { status }), ...(category && { category }) }
  const data = await pageOf(Product, filter, page)
  const variants = await ProductVariant.find({ product: { $in: data.items.map(p => p._id) } }).sort({ createdAt: 1 }).lean()
  res.json({ ...data, items: data.items.map(p => ({ ...p, inventory: variants.find(v => String(v.product) === String(p._id)), variantCount: variants.filter(v => String(v.product) === String(p._id)).length })) })
})
router.get('/categories', async (req,res) => {
  const {page,search,status} = query.parse(req.query)
  const data = await pageOf(Category, { ...(search && { name: { $regex: escaped(search), $options: 'i' } }), ...(status && { active: status === 'active' }) }, page)
  const counts = await Product.aggregate([{ $match: { category: { $in: data.items.map(c=>c.slug) }, status: { $ne: 'archived' } } }, { $group: { _id: '$category', count: { $sum: 1 } } }])
  res.json({ ...data, items: data.items.map(c=>({...c,productCount:counts.find(n=>n._id===c.slug)?.count || 0})) })
})
router.get('/orders', async (req,res) => {
  const {page,search,status,from,to} = query.parse(req.query)
  const filter = { ...(search && { $or: ['orderNumber','deliveryAddress.name'].map(k=>({[k]:{$regex:escaped(search),$options:'i'}})) }), ...(status && {fulfillmentStatus:status}) }
  if (from || to) filter.createdAt = { ...(from && {$gte:new Date(`${from}T00:00:00+05:30`)}), ...(to && {$lt:new Date(new Date(`${to}T00:00:00+05:30`).getTime()+86400000)}) }
  res.json(await pageOf(Order,filter,page))
})
router.get('/orders/:id', async (req,res) => {
  const item = await Order.findById(objectId.parse(req.params.id)).lean()
  if (!item) throw fail(404,'Order not found')
  const [payment, history] = await Promise.all([Payment.findOne({order:item._id}).select('provider providerPaymentId providerOrderId status').lean(), AuditLog.find({resourceType:'order',resourceId:String(item._id)}).sort({createdAt:-1}).limit(50).select('action summary createdAt').lean()])
  res.json({item,payment,history,...await paymentDetails(item._id),serverNow:new Date()})
})
router.get('/customers', async (req,res) => {
  const {page,search,status} = query.parse(req.query)
  const data=await pageOf(User,{role:'customer',...(search && {$or:['name','email'].map(k=>({[k]:{$regex:escaped(search),$options:'i'}}))}),...(status && {status})},page,'name email phone status createdAt')
  const totals=await Order.aggregate([{$match:{customer:{$in:data.items.map(c=>c._id)}}},{$group:{_id:'$customer',orderCount:{$sum:1},spend:{$sum:{$cond:[{$and:[{$eq:['$paymentStatus','paid']},{$eq:['$paymentEnvironment','live']}]},revenueExpression,0]}}}}])
  res.json({...data,items:data.items.map(c=>({...c,...(totals.find(t=>String(t._id)===String(c._id)) || {orderCount:0,spend:0}),_id:c._id}))})
})
router.get('/customers/:id', async(req,res)=>{
  const item=await User.findOne({_id:objectId.parse(req.params.id),role:'customer'}).select('name email phone status createdAt').lean()
  if(!item) throw fail(404,'Customer not found')
  const {page}=query.parse(req.query)
  res.json({item,orders:await pageOf(Order,{customer:item._id},page)})
})
router.get('/reviews', async(req,res)=>{
  const {page,search,status}=query.parse(req.query)
  const data=await pageOf(Review,{...(status&&{moderation:status}),...(search&&{comment:{$regex:escaped(search),$options:'i'}})},page)
  const [products,customers]=await Promise.all([Product.find({_id:{$in:data.items.map(r=>r.product)}}).select('name').lean(),User.find({_id:{$in:data.items.map(r=>r.customer)}}).select('name').lean()])
  res.json({...data,items:data.items.map(r=>({...r,productName:products.find(p=>String(p._id)===String(r.product))?.name || 'Removed product',customerName:customers.find(c=>String(c._id)===String(r.customer))?.name || 'Customer'}))})
})
router.get('/inventory', async(req,res)=>{
  const {page,search,status}=query.parse(req.query)
  const filter={...(search&&{sku:{$regex:escaped(search),$options:'i'}}),...(status==='low'?lowFilter:status==='out'?{active:true,$expr:{$lte:[available,0]}}:{})}
  const data=await pageOf(ProductVariant,filter,page)
  const products=await Product.find({_id:{$in:data.items.map(v=>v.product)}}).select('name').lean()
  res.json({...data,threshold:LOW_STOCK,items:data.items.map(v=>({...v,name:products.find(p=>String(p._id)===String(v.product))?.name || v.sku,available:v.stockOnHand-v.reservedQuantity}))})
})
router.get('/inventory/:id',async(req,res)=>{
  const item=await ProductVariant.findById(objectId.parse(req.params.id)).lean()
  if(!item) throw fail(404,'Variant not found')
  const product=await Product.findById(item.product).select('name').lean()
  res.json({item:{...item,name:product?.name||item.sku,available:item.stockOnHand-item.reservedQuantity}})
})
router.get('/inventory/:id/history',async(req,res)=>{
  const {page}=query.parse(req.query)
  const data=await pageOf(InventoryMovement,{variant:objectId.parse(req.params.id)},page)
  const actors=await User.find({_id:{$in:data.items.map(m=>m.actor).filter(Boolean)}}).select('name').lean()
  res.json({...data,items:data.items.map(m=>({...m,actorName:actors.find(a=>String(a._id)===String(m.actor))?.name || 'System'}))})
})
router.patch('/inventory/:id',async(req,res)=>{
  const id=objectId.parse(req.params.id)
  const {stock,expectedStock,note}=z.object({stock:z.number().int().min(0).max(100000000),expectedStock:z.number().int().min(0),note:z.string().trim().min(5).max(300)}).strict().parse(req.body)
  await transaction(async session=>{
    const v=await ProductVariant.findById(id).session(session)
    if(!v) throw fail(404,'Variant not found')
    if(v.stockOnHand!==expectedStock) throw fail(409,'Stock changed. Reload before adjusting.')
    if(stock<v.reservedQuantity) throw fail(409,'Stock cannot be below reserved quantity.')
    const previous=v.stockOnHand; v.stockOnHand=stock; await v.save({session})
    // The legacy catalog API only supports one variant; avoid corrupting its stock mirror.
    if(await ProductVariant.countDocuments({product:v.product}).session(session)!==1) throw fail(409,'Multi-variant catalog updates need a dedicated workflow.')
    await Product.updateOne({_id:v.product},{$set:{stock},$inc:{__v:1}},{session})
    await InventoryMovement.create([{variant:id,delta:stock-previous,reason:'adjustment',actor:req.user._id,note:`${previous} → ${stock}. ${note}`}],{session})
    await AuditLog.create([{actor:req.user._id,action:'adjust',resourceType:'inventory',resourceId:id,summary:`Stock ${previous} → ${stock}: ${note}`}],{session})
  })
  res.json({message:'Stock adjustment saved'})
})
router.get('/discounts',async(req,res)=>{
  const {page,search}=query.parse(req.query)
  res.json({...await pageOf(Coupon,search?{code:{$regex:escaped(search),$options:'i'}}:{},page),writable:false,reason:'Checkout currently calculates discountPaise as zero. Coupon creation and activation are unavailable until checkout enforcement is implemented and approved.'})
})
// Studio adds stricter archival and audited moderation without changing legacy contracts.
router.delete('/categories/:id',async(req,res)=>{
  const id=objectId.parse(req.params.id)
  await transaction(async session=>{
    const category=await Category.findById(id).session(session)
    if(!category) throw fail(404,'Category not found')
    if(await Product.exists({category:category.slug,status:{$ne:'archived'}}).session(session)) throw fail(409,'Move active and draft products before archiving this category.')
    category.active=false;await category.save({session})
    await AuditLog.create([{actor:req.user._id,action:'archive',resourceType:'category',resourceId:id,summary:'Archived an empty category'}],{session})
  })
  res.json({message:'Category archived'})
})
router.patch('/reviews/:id',async(req,res)=>{
  const id=objectId.parse(req.params.id)
  const {moderation}=z.object({moderation:z.enum(['approved','rejected','pending'])}).strict().parse(req.body)
  await transaction(async session=>{
    const review=await Review.findByIdAndUpdate(id,{$set:{moderation}},{new:true,session})
    if(!review) throw fail(404,'Review not found')
    const values=await Review.aggregate([{$match:{product:review.product,moderation:'approved'}},{$group:{_id:null,rating:{$avg:'$rating'},count:{$sum:1}}}]).session(session)
    await Product.updateOne({_id:review.product},{$set:{rating:values[0]?.rating||0,numReviews:values[0]?.count||0}},{session})
    await AuditLog.create([{actor:req.user._id,action:'moderate',resourceType:'review',resourceId:id,summary:`Review set to ${moderation}`}],{session})
  })
  res.json({message:'Review moderation saved'})
})
export default router
