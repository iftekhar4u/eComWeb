import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMetadata, injectHead, jsonForHtml } from '../../../shared/seo.mjs'
import { sitemapEntries, urlset } from '../service.js'
import { seoInput } from '../schema.js'
import Product from '../../models/Product.js'
import { Category, SiteSettings, ProductCollection, Page, BlogPost } from '../../models/domainModels.js'

const origin = 'https://shop.example'
const record = {name:'Face Wash',slug:'face-wash',description:'Gentle cleanser',brand:'AURELIA',price:79900,stock:4,variantId:'variant',thumbnail:'https://images.example/face.jpg',sku:'FACE-01',rating:4.5,numReviews:2,seo:{title:'Buy Face Wash',description:'A gentle daily cleanser.'}}
test('product metadata uses saved overrides, actual paise price, stock and reviews',()=>{
  const meta=buildMetadata({path:'/product/face-wash',kind:'products',record,origin})
  assert.equal(meta.title,'Buy Face Wash');assert.equal(meta.description,'A gentle daily cleanser.')
  assert.equal(meta.canonical,origin+'/product/face-wash')
  const product=meta.structuredData.find(item=>item['@type']==='Product')
  assert.equal(product.offers.price,'799.00');assert.equal(product.offers.priceCurrency,'INR')
  assert.equal(product.offers.availability,'https://schema.org/InStock');assert.equal(product.aggregateRating.reviewCount,2)
  const out=buildMetadata({path:'/product/face-wash',kind:'products',record:{...record,stock:0,rating:0,numReviews:0},origin}).structuredData[0]
  assert.equal(out.offers.availability,'https://schema.org/OutOfStock');assert.ok(!out.aggregateRating)
  assert.ok(!buildMetadata({path:'/product/face-wash',kind:'products',record:{...record,variantId:null},origin}).structuredData[0].offers)
})
test('every record gets defaults; canonical pagination and filters are distinct',()=>{
  const meta=buildMetadata({path:'/category/skin',search:'?page=2',kind:'categories',record:{name:'Skin care',seo:{canonical:'/category/skin'}},origin})
  assert.equal(meta.canonical,origin+'/category/skin?page=2');assert.match(meta.title,/Page 2/)
  const search=buildMetadata({path:'/shop',search:'?search=face&utm_source=test',origin})
  assert.equal(search.robots,'noindex, follow');assert.equal(search.canonical,origin+'/shop?search=face')
})
test('private, missing and explicitly excluded pages cannot emit product schema or index directives',()=>{
  for(const path of ['/admin/products','/orders/123','/login','/profile','/checkout','/cart','/wishlist','/__dev/profile-preview']){
    const meta=buildMetadata({path,origin});assert.equal(meta.robots,'noindex, follow');assert.deepEqual(meta.structuredData,[])
  }
  assert.equal(buildMetadata({path:'/gone',origin,status:404}).robots,'noindex, follow')
  const hidden=buildMetadata({path:'/product/face-wash',kind:'products',record:{...record,seo:{noindex:true}},origin})
  assert.equal(hidden.robots,'noindex, follow');assert.deepEqual(hidden.structuredData,[])
})
test('shared image and page title overrides remain independent between pages',()=>{
  const settings={brandName:'AURELIA',seoSettings:{siteUrl:origin,defaultImage:'https://images.example/default.jpg'},seoPages:{home:{title:'Welcome home'},contact:{title:'Contact our team'}}}
  assert.equal(buildMetadata({path:'/',settings}).title,'Welcome home')
  const contact=buildMetadata({path:'/contact',settings});assert.equal(contact.title,'Contact our team');assert.equal(contact.image,settings.seoSettings.defaultImage)
})
test('HTML metadata is escaped, replaces old tags, and preserves the entire existing body',()=>{
  const body='<body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>'
  const html=`<html><head><title>Old</title><meta name="description" content="Old"/><meta property="og:title" content="Old"/><link rel="stylesheet" href="/assets/app.css"/></head>${body}</html>`
  const meta=buildMetadata({path:'/product/face-wash',kind:'products',record:{...record,name:'</script><script>alert(1)</script>',seo:{description:'"/><script>alert(1)</script>'}},origin})
  const rendered=injectHead(html,meta)
  assert.equal((rendered.match(/<title\b/g)||[]).length,1);assert.equal((rendered.match(/name="description"/g)||[]).length,1)
  assert.ok(rendered.includes(body));assert.ok(rendered.includes('href="/assets/app.css"'));assert.ok(!rendered.includes('<script>alert(1)</script>'))
  assert.ok(!jsonForHtml(meta.structuredData).includes('</script>'));assert.doesNotThrow(()=>JSON.parse(jsonForHtml(meta.structuredData)))
})
test('sitemap excludes noindex/alternate canonicals, escapes URLs and preserves meaningful dates',()=>{
  const records=[{slug:'first',updatedAt:new Date('2026-10-01')},{slug:'hidden',seo:{noindex:true}},{slug:'alternate',seo:{canonical:'/product/first'}},{slug:'external',seo:{canonical:'https://other.example/product'}}]
  const entries=sitemapEntries(records,'/product/',origin)
  assert.deepEqual(entries,[{loc:origin+'/product/first',lastmod:'2026-10-01T00:00:00.000Z'}])
  assert.match(urlset([{loc:origin+'/shop?a=1&b=2'}]),/a=1&amp;b=2/)
})
test('SEO validation rejects script schemes, credential URLs, unknown markup and oversize fields',()=>{
  for(const value of [{canonical:'javascript:alert(1)'},{canonical:'//other.example'},{socialImage:'https://user:pass@example.com/a.jpg'},{socialImage:'data:image/png;bad'},{title:'x'.repeat(161)},{script:'alert(1)'},{noindex:'true'},{imageAlts:Array(13).fill('alt')}]) assert.equal(seoInput.safeParse(value).success,false)
  assert.equal(seoInput.safeParse({canonical:'/product/face-wash',socialImage:'https://images.example/x.jpg',noindex:false}).success,true)
})
test('all supported models retain validated SEO without changing their business fields',async()=>{
  const seo={title:'Search title',canonical:'/shop',noindex:false,socialImage:'https://images.example/test.jpg',imageAlts:['Front']}
  const product=new Product({name:'Face Wash',slug:'face-wash',price:79900,category:'skin',seo});await product.validate();assert.equal(product.seo.title,seo.title);assert.equal(product.price,79900)
  const category=new Category({name:'Skin',slug:'skin',seo});await category.validate()
  const collection=new ProductCollection({name:'Edit',slug:'edit',seo});await collection.validate()
  for(const Model of [Page,BlogPost]) {const page=new Model({title:'Guide',slug:'guide',content:'Guide content',author:'123456789012345678901234',seo});await page.validate();assert.equal(page.seo.canonical,'/shop')}
  const settings=new SiteSettings({key:'site',brandName:'AURELIA',updatedBy:'123456789012345678901234',seoPages:{home:seo},seoSettings:{siteUrl:origin}});await settings.validate();assert.equal(settings.seoPages.home.title,'Search title')
})
