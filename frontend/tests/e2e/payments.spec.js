import { test, expect } from '@playwright/test'
const user={id:'111111111111111111111111',name:'QA Customer',email:'customer@example.test',role:'customer',phone:'9876543210'}
const address={name:'QA Customer',line1:'10 Test Road',line2:'',city:'Delhi',state:'Delhi',postalCode:'110001',phone:'9876543210',country:'IN'}
const product={_id:'222222222222222222222222',variantId:'333333333333333333333333',name:'Test Cleanser',price:10000,stock:10,quantity:1,slug:'test-cleanser',category:'skin-care',images:[],benefits:[]}
const policy={prepaidEnabled:true,codEnabled:true,activeMode:'sandbox',cancellationHours:24,reservationMinutes:30,codMinPaise:0,codMaxPaise:500000,codFeePaise:500,codPincodes:[],codExcludedSkus:[],codMaxOpenOrders:3,storeName:'AURELIA',logoUrl:'',color:'#302d29',supportEmail:'support@example.test',supportPhone:'',methods:{card:true,upi:true,netbanking:false,wallet:false},retryLimit:12,reconcileSeconds:60}
function makeOrder(method='razorpay') {return {_id:'444444444444444444444444',orderNumber:'AUR-TEST',items:[{variant:product.variantId,sku:'TEST-SKU',name:product.name,quantity:1,unitPricePaise:10000,lineTotalPaise:10000}],deliveryAddress:address,subtotalPaise:10000,shippingPaise:1000,codFeePaise:method==='cod'?500:0,totalPaise:method==='cod'?11500:11000,paymentMethod:method,paymentStatus:'pending',fulfillmentStatus:method==='cod'?'processing':'pending',inventoryStatus:method==='cod'?'committed':'reserved',paymentEnvironment:'sandbox',createdAt:new Date().toISOString(),cancellationDeadline:new Date(Date.now()+86400000).toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),serverNow:new Date().toISOString(),cancellation:{eligible:true},refundedPaise:0,refundPendingPaise:0,codCollectedPaise:0,returnStatus:'none'}}
async function fixture(page,{admin=false,order=null,popup='dismiss'}={}) {
  const state={order,cart:[product],createCalls:[],settingsWrites:[],paymentOptions:null,cleanups:0,settings:{revision:0,policy,profiles:[],encryptionReady:true,source:'database',webhookUrl:'https://api.example.test/api/payments/razorpay/webhook',webhookEvents:['payment.captured','refund.processed']}}
  await page.route('https://checkout.razorpay.com/v1/checkout.js',route=>route.fulfill({contentType:'application/javascript',body:`window.Razorpay=class{constructor(options){this.options=options;window.__paymentOptions=options}on(){}open(){${popup==='dismiss'?'this.options.modal.ondismiss()':"this.options.handler({razorpay_order_id:'order_Test',razorpay_payment_id:'pay_Test',razorpay_signature:'a'.repeat(64)})"}}}` }))
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=req.postDataJSON?.()
    let data={}
    if(path==='/api/auth/session')data={user:{...user,...(admin?{role:'admin',mfaEnabled:true}:{})},mfaRequired:false}
    else if(path==='/api/auth/csrf-token')data={csrfToken:'fixture-token'}
    else if(path==='/api/auth/addresses')data={addresses:[{_id:'address-one',...address}]}
    else if(path==='/api/cart')data={items:state.cart,version:1}
    else if(path==='/api/wishlist')data={items:[]}
    else if(path==='/api/content/storefront')data={categories:[],settings:{brandName:'AURELIA'},sections:[],blogs:[],collections:[]}
    else if(path==='/api/orders/config')data={razorpayEnabled:true,codEnabled:true,revision:0,cancellationHours:24}
    else if(path==='/api/orders/quote')data={subtotalPaise:10000,shippingPaise:1000,codFeePaise:body.paymentMethod==='cod'?500:0,totalPaise:body.paymentMethod==='cod'?11500:11000,items:[],currency:'INR'}
    else if(path==='/api/orders'&&method==='POST') {
      state.createCalls.push(body);state.order ||= makeOrder(body.paymentMethod)
      data={order:state.order,...(body.paymentMethod==='razorpay'?{checkout:{key:'rzp_test_Fixture',order_id:'order_Test',amount:11000,currency:'INR',name:'Configured Store'}}:{})}
    } else if(path.startsWith('/api/orders/intent/'))data={order:state.order}
    else if(path.endsWith('/cart-cleanup')){state.cleanups++;state.cart=[];data={cleaned:true,result:'purchased_snapshot_removed'}}
    else if(path.endsWith('/cancel')){state.order={...state.order,fulfillmentStatus:'cancelled',inventoryStatus:'released',refundPendingPaise:state.order.paymentStatus==='paid'?state.order.totalPaise:0,cancellation:{eligible:false,alreadyCancelled:true}};data={order:state.order}}
    else if(path.endsWith('/verify')){state.order={...state.order,paymentStatus:'authorized'};data={order:state.order}}
    else if(path.startsWith('/api/orders/'))data={order:state.order,refunds:[]}
    else if(path==='/api/orders')data={orders:state.order?[state.order]:[]}
    else if(path==='/api/admin/payments/settings') {if(method==='PUT'){state.settingsWrites.push(body);state.settings={...state.settings,revision:state.settings.revision+1,policy:body.policy}}data=state.settings}
    else if(path==='/api/admin/payments/health')data={workerHealthy:true,lastHeartbeatAt:new Date().toISOString(),events:[],jobs:[],refunds:[]}
    else if(path==='/api/admin/payments'||path==='/api/admin/refunds')data={items:[],total:0,page:1}
    else if(path.startsWith('/api/admin/studio/orders/'))data={item:state.order,payment:{},attempts:[],refunds:[],operations:[],history:[]}
    else if(path.startsWith('/api/seo/'))data={title:'AURELIA',description:'Test',robots:'noindex',structuredData:[]}
    else if(path==='/api/integrations/whatsapp')data={enabled:false}
    else if(path==='/api/auth/google/status')data={enabled:false}
    else if(path==='/api/health')return route.continue()
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
  })
  return state
}
async function fillAddress(page) {await page.getByLabel('Use a saved address').selectOption('address-one')}
test('COD shows server fee, places once and cleans the purchased cart snapshot',async({page})=>{
  const state=await fixture(page);await page.goto('/checkout');await fillAddress(page)
  await page.getByRole('radio',{name:'Cash on delivery'}).check();await expect(page.getByText('Cash-on-delivery fee')).toBeVisible()
  await page.getByRole('button',{name:'Place order'}).click();await expect(page.getByRole('heading',{name:'Order placed — payment due on delivery.'})).toBeVisible()
  expect(state.createCalls).toHaveLength(1);expect(state.createCalls[0].expectedTotalPaise).toBe(11500);expect(state.createCalls[0].cartVersion).toBe(1)
  await expect.poll(()=>state.cleanups).toBe(1)
})
test('dismissed popup preserves the order and reload recovers the same intent',async({page})=>{
  const state=await fixture(page);await page.goto('/checkout');await fillAddress(page);await page.getByRole('button',{name:/Pay Rs/}).click()
  await expect(page.getByText('Payment window closed.',{exact:false})).toBeVisible();expect(await page.evaluate(()=>window.__paymentOptions.name)).toBe('Configured Store')
  const key=state.createCalls[0].idempotencyKey;await page.reload();await expect(page.getByRole('link',{name:'Open existing order'})).toBeVisible()
  expect(state.createCalls).toHaveLength(1);expect(JSON.parse(await page.evaluate(id=>localStorage.getItem(`aurelia_checkout_intent_v3:${id}`),user.id)).idempotencyKey).toBe(key)
})
test('authorization never displays successful payment confirmation',async({page})=>{
  await fixture(page,{popup:'authorize'});await page.goto('/checkout');await fillAddress(page);await page.getByRole('button',{name:/Pay Rs/}).click()
  await expect(page.getByRole('heading',{name:'Your payment is awaiting confirmation.'})).toBeVisible();await expect(page.getByText('authorized',{exact:true})).toBeVisible()
})
test('paid cancellation has cancelled heading and pending refund amount',async({page})=>{
  const order={...makeOrder(),paymentStatus:'paid',inventoryStatus:'committed',fulfillmentStatus:'processing'}
  await fixture(page,{order});await page.goto(`/orders/${order._id}`);page.on('dialog',dialog=>dialog.accept())
  await page.getByLabel('Cancellation reason').fill('Changed my mind');await page.getByRole('button',{name:'Cancel order',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Order cancelled.'})).toBeVisible();await expect(page.getByText('Refund pending',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'Thank you for your order.'})).toHaveCount(0)
})
test('admin edits policy without sending masked or blank credential values',async({page})=>{
  const state=await fixture(page,{admin:true});await page.goto('/admin/payments');await expect(page.getByRole('heading',{name:'Checkout and policy'})).toBeVisible()
  await page.getByLabel('COD fee (paise)').fill('750');await page.getByLabel('Current administrator password',{exact:true}).fill('fixture-password')
  await page.getByRole('button',{name:'Save payment settings'}).click();await expect(page.getByText('Payment settings saved.',{exact:false})).toBeVisible()
  expect(state.settingsWrites[0].policy.codFeePaise).toBe(750);expect(state.settingsWrites[0].credentials).toBeUndefined()
})
test('mobile cancelled order stays readable without horizontal page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});const order={...makeOrder(),fulfillmentStatus:'cancelled',inventoryStatus:'released',paymentStatus:'paid',refundPendingPaise:11000,cancellation:{eligible:false}}
  await fixture(page,{order});await page.goto(`/orders/${order._id}`);await expect(page.getByRole('heading',{name:'Order cancelled.'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
})
test('production CSP permits Checkout origin and blocks unrelated script origins',async({page})=>{
  await fixture(page);const response=await page.goto('/checkout');expect(response.headers()['content-security-policy']).toContain('https://checkout.razorpay.com')
  await page.addScriptTag({url:'https://checkout.razorpay.com/v1/checkout.js'});expect(await page.evaluate(()=>typeof window.Razorpay)).toBe('function')
  await expect(page.addScriptTag({url:'https://unapproved.example.invalid/script.js'})).rejects.toThrow()
})
