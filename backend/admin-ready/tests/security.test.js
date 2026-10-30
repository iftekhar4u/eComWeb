import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import argon2 from 'argon2'
import request from 'supertest'
import {generate} from 'otplib'
import User from '../../models/User.js'
import {createReadyApp} from '../app.js'
import {encrypt,decrypt} from '../security.js'
import {protect,requireAdmin} from '../../middleware/authMiddleware.js'

// An isolated in-memory collection drives real Mongoose queries/validators.
// No test connects to the user's database or writes to real accounts.
const config={NODE_ENV:'test',PORT:5000,CLIENT_URL:'http://localhost:5173',TRUST_PROXY:0,SESSION_SECRET:'admin-ready-isolated-test-session-secret',GOOGLE_AUTH_ENABLED:false,ADMIN_MFA_ENABLED:true}
let records=[],writes=[]
const value=(record,key)=>key.split('.').reduce((v,k)=>v?.[k],record)
const same=(a,b)=>String(a)===String(b)
function matches(record,filter){return Object.entries(filter).every(([key,expected])=>{const actual=value(record,key);if(expected?.$ne!==undefined)return actual!==expected.$ne;if(Array.isArray(actual))return actual.includes(expected);return same(actual,expected)})}
function set(record,key,v){const parts=key.split('.'),last=parts.pop();let target=record;for(const p of parts)target=target[p]??={};target[last]=v}
const originalFind=User.collection.findOne,originalUpdate=User.collection.updateOne
User.collection.findOne=async filter=>{const record=records.find(r=>matches(r,filter));return record?{...record,mfa:{...record.mfa,recoveryCodeHashes:[...record.mfa.recoveryCodeHashes]}}:null}
User.collection.updateOne=async(filter,update,options)=>{writes.push({filter,update,options});const record=records.find(r=>matches(r,filter));if(!record)return {matchedCount:0,modifiedCount:0};for(const [k,v]of Object.entries(update.$set||{}))set(record,k,v);for(const [k,v]of Object.entries(update.$inc||{}))set(record,k,value(record,k)+v);for(const [k,v]of Object.entries(update.$pull||{}))set(record,k,value(record,k).filter(h=>h!==v));return {matchedCount:1,modifiedCount:1}}
const app=createReadyApp({config})
const server=app.listen(0,'127.0.0.1')
await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)})
const password='CorrectPassword!234'
async function account(role='admin'){const record={_id:new mongoose.Types.ObjectId(),name:'Admin Test',email:`${role}@aurelia.example`,password:await argon2.hash(password,{memoryCost:19456,timeCost:2,parallelism:1}),role,status:'active',sessionVersion:0,mfa:{enabled:false,secretEncrypted:undefined,recoveryCodeHashes:[]},createdAt:new Date()};records=[record];writes=[];return record}
async function signIn(role='admin'){const agent=request.agent(server),csrf=(await agent.get('/api/auth/csrf-token')).body.csrfToken;const response=await agent.post('/api/auth/login').set('x-csrf-token',csrf).send({email:`${role}@aurelia.example`,password});assert.equal(response.status,200,JSON.stringify(response.body));return {agent,csrf:response.body.csrfToken,response}}
async function enroll(){const record=await account(),session=await signIn();const setup=await session.agent.post('/api/admin-ready/security/setup').set('x-csrf-token',session.csrf).send({});assert.equal(setup.status,200,JSON.stringify(setup.body));return {record,...session,setup:setup.body}}
async function verifyEnrollment(session){const token=await generate({secret:session.setup.secret});const response=await session.agent.post('/api/admin-ready/security/verify').set('x-csrf-token',session.csrf).send({code:token});assert.equal(response.status,200,JSON.stringify(response.body));session.csrf=response.body.csrfToken;return response}

