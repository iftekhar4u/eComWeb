import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import nodemailer from 'nodemailer'
import argon2 from 'argon2'
import {fixture,config,User,AuthToken,Subscriber,ContactMessage,EmailSettings,EmailJob,EmailCampaign,AuditLog} from './fixture.js'
import {createReadyApp} from '../../admin-ready/app.js'
import {createEmailService} from '../service.js'
import {bindEmailEvents,orderEmailEvents,orderEmailSnapshot} from '../events.js'
import {unseal,seal,tokenHash,unsubscribeToken} from '../crypto.js'
import {defaults} from '../settings.js'

const db=fixture(),sent=[],localConfig={...config,NODE_ENV:'development',TRUST_PROXY:1}
let failure=null,requestIp=1
const email=createEmailService(localConfig,{transportFactory:()=>({sendMail:async message=>{if(failure)throw failure;const result=await nodemailer.createTransport({jsonTransport:true}).sendMail(message);sent.push(JSON.parse(result.message));return {...result,accepted:[message.to],rejected:[]}},verify:async()=>true,close(){}})})
bindEmailEvents(email.event)
const app=createReadyApp({config:localConfig,emailService:email}),server=app.listen(0,'127.0.0.1')
await new Promise(resolve=>server.once('listening',resolve))
const password='OriginalPassword!123',nextPassword='NewPassword!4567'
async function client(role) {
 const agent=request.agent(server),ip=`192.0.2.${requestIp++}`,csrf=(await agent.get('/api/auth/csrf-token')).body.csrfToken
 let token=csrf
 if(role){const user=await User.create({name:'Email Test',email:`${role}${requestIp}@example.com`,password:await argon2.hash(password,{memoryCost:19456,timeCost:2,parallelism:1}),role});const login=await agent.post('/api/auth/login').set('x-forwarded-for',ip).set('x-csrf-token',token).send({email:user.email,password});assert.equal(login.status,200,JSON.stringify(login.body));token=login.body.csrfToken}
 return {agent,csrf:token,call(method,url,body,csrf=true){const req=agent[method](url).set('x-forwarded-for',ip);if(csrf)req.set('x-csrf-token',token);return body===undefined?req:req.send(body)}}
}
function job(kind){return db.rows(EmailJob).find(row=>row.kind===kind)}
function actionToken(kind){const message=sent.find(row=>row.subject.includes(kind));assert.ok(message,`Missing ${kind} email`);return message.text.match(/#(?:reset|verify|newsletter-confirm)=([a-f\d]{64})/)[1]}
async function resetLink(user){await email.requestAuth('password_reset',user.email);await email.run();return actionToken('Reset')}
const ok=(result,status=200)=>assert.equal(result.status,status,JSON.stringify(result.body))
test.beforeEach(()=>{db.reset();sent.length=0;failure=null;localConfig.EMAIL_ENABLED=true;localConfig.NODE_ENV='development'})

test('admin settings require authentication, admin role, MFA outside development and CSRF; secrets stay encrypted and redacted',async()=>{
 const anon=await client(),customer=await client('customer'),admin=await client('admin')
 ok(await anon.call('get','/api/admin/email/settings'),401)
 ok(await customer.call('get','/api/admin/email/settings'),403)
 localConfig.NODE_ENV='test';ok(await admin.call('get','/api/admin/email/settings'),403);localConfig.NODE_ENV='development'
 const settings={...defaults(localConfig),password:'new-smtp-secret'}
 ok(await admin.call('put','/api/admin/email/settings',{settings,version:0},false),403)
 const saved=await admin.call('put','/api/admin/email/settings',{settings,version:0});ok(saved)
 const stored=db.rows(EmailSettings)[0];assert.notEqual(stored.passwordEncrypted,settings.password);assert.equal(unseal(stored.passwordEncrypted),settings.password)
 const read=await admin.call('get','/api/admin/email/settings');ok(read);assert.equal(read.body.passwordConfigured,true);assert.ok(!JSON.stringify(read.body).includes('new-smtp-secret'));assert.ok(!JSON.stringify(read.body).includes(stored.passwordEncrypted))
 ok(await admin.call('put','/api/admin/email/settings',{settings:{...settings,password:'',fromName:'Updated sender'},version:1}));assert.equal(unseal(db.rows(EmailSettings)[0].passwordEncrypted),'new-smtp-secret')
 ok(await admin.call('put','/api/admin/email/settings',{settings,version:1}),409)
 const audit=JSON.stringify(db.rows(AuditLog));assert.ok(!audit.includes('new-smtp-secret'))
 ok(await admin.call('post','/api/admin/email/test',{}),202);assert.equal(job('test').to,db.rows(User).find(u=>u.role==='admin').email)
})

test('forgot-password responses do not identify accounts; reset tokens are hashed, expiring, single-use and revoke existing sessions',async()=>{
 const customer=await client('customer'),user=db.rows(User)[0],visitor=await client()
 const known=await visitor.call('post','/api/email/password/request',{email:user.email}),unknown=await visitor.call('post','/api/email/password/request',{email:'unknown@example.com'})
 ok(known,202);ok(unknown,202);assert.deepEqual(known.body,unknown.body)
 await email.run();assert.equal(sent.length,1)
 const token=actionToken('Reset'),stored=db.rows(AuthToken)[0]
 assert.equal(stored.tokenHash,tokenHash(token));assert.ok(!JSON.stringify(db.rows(AuthToken)).includes(token));assert.equal(stored.sessionVersion,0)
 assert.ok(stored.expiresAt>Date.now()&&stored.expiresAt<Date.now()+31*60000)
 ok(await visitor.call('post','/api/email/password/reset',{token,password:nextPassword},false),403)
 ok(await visitor.call('post','/api/email/password/reset',{token,password:nextPassword}));assert.equal(db.rows(User)[0].sessionVersion,1)
 assert.equal(await argon2.verify(db.rows(User)[0].password,nextPassword),true)
 ok(await customer.call('get','/api/auth/session'),401)
 const replay=await client();ok(await replay.call('post','/api/email/password/reset',{token,password:'AnotherPassword!789'}),400)
 assert.ok(job('password_changed'));await email.run();assert.ok(sent.some(message=>/password was changed/i.test(message.subject)))
 assert.equal(job('password_reset').payloadEncrypted,undefined)
})

test('expired and stale reset links cannot change a password; Google-only accounts receive no reset link',async()=>{
 const c=await client('customer'),user=db.rows(User)[0],token=await resetLink(user)
 db.rows(AuthToken)[0].expiresAt=new Date(Date.now()-1)
 ok(await c.call('post','/api/email/password/reset',{token,password:nextPassword}),400)
 db.rows(AuthToken)[0].expiresAt=new Date(Date.now()+60000);db.rows(User)[0].sessionVersion=1
 ok(await c.call('post','/api/email/password/reset',{token,password:nextPassword}),400)
 assert.equal(await argon2.verify(db.rows(User)[0].password,password),true)
 await User.create({name:'Google User',email:'google@example.com',google:{issuer:'https://accounts.google.com',subject:'google-fixture-subject'}})
 await email.requestAuth('password_reset','google@example.com');await email.run();assert.equal(sent.length,1)
 assert.equal(db.rows(EmailJob).find(row=>row.to==='google@example.com').status,'cancelled')
})

test('signup keeps the existing signed-in flow; email verification is explicit, single-use and queues one welcome',async()=>{
 const visitor=await client();const registration=await visitor.call('post','/api/auth/register',{name:'New Customer',email:'new@example.com',password});ok(registration,201)
 assert.equal(registration.body.user.emailVerified,false);assert.ok(job('email_verification'))
 ok(await visitor.agent.get('/api/auth/session'));await email.run()
 const token=actionToken('Verify'),fresh=await client()
 ok(await fresh.call('get',`/api/email/verification/confirm?token=${token}`),404)
 ok(await fresh.call('post','/api/email/verification/confirm',{token}));assert.ok(db.rows(User)[0].emailVerifiedAt)
 ok(await fresh.call('post','/api/email/verification/confirm',{token}),400)
 await email.event('welcome',{userId:db.rows(User)[0]._id,email:'new@example.com',name:'New Customer'})
 assert.equal(db.rows(EmailJob).filter(row=>row.kind==='welcome').length,1)
 await email.run();assert.ok(sent.some(message=>/Welcome/.test(message.subject)))
})

test('profile password change invalidates outstanding reset links and queues the password alert',async()=>{
 const customer=await client('customer'),token=await resetLink(db.rows(User)[0])
 ok(await customer.call('post','/api/auth/password',{currentPassword:'wrong',newPassword:nextPassword}),401)
 ok(await customer.call('post','/api/auth/password',{currentPassword:password,newPassword:nextPassword}))
 assert.equal(db.rows(User)[0].sessionVersion,1);assert.ok(db.rows(AuthToken)[0].consumedAt);assert.ok(job('password_changed'))
 const visitor=await client();ok(await visitor.call('post','/api/email/password/reset',{token,password:'AnotherPassword!789'}),400)
})

test('contact form commits the enquiry and both email jobs; SMTP failure does not discard the enquiry',async()=>{
 const visitor=await client();ok(await visitor.call('post','/api/content/contact',{name:'Contact Customer',email:'contact@example.com',message:'Please help with my order.'}),201)
 assert.equal(db.rows(ContactMessage).length,1);assert.equal(job('contact_admin').to,'support@example.com');assert.equal(job('contact_receipt').to,'contact@example.com')
 failure=Object.assign(new Error('secret SMTP details'),{code:'EAUTH'});await email.run()
 assert.equal(db.rows(ContactMessage).length,1);assert.equal(job('contact_admin').status,'pending');assert.ok(!job('contact_admin').lastError.includes('secret'))
 job('contact_admin').nextAttemptAt=new Date(0);job('contact_receipt').nextAttemptAt=new Date(0);failure=null;await email.run()
 assert.equal(sent.length,2);assert.equal(sent.find(m=>/New message/i.test(m.subject)).replyTo[0].address,'contact@example.com')
})

test('order status and cumulative refund events deduplicate; unpaid online orders never get paid confirmations',async()=>{
 await client('customer');const user=db.rows(User)[0],order={_id:'111111111111111111111111',customer:user._id,orderNumber:'AUR-123',items:[{name:'Cleanser',quantity:2,lineTotalPaise:100000}],deliveryAddress:{name:'Customer'},totalPaise:100000,paymentMethod:'razorpay',paymentStatus:'pending',inventoryStatus:'reserved',fulfillmentStatus:'pending',refundedPaise:0}
 await orderEmailEvents(order,order);assert.equal(db.rows(EmailJob).length,0)
 const paid={...order,paymentStatus:'paid',inventoryStatus:'committed',fulfillmentStatus:'processing'}
 await orderEmailEvents(order,paid);await orderEmailEvents(order,paid);assert.equal(db.rows(EmailJob).length,1)
 const shipped={...paid,fulfillmentStatus:'shipped',trackingNumber:'TRACK-123'},delivered={...shipped,fulfillmentStatus:'delivered'},cancelled={...paid,fulfillmentStatus:'cancelled'}
 for(const [before,after]of [[paid,shipped],[shipped,shipped],[shipped,delivered],[paid,cancelled],[paid,{...paid,refundedPaise:10000}],[{...paid,refundedPaise:10000},{...paid,refundedPaise:20000}]])await orderEmailEvents(before,after)
 assert.equal(db.rows(EmailJob).filter(j=>j.kind==='shipped').length,1);assert.equal(db.rows(EmailJob).filter(j=>j.kind==='refund').length,2)
 await email.event('order_confirmation',orderEmailSnapshot({...paid,_id:'222222222222222222222222',paymentMethod:'cod',paymentStatus:'pending'}))
 await email.run();await email.run();assert.ok(sent.some(m=>/payment due on delivery/.test(m.text)));assert.ok(sent.some(m=>/TRACK-123/.test(m.text)))
})

test('newsletter uses double opt-in, explicit campaign sending and verified unsubscribe links',async()=>{
 const visitor=await client(),admin=await client('admin')
 ok(await visitor.call('post','/api/content/newsletter',{email:'subscriber@example.com',consent:false}),400)
 ok(await visitor.call('post','/api/content/newsletter',{email:'subscriber@example.com',consent:true}));assert.equal(db.rows(Subscriber)[0].subscriptionStatus,'pending')
 await email.run();const token=actionToken('Confirm')
 ok(await visitor.call('post','/api/email/newsletter/confirm',{token}));ok(await visitor.call('post','/api/email/newsletter/confirm',{token}),400)
 // Existing historical addresses and new unconfirmed addresses are excluded.
 await Subscriber.create({email:'legacy@example.com',consentAt:new Date()});await Subscriber.create({email:'pending@example.com',consentAt:new Date()})
 const draft=await admin.call('post','/api/admin/email/campaigns',{subject:'A store update',body:'Hello from the store.'});ok(draft,201)
 const id=draft.body.item._id
 ok(await admin.call('post',`/api/admin/email/campaigns/${id}/send`,{confirmed:false,version:0}),400)
 assert.equal(db.rows(EmailCampaign)[0].status,'draft')
 ok(await admin.call('post',`/api/admin/email/campaigns/${id}/send`,{confirmed:true,version:0}),202)
 ok(await admin.call('post',`/api/admin/email/campaigns/${id}/send`,{confirmed:true,version:0}),409)
 await email.run();const campaignMail=sent.filter(m=>m.subject==='A store update');assert.equal(campaignMail.length,1)
 assert.equal(campaignMail[0].to[0].address,'subscriber@example.com');assert.match(campaignMail[0].text,/#unsubscribe=/)
 const unsub=unsubscribeToken(db.rows(Subscriber)[0])
 ok(await visitor.call('post','/api/email/newsletter/unsubscribe',{token:unsub.slice(0,-1)+(unsub.endsWith('a')?'b':'a')}),400)
 await email.enqueue('newsletter_welcome','subscriber@example.com',{},'pending-after-consent',{subscriber:db.rows(Subscriber)[0]._id})
 ok(await visitor.call('post','/api/email/newsletter/unsubscribe',{token:unsub}));assert.equal(db.rows(Subscriber)[0].subscriptionStatus,'unsubscribed')
 assert.equal(db.rows(EmailJob).find(j=>j.eventKey==='pending-after-consent').status,'cancelled')
 const count=sent.length;await email.run();assert.equal(sent.length,count)
 const returning=await client()
 ok(await returning.call('post','/api/content/newsletter',{email:'subscriber@example.com',consent:true}));await email.run()
 assert.equal(sent.length,count+1);assert.equal(db.rows(Subscriber)[0].subscriptionStatus,'pending')
 const freshToken=sent.at(-1).text.match(/#newsletter-confirm=([a-f\d]{64})/)[1];assert.notEqual(freshToken,token)
 ok(await returning.call('post','/api/email/newsletter/confirm',{token:freshToken}));assert.equal(db.rows(Subscriber)[0].subscriptionStatus,'subscribed')
})

test('campaign cancellation prevents queued sends, and delivery history never exposes encrypted bodies',async()=>{
 const admin=await client('admin'),subscriber=await Subscriber.create({email:'confirmed@example.com',consentAt:new Date(),confirmedAt:new Date(),subscriptionStatus:'subscribed'})
 const campaign=await EmailCampaign.create({subject:'Cancelled update',body:'Not sent',createdBy:db.rows(User)[0]._id,status:'queued'})
 await email.enqueue('newsletter_campaign',subscriber.email,{subject:campaign.subject,body:campaign.body},'cancel-fixture',{subscriber:subscriber._id,campaign:campaign._id})
 ok(await admin.call('post',`/api/admin/email/campaigns/${campaign._id}/cancel`,{}));await email.run();assert.equal(sent.length,0)
 const history=await admin.call('get','/api/admin/email/jobs');ok(history);assert.ok(!JSON.stringify(history.body).includes('payloadEncrypted'));assert.equal(history.body.items[0].status,'cancelled')
})

test('worker pause, bounded retries, safe manual retry, expiry and disabled templates are enforced',async()=>{
 const admin=await client('admin');localConfig.EMAIL_ENABLED=false
 await email.enqueue('test','test@example.com',{},'retry-fixture');await email.run();assert.equal(job('test').attempts,0)
 localConfig.EMAIL_ENABLED=true;failure=Object.assign(new Error('SMTP password must stay private'),{code:'EAUTH'})
 for(let i=0;i<5;i++){job('test').nextAttemptAt=new Date(0);await email.run()}
 assert.equal(job('test').status,'failed');assert.equal(job('test').attempts,5);assert.doesNotMatch(job('test').lastError,/stay private/)
 ok(await admin.call('post',`/api/admin/email/jobs/${job('test')._id}/retry`,{}));failure=null;await email.run();assert.equal(job('test').status,'sent');assert.equal(job('test').payloadEncrypted,undefined)
 ok(await admin.call('post',`/api/admin/email/jobs/${job('test')._id}/retry`,{}),409)
 await email.enqueue('welcome','expired@example.com',{},'expired-fixture',{expiresAt:new Date(0)})
 await EmailSettings.create({...defaults(localConfig),key:'mail',templates:{welcome:{enabled:false}}})
 await email.enqueue('welcome','disabled@example.com',{},'disabled-fixture');await email.run()
 assert.equal(db.rows(EmailJob).filter(j=>j.status==='cancelled').length,2)
})

test('public reset requests are rate limited',async()=>{
 const visitor=await client()
 for(let i=0;i<12;i++)ok(await visitor.call('post','/api/email/password/request',{email:'unknown@example.com'}),202)
 ok(await visitor.call('post','/api/email/password/request',{email:'unknown@example.com'}),429)
})

test.after(async()=>{bindEmailEvents(null);await new Promise(resolve=>server.close(resolve));db.restore()})
