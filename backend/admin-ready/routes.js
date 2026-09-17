import { Router } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { Order, ProductVariant, Review, Coupon, Homepage, SiteSettings, AuditLog } from '../models/domainModels.js'
import { protect, requireAdmin } from '../middleware/authMiddleware.js'
import { objectId, fail, imageUrl, internalLink } from '../services/validation.js'
import { periods, change, revenueExpression, LOW_STOCK, TIMEZONE } from '../services/adminStudioMetrics.js'
import { transaction } from '../services/commerce.js'
const router = Router()
router.use(protect,requireAdmin)
router.use((_req,res,next) => {res.set('Cache-Control','no-store');next()})
const search = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const pageInput = z.object({page:z.coerce.number().int().min(1).max(10000).default(1),search:z.string().trim().max(100).default(''),status:z.string().max(30).default('')}).strict()
async function audit(req,action,type,id,summary) {await AuditLog.create({actor:req.user._id,action,resourceType:type,resourceId:String(id),summary})}
router.get('/overview',async(req,res) => {
  const {days} = z.object({days:z.coerce.number().refine(n => [7,30,90].includes(n)).default(30)}).strict().parse(req.query)
  const {start,end,previousStart} = periods(days), range = {$gte:start,$lt:end}, before = {$gte:previousStart,$lt:start}
  const sales = async createdAt => (await Order.aggregate([{$match:{createdAt,paymentStatus:'paid'}},{$group:{_id:null,total:{$sum:revenueExpression}}}]))[0]?.total || 0
  const [revenue,previousRevenue,orders,previousOrders,customers,previousCustomers,lowStock,pendingReviews,toFulfill,recentOrders,bestSellers] = await Promise.all([
    sales(range),sales(before),Order.countDocuments({createdAt:range}),Order.countDocuments({createdAt:before}),User.countDocuments({role:'customer',createdAt:range}),User.countDocuments({role:'customer',createdAt:before}),
    ProductVariant.countDocuments({active:true,$expr:{$lte:[{$subtract:['$stockOnHand','$reservedQuantity']},LOW_STOCK]}}),Review.countDocuments({moderation:'pending'}),Order.countDocuments({fulfillmentStatus:'processing',inventoryStatus:'committed'}),
    Order.find({createdAt:range}).sort({createdAt:-1}).limit(5).select('orderNumber deliveryAddress.name totalPaise paymentStatus fulfillmentStatus createdAt').lean(),
    Order.aggregate([{$match:{createdAt:range,paymentStatus:'paid',refundedPaise:0,fulfillmentStatus:{$ne:'cancelled'}}},{$unwind:'$items'},{$group:{_id:'$items.sku',name:{$first:'$items.name'},units:{$sum:'$items.quantity'}}},{$sort:{units:-1,_id:1}},{$limit:3}])
  ])
  const catalog = await Product.find({sku:{$in:bestSellers.map(p=>p._id)}}).select('sku thumbnail').lean()
  res.json({days,timezone:TIMEZONE,revenue,orders,customers,lowStock,pendingReviews,toFulfill,recentOrders,bestSellers:bestSellers.map(p=>({...p,thumbnail:catalog.find(c=>c.sku===p._id)?.thumbnail||''})),threshold:LOW_STOCK,paymentsConfigured:Boolean(req.app.locals.gateway.enabled),changes:{revenue:change(revenue,previousRevenue),orders:change(orders,previousOrders),customers:change(customers,previousCustomers)}})
})
router.get('/readiness',async(req,res) => {
  const hello = await mongoose.connection.db.admin().command({hello:1})
  res.json({databaseConnected:true,transactionsSupported:Boolean(hello.setName || hello.msg==='isdbgrid'),paymentsConfigured:Boolean(req.app.locals.gateway.enabled),googleEnabled:Boolean(req.app.locals.googleAuthEnabled),currency:'INR',timezone:TIMEZONE,lowStockThreshold:LOW_STOCK,discountCheckoutEnabled:false})
})
router.get('/discounts',async(req,res) => {
  const {page,search:term,status} = pageInput.parse(req.query)
  const filter={...(term&&{code:{$regex:search(term),$options:'i'}}),...(status&&{active:status==='active'})}
  const [items,total]=await Promise.all([Coupon.find(filter).sort({createdAt:-1}).skip((page-1)*20).limit(20).lean(),Coupon.countDocuments(filter)])
  res.json({items,total,page,pages:Math.ceil(total/20),checkoutEnabled:false})
})
const discountInput=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,50}$/),type:z.enum(['percentage','fixed']),percentage:z.number().int().min(1).max(100).optional(),amountPaise:z.number().int().min(1).max(100000000).optional(),startsAt:z.string().datetime(),endsAt:z.string().datetime(),usageLimit:z.number().int().min(1).max(100000000),active:z.literal(false).default(false)}).strict().refine(p=>new Date(p.endsAt)>new Date(p.startsAt),'End date must be after start date.').refine(p=>p.type==='percentage'?p.percentage!==undefined:p.amountPaise!==undefined,'Enter the discount value.')
const saveDiscount=async(req,res)=>{
  const input=discountInput.parse(req.body),fields={code:input.code,type:input.type,startsAt:new Date(input.startsAt),endsAt:new Date(input.endsAt),usageLimit:input.usageLimit,active:false}
  if(input.type==='percentage')fields.percentage=input.percentage;else fields.amountPaise=input.amountPaise
  let item
  if(req.params.id){item=await Coupon.findByIdAndUpdate(objectId.parse(req.params.id),{$set:fields,$unset:input.type==='percentage'?{amountPaise:1}:{percentage:1}},{new:true,runValidators:true});if(!item)throw fail(404,'Discount not found')}
  else item=await Coupon.create({...fields,usageCount:0})
  await audit(req,'save','coupon',item._id,'Saved inactive discount draft; checkout activation is not implemented in the original storefront.')
  res.json({item,message:'Discount draft saved. Checkout activation is unavailable in the existing storefront.'})
}
router.post('/discounts',saveDiscount);router.put('/discounts/:id',saveDiscount)
router.delete('/discounts/:id',async(req,res)=>{
  const item=await Coupon.findByIdAndUpdate(objectId.parse(req.params.id),{$set:{active:false}},{new:true,runValidators:true})
  if(!item)throw fail(404,'Discount not found')
  await audit(req,'deactivate','coupon',item._id,'Deactivated discount')
  res.json({message:'Discount deactivated'})
})
const draftSchema=new mongoose.Schema({_id:{type:String,default:'home'},key:{type:String,required:true},sections:{type:[mongoose.Schema.Types.Mixed],required:true},updatedBy:{type:mongoose.Schema.Types.ObjectId,required:true}},{timestamps:true,strict:'throw'})
const Draft=mongoose.models.AdminReadyDraft||mongoose.model('AdminReadyDraft',draftSchema,'admin_ready_drafts')
const text=max=>z.string().trim().max(max)
const homepageInput=z.object({sections:z.array(z.object({slot:z.enum(['hero','featured','promo']),type:z.enum(['hero','promo']),heading:text(200),body:text(10000),eyebrow:text(100),image:imageUrl,buttonText:text(80),link:internalLink,visible:z.boolean(),order:z.number().int().min(0).max(100)}).strict()).max(20)}).strict()
router.get('/storefront',async(_req,res)=>{
  const [draft,homepage,settings]=await Promise.all([Draft.findOne({_id:'home'}).lean(),Homepage.findOne({key:'home'}).lean(),SiteSettings.findOne({key:'site'}).lean()])
  res.json({draft,homepage,settings})
})
router.put('/storefront/draft',async(req,res)=>{
  const {sections}=homepageInput.parse(req.body)
  // Separate draft collection: the original public homepage is not changed when saving drafts.
  const draft=await Draft.findOneAndUpdate({_id:'home'},{$set:{key:'home',sections,updatedBy:req.user._id}},{upsert:true,new:true,runValidators:true})
  await audit(req,'draft','homepage',draft._id,'Saved homepage draft; published storefront preserved')
  res.json({draft,message:'Draft saved. The live homepage is unchanged.'})
})
router.post('/storefront/publish',async(req,res)=>{
  const {sections}=homepageInput.parse(req.body)
  const homepage=await transaction(async session=>{
    const item=await Homepage.findOneAndUpdate({key:'home'},{$set:{sections,status:'published',publishedAt:new Date(),updatedBy:req.user._id}},{upsert:true,new:true,runValidators:true,session})
    await Draft.updateOne({_id:'home'},{$set:{key:'home',sections,updatedBy:req.user._id}},{upsert:true,session,runValidators:true})
    await AuditLog.create([{actor:req.user._id,action:'publish',resourceType:'homepage',resourceId:String(item._id),summary:'Published reviewed homepage content'}],{session})
    return item
  })
  res.json({homepage,message:'Homepage published'})
})
router.get('/orders/export',async(req,res)=>{
  const input=z.object({search:text(100).default(''),status:text(30).default(''),from:z.string().date().optional(),to:z.string().date().optional()}).strict().parse(req.query)
  const filter={...(input.status&&{fulfillmentStatus:input.status}),...(input.search&&{$or:['orderNumber','deliveryAddress.name'].map(k=>({[k]:{$regex:search(input.search),$options:'i'}}))})}
  if(input.from||input.to)filter.createdAt={...(input.from&&{$gte:new Date(`${input.from}T00:00:00+05:30`)}),...(input.to&&{$lt:new Date(new Date(`${input.to}T00:00:00+05:30`).getTime()+86400000)})}
  const rows=await Order.find(filter).sort({createdAt:-1}).limit(5000).select('orderNumber deliveryAddress.name createdAt totalPaise paymentStatus fulfillmentStatus').lean()
  const cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"'
  const data=[['Order','Customer','Date','Total INR','Payment','Fulfillment'],...rows.map(o=>[o.orderNumber,o.deliveryAddress?.name,new Date(o.createdAt).toISOString(),(o.totalPaise/100).toFixed(2),o.paymentStatus,o.fulfillmentStatus])]
  res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="aurelia-orders.csv"'}).send('\uFEFF'+data.map(row=>row.map(cell).join(',')).join('\r\n'))
})
export default router
