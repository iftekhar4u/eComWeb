import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {adminSeoRoutes,publicSeoRoutes,crawlRoutes,seoHtml} from '../routes.js'
import {seoResources} from '../service.js'
import {SiteSettings,ProductVariant,AuditLog} from '../../models/domainModels.js'
import User from '../../models/User.js'
import {errorHandler} from '../../middleware/errorMiddleware.js'

const admin={_id:'123456789012345678901234',role:'admin',status:'active',sessionVersion:0}
let settings={_id:'123456789012345678901235',key:'site',brandName:'AURELIA',announcement:'Keep this announcement',shippingPaise:9900,seoSettings:{siteUrl:'https://shop.example'},__v:0}
const item={_id:'123456789012345678901236',name:'Face Wash',slug:'face-wash',description:'Original description',category:'skin',status:'published',price:79900,stock:5,updatedAt:new Date('2026-10-01'),__v:0,seo:{title:'Face Wash SEO',description:'Search description'}}
const variant={_id:'123456789012345678901237',product:item._id,price:79900,stockOnHand:5,reservedQuantity:1,active:true}
const restores=[],writes=[]
const query=result=>{const chain={then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};for(const method of ['lean','select','sort','skip','limit'])chain[method]=()=>chain;return chain}
function mock(obj,key,fn){const original=obj[key];restores.push(()=>obj[key]=original);obj[key]=fn}
mock(User,'findById',id=>Promise.resolve(id==='customer'?{...admin,role:'customer'}:admin))
mock(SiteSettings,'findOne',()=>query(settings))
mock(SiteSettings,'exists',()=>Promise.resolve(settings?{_id:settings._id}:null))
mock(SiteSettings,'findOneAndUpdate',async(filter,update)=>{
  if(settings && filter.$or && !filter.$or.some(rule=>rule.__v===settings.__v))return null
  writes.push(update)
  settings ||= {_id:'123456789012345678901235',key:'site',brandName:'AURELIA',__v:0}
  for(const [key,value] of Object.entries(update.$set)){
    if(key.startsWith('seoPages.')){settings.seoPages ||= {};settings.seoPages[key.split('.')[1]]=value}else settings[key]=value
  }
  settings.__v++;return settings
})
mock(AuditLog,'create',async value=>value)
for(const [kind,Model] of Object.entries(seoResources)){
  mock(Model,'findOne',filter=>query(kind==='products' && filter.slug===item.slug && filter.status===item.status?item:null))
  mock(Model,'find',filter=>query(kind==='products' && item.status==='published' && !(filter['seo.noindex'] && item.seo.noindex)?[item]:[]))
  mock(Model,'countDocuments',()=>Promise.resolve(kind==='products'?1:0))
  mock(Model,'findOneAndUpdate',async(filter,update)=>{
    if(String(filter._id)!==item._id || filter.updatedAt.getTime()!==item.updatedAt.getTime())return null
    writes.push(update);item.seo=update.$set.seo;item.__v++;item.updatedAt=new Date();return item
  })
}
mock(ProductVariant,'find',()=>query([variant]))
const directory=await mkdtemp(path.join(tmpdir(),'aurelia-seo-test-'))
await writeFile(path.join(directory,'index.html'),'<html><head><title>Original</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>')
const app=express();app.use(express.json());app.locals.clientUrl='https://shop.example';app.locals.config={NODE_ENV:'test'}
app.use((req,_res,next)=>{req.session={...(req.get('x-auth')!=='none'&&{userId:req.get('x-auth')==='customer'?'customer':admin._id}),sessionVersion:0,csrfToken:'test-csrf',mfaVerified:req.get('x-mfa')!=='pending'};next()})
app.use('/api/admin/seo',adminSeoRoutes);app.use('/api/seo',publicSeoRoutes);app.use(crawlRoutes);app.use(seoHtml(directory));app.use(errorHandler)
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
const api=request(server)
test('SEO read/write APIs enforce login, role, MFA and CSRF',async()=>{
  assert.equal((await api.get('/api/admin/seo/settings').set('x-auth','none')).status,401)
  assert.equal((await api.get('/api/admin/seo/settings').set('x-auth','customer')).status,403)
  assert.equal((await api.get('/api/admin/seo/settings').set('x-mfa','pending')).status,403)
  assert.equal((await api.put('/api/admin/seo/fixed/home').send({seo:{},version:0})).status,403)
  assert.equal(writes.length,0)
})
test('fixed page saves persist independently, preserve settings and reject stale versions',async()=>{
  const save=await api.put('/api/admin/seo/fixed/home').set('x-csrf-token','test-csrf').send({seo:{title:'Home from admin'},version:0})
  assert.equal(save.status,200,JSON.stringify(save.body));assert.equal(settings.announcement,'Keep this announcement');assert.equal(settings.shippingPaise,9900)
  assert.equal((await api.get('/api/seo/resolve?path=/')).body.title,'Home from admin')
  assert.equal((await api.put('/api/admin/seo/fixed/contact').set('x-csrf-token','test-csrf').send({seo:{title:'Contact SEO'},version:0})).status,409)
  const login=await api.put('/api/admin/seo/fixed/login').set('x-csrf-token','test-csrf').send({seo:{title:'Login SEO',noindex:false},version:1})
  assert.equal(login.status,200);assert.equal(settings.seoPages.login.noindex,true)
})
test('product SEO changes only SEO/version/timestamp, appears publicly and cannot clobber new edits',async()=>{
  const body={seo:{title:'Updated product SEO',socialTitle:'Share this face wash',noindex:false},updatedAt:item.updatedAt.toISOString()}
  const response=await api.put(`/api/admin/seo/products/${item._id}`).set('x-csrf-token','test-csrf').send(body)
  assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(item.price,79900);assert.equal(item.stock,5);assert.equal(item.description,'Original description')
  assert.deepEqual(Object.keys(writes.at(-1).$set),['seo'])
  const meta=(await api.get('/api/seo/resolve?path=/product/face-wash')).body
  assert.equal(meta.title,'Updated product SEO');assert.equal(meta.socialTitle,'Share this face wash');assert.equal(meta.structuredData[0].offers.price,'799.00')
  assert.equal((await api.put(`/api/admin/seo/products/${item._id}`).set('x-csrf-token','test-csrf').send(body)).status,409)
})
test('API rejects unsafe fields and invalid resource names before writing',async()=>{
  const before=writes.length
  for(const seo of [{socialImage:'javascript:alert(1)'},{canonical:'//bad.example'},{title:'x'.repeat(161)},{html:'<script/>'}])assert.equal((await api.put('/api/admin/seo/fixed/home').set('x-csrf-token','test-csrf').send({seo,version:settings.__v})).status,400)
  assert.equal((await api.get('/api/admin/seo/constructor')).status,404);assert.equal(writes.length,before)
})
test('HTML initial responses include metadata/schema, preserve the body, and give missing records HTTP 404',async()=>{
  const response=await api.get('/product/face-wash')
  assert.equal(response.status,200);assert.match(response.text,/<title\b[^>]*>Updated product SEO<\/title>/)
  assert.match(response.text,/name="twitter:card"/);assert.match(response.text,/application\/ld\+json/)
  assert.match(response.text,/<body><div id="root"><\/div><script type="module" src="\/assets\/app.js"><\/script><\/body>/)
  const missing=await api.get('/product/missing');assert.equal(missing.status,404);assert.match(missing.text,/noindex, follow/)
  const admin=await api.get('/admin/products');assert.equal(admin.status,200);assert.match(admin.text,/noindex, follow/)
})
test('dynamic sitemap/robots reference the public domain and exclude unpublished/noindex records',async()=>{
  const index=await api.get('/sitemap.xml');assert.equal(index.status,200);assert.match(index.headers['content-type'],/xml/);assert.match(index.text,/https:\/\/shop.example\/sitemaps\/products-1.xml/)
  const sitemap=await api.get('/sitemaps/products-1.xml');assert.match(sitemap.text,/\/product\/face-wash/)
  item.seo.noindex=true;assert.doesNotMatch((await api.get('/sitemaps/products-1.xml')).text,/face-wash/)
  item.seo.noindex=false;item.status='draft';assert.doesNotMatch((await api.get('/sitemaps/products-1.xml')).text,/face-wash/)
  assert.equal((await api.get('/product/face-wash')).status,404);item.status='published'
  const fixed=await api.get('/sitemaps/fixed.xml');assert.doesNotMatch(fixed.text,/\/admin|\/cart|\/profile|\/login/)
  assert.match((await api.get('/robots.txt')).text,/Sitemap: https:\/\/shop.example\/sitemap.xml/)
})
test.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const restore of restores.reverse())restore();await rm(directory,{recursive:true,force:true})})