test('CSRF and authentication protect every new read/write endpoint',async()=>{
 const agent=request.agent(server)
 assert.equal((await agent.get('/api/health')).status,200)
 for(const path of ['overview','discounts','storefront','orders/export','readiness'])assert.equal((await agent.get(`/api/admin-ready/${path}`)).status,401)
 assert.equal((await agent.post('/api/admin-ready/security/setup').send({})).status,403)
 const csrf=(await agent.get('/api/auth/csrf-token')).body.csrfToken
 assert.equal((await agent.post('/api/admin-ready/security/setup').set('x-csrf-token',csrf).send({})).status,401)
})
test('customer sessions cannot enroll an administrator authenticator',async()=>{
 await account('customer');const {agent,csrf}=await signIn('customer')
 assert.equal((await agent.post('/api/admin-ready/security/setup').set('x-csrf-token',csrf).send({})).status,403)
 assert.equal((await agent.get('/api/admin-ready/overview')).status,403)
 assert.equal(writes.length,0)
})
test('reproduces the legacy immutable-role failure and fixes setup with field updates',async()=>{
 const session=await enroll(),hydrated=User.hydrate(session.record)
 assert.ok(hydrated.validateSync()?.errors.role,'Legacy hydration should reproduce the reported validation error')
 assert.equal(session.setup.recoveryCodes.length,8)
 assert.match(session.setup.otpauthUrl,/^otpauth:\/\/totp\//)
 assert.equal(decrypt(session.record.mfa.secretEncrypted),session.setup.secret)
 assert.equal(session.record.mfa.enabled,false)
 assert.deepEqual(Object.keys(writes[0].update.$set).filter(k=>k!=='updatedAt').sort(),['mfa.recoveryCodeHashes','mfa.secretEncrypted'])
 assert.equal(session.record.role,'admin')
 const again=await session.agent.post('/api/admin-ready/security/setup').set('x-csrf-token',session.csrf).send({})
 assert.equal(again.body.secret,session.setup.secret)
 assert.equal(writes.length,1,'Refreshing setup must keep the enrolled key stable')
 assert.equal((await session.agent.get('/api/admin-ready/overview')).status,403)
})
test('rejects malformed/incorrect codes; a valid TOTP enables MFA and rotates the session',async()=>{
 const session=await enroll(),oldCsrf=session.csrf
 const malformed=await session.agent.post('/api/admin-ready/security/verify').set('x-csrf-token',oldCsrf).send({code:'ABCDEF'})
 assert.equal(malformed.status,400)
 const correct=await generate({secret:session.setup.secret}),incorrect=correct==='000000'?'000001':'000000'
 assert.equal((await session.agent.post('/api/admin-ready/security/verify').set('x-csrf-token',oldCsrf).send({code:incorrect})).status,401)
 const verified=await verifyEnrollment(session)
 assert.equal(verified.body.mfaRequired,false);assert.equal(verified.body.user.mfaEnabled,true);assert.notEqual(session.csrf,oldCsrf)
 assert.ok(!('secretEncrypted'in verified.body.user));assert.ok(!('password'in verified.body.user))
 assert.equal((await session.agent.get('/api/auth/session')).body.mfaRequired,false)
 assert.equal((await session.agent.post('/api/admin-ready/security/setup').set('x-csrf-token',oldCsrf).send({})).status,403)
 assert.equal((await session.agent.post('/api/admin-ready/security/setup').set('x-csrf-token',session.csrf).send({})).status,409)
})
test('password-only sign-in still requires MFA; recovery codes are single use',async()=>{
 const session=await enroll();await verifyEnrollment(session)
 const login=await signIn();assert.equal(login.response.body.mfaRequired,true)
 const response=await login.agent.post('/api/admin-ready/security/recover').set('x-csrf-token',login.csrf).send({code:session.setup.recoveryCodes[0].toUpperCase()})
 assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(session.record.mfa.recoveryCodeHashes.length,7)
 const second=await signIn()
 assert.equal((await second.agent.post('/api/admin-ready/security/recover').set('x-csrf-token',second.csrf).send({code:session.setup.recoveryCodes[0]})).status,401)
})
test('changing the MFA encryption key returns an actionable error',()=>{
 const original=process.env.MFA_ENCRYPTION_KEY,encrypted=encrypt('secret-test')
 process.env.MFA_ENCRYPTION_KEY='different-key-with-at-least-32-characters'
 assert.throws(()=>decrypt(encrypted),/Restore your original MFA_ENCRYPTION_KEY/)
 if(original===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=original
})
test('password updates require MFA/current password and revoke all existing sessions',async()=>{
 const session=await enroll()
 assert.equal((await session.agent.post('/api/admin-ready/security/password').set('x-csrf-token',session.csrf).send({currentPassword:password,newPassword:'DifferentPassword!567'})).status,403)
 await verifyEnrollment(session)
 const incorrect=await session.agent.post('/api/admin-ready/security/password').set('x-csrf-token',session.csrf).send({currentPassword:'WrongPassword!234',newPassword:'DifferentPassword!567'})
 assert.equal(incorrect.status,401)
 const update=await session.agent.post('/api/admin-ready/security/password').set('x-csrf-token',session.csrf).send({currentPassword:password,newPassword:'DifferentPassword!567'})
 assert.equal(update.status,200,JSON.stringify(update.body));assert.equal(session.record.sessionVersion,1)
 assert.equal(await argon2.verify(session.record.password,'DifferentPassword!567'),true)
 assert.equal((await session.agent.get('/api/auth/session')).status,401)
 assert.equal(session.record.mfa.enabled,true);assert.equal(session.record.role,'admin')
})
test('disabling MFA allows password-only admin login in production and protects account access',async()=>{
 const previous=app.locals.config.ADMIN_MFA_ENABLED,previousEnvironment=app.locals.config.NODE_ENV
 app.locals.config.ADMIN_MFA_ENABLED=false
 app.locals.config.NODE_ENV='production'
 try {
  const record=await account();record.mfa.enabled=true;record.mfa.secretEncrypted='existing-enrollment';const session=await signIn()
  assert.equal(session.response.body.mfaRequired,false)
  assert.equal((await session.agent.get('/api/auth/session')).body.mfaRequired,false)
  assert.equal(session.response.body.user.mfaEnabled,true)
  // Exercise the real authorization chain without querying dashboard collections.
  app.get('/__test/admin-access',protect,requireAdmin,(_req,res)=>res.json({allowed:true}))
  const layer=app.router.stack.pop();app.router.stack.splice(app.router.stack.length-2,0,layer)
  assert.equal((await session.agent.get('/__test/admin-access')).status,200)
  assert.equal((await session.agent.post('/api/admin-ready/security/setup').set('x-csrf-token',session.csrf).send({})).status,503)
  assert.equal(writes.length,0)
  const missingCsrf=await session.agent.post('/api/admin-ready/security/password').send({})
  assert.equal(missingCsrf.status,403)
  record.status='suspended'
  assert.equal((await session.agent.get('/__test/admin-access')).status,401)
  await account('customer');const customer=await signIn('customer')
  assert.equal((await customer.agent.get('/api/admin-ready/readiness')).status,403)
  const anon=request.agent(server),csrf=(await anon.get('/api/auth/csrf-token')).body.csrfToken
  assert.equal((await anon.post('/api/auth/login').set('x-csrf-token',csrf).send({email:'customer@aurelia.example',password:'IncorrectPassword!234'})).status,401)
 } finally {app.locals.config.ADMIN_MFA_ENABLED=previous;app.locals.config.NODE_ENV=previousEnvironment}
})
test.after(async()=>{await new Promise(resolve=>server.close(resolve));User.collection.findOne=originalFind;User.collection.updateOne=originalUpdate})
