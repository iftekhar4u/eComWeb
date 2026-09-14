import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import User from '../../models/User.js'
import Product from '../../models/Product.js'
import {Order,ProductVariant,Review,Coupon,Homepage,SiteSettings,AuditLog} from '../../models/domainModels.js'
import routes from '../routes.js'
import {requireCsrf} from '../../middleware/csrfMiddleware.js'
import {errorHandler} from '../../middleware/errorMiddleware.js'

const adminId=new mongoose.Types.ObjectId(),admin={_id:adminId,role:'admin',name:'Test admin',status:'active',sessionVersion:0}
const Draft=mongoose.models.AdminReadyDraft,restore=[]
function mock(model,method,fn){const original=model[method];restore.push(()=>model[method]=original);model[method]=fn}
const query=result=>{const chain={then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};for(const name of ['select','sort','skip','limit','lean'])chain[name]=()=>chain;return chain}
mock(User,'findById',()=>Promise.resolve(admin))
const app=express();app.use(express.json());app.locals.gateway={enabled:false}
app.use((req,_res,next)=>{req.session={userId:String(adminId),sessionVersion:0,mfaVerified:req.get('x-test-pending')!=='true',csrfToken:'isolated-test-token'};next()})
app.use('/api/admin-ready',requireCsrf,routes);app.use(errorHandler)
const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)})
const api=request(server),csrf='isolated-test-token'
const sections=[{slot:'hero',type:'hero',heading:'Summer edit',body:'Review this draft',eyebrow:'New collection',image:'https://example.com/product.jpg',buttonText:'Shop now',link:'/shop',visible:true,order:0}]
let draftWrites=0,publishedWrites=0,auditWrites=0,couponWrites=0
mock(Draft,'findOneAndUpdate',async(filter,update)=>{assert.deepEqual(filter,{_id:'home'});draftWrites++;return {_id:'home',...update.$set}})
mock(Homepage,'findOneAndUpdate',async()=>{publishedWrites++;throw Error('A draft must never call the live homepage writer')})
mock(AuditLog,'create',async value=>{auditWrites++;return value})
mock(Coupon,'create',async input=>{couponWrites++;return {_id:new mongoose.Types.ObjectId(),...input}})

test('saving a homepage draft writes only the separate draft collection',async()=>{
 const response=await api.put('/api/admin-ready/storefront/draft').set('x-csrf-token',csrf).send({sections})
 assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(draftWrites,1);assert.equal(publishedWrites,0);assert.equal(auditWrites,1)
 assert.equal(response.body.draft.sections[0].heading,'Summer edit');assert.match(response.body.message,/live homepage is unchanged/)
})
test('homepage validation rejects unsafe links, external script schemes and unknown fields',async()=>{
 for(const patch of [{link:'//outside.example'},{image:'javascript:alert(1)'},{unknown:'value'}]){
  const response=await api.put('/api/admin-ready/storefront/draft').set('x-csrf-token',csrf).send({sections:[{...sections[0],...patch}]})
  assert.equal(response.status,400,JSON.stringify(response.body))
 }
 assert.equal(draftWrites,1)
})
test('discount codes remain inactive and malformed dates/values are rejected',async()=>{
 const input={code:'WELCOME10',type:'percentage',percentage:10,startsAt:'2026-10-01T00:00:00.000Z',endsAt:'2026-10-31T00:00:00.000Z',usageLimit:100,active:false}
 const response=await api.post('/api/admin-ready/discounts').set('x-csrf-token',csrf).send(input)
 assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.item.active,false);assert.equal(couponWrites,1)
 for(const patch of [{active:true},{percentage:150},{endsAt:input.startsAt}])assert.equal((await api.post('/api/admin-ready/discounts').set('x-csrf-token',csrf).send({...input,...patch})).status,400)
 assert.equal(couponWrites,1)
})
test('pending MFA and missing CSRF cannot write homepage drafts or discounts',async()=>{
 assert.equal((await api.put('/api/admin-ready/storefront/draft').send({sections})).status,403)
 assert.equal((await api.post('/api/admin-ready/discounts').set('x-csrf-token',csrf).set('x-test-pending','true').send({})).status,403)
 assert.equal(draftWrites,1);assert.equal(couponWrites,1)
})
test('dashboard returns real aggregate metrics and product images without graph data',async()=>{
 let sales=0,orders=0,customers=0
 mock(Order,'aggregate',async pipeline=>pipeline.some(p=>p.$unwind)?[{_id:'SKU-01',name:'Cleanser',units:15}]:[{total:++sales===1?900000:600000}])
 mock(Order,'countDocuments',async filter=>filter.fulfillmentStatus?4:++orders===1?12:10)
 mock(User,'countDocuments',async()=>++customers===1?8:4)
 mock(ProductVariant,'countDocuments',async()=>3);mock(Review,'countDocuments',async()=>2)
 mock(Order,'find',()=>query([{_id:'test-order',orderNumber:'AUR-100',deliveryAddress:{name:'Customer'},totalPaise:199900,paymentStatus:'paid',fulfillmentStatus:'processing',createdAt:new Date()}]))
 mock(Product,'find',()=>query([{sku:'SKU-01',thumbnail:'https://example.com/product.jpg'}]))
 const response=await api.get('/api/admin-ready/overview?days=30')
 assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.revenue,900000);assert.equal(response.body.changes.revenue,50)
 assert.equal(response.body.orders,12);assert.equal(response.body.customers,8);assert.equal(response.body.lowStock,3)
 assert.equal(response.body.bestSellers[0].thumbnail,'https://example.com/product.jpg');assert.ok(!('series'in response.body))
 assert.equal((await api.get('/api/admin-ready/overview?days=31')).status,400)
})
test('CSV exports quote customer values and neutralize spreadsheet formulas',async()=>{
 let filter
 mock(Order,'find',f=>{filter=f;return query([{orderNumber:'AUR-200',deliveryAddress:{name:'=SUM(1,2)'},createdAt:new Date('2026-10-01T09:00:00Z'),totalPaise:12345,paymentStatus:'paid',fulfillmentStatus:'processing'}])})
 const response=await api.get('/api/admin-ready/orders/export?from=2026-10-01&to=2026-10-02&status=processing')
 assert.equal(response.status,200);assert.match(response.headers['content-type'],/text\/csv/);assert.match(response.text,/"'=SUM\(1,2\)"/);assert.match(response.text,/"123.45"/)
 assert.equal(filter.fulfillmentStatus,'processing');assert.equal(filter.createdAt.$gte.toISOString(),'2026-09-30T18:30:00.000Z')
})
test.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const reset of restore.reverse())reset()})
