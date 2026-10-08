import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import argon2 from 'argon2'
import { z } from 'zod'
import User from '../models/User.js'
import { AuthToken, Subscriber } from '../models/domainModels.js'
import { transaction } from '../services/commerce.js'
import { fail } from '../services/validation.js'
import { emailAddress, loadEmailSettings } from './settings.js'
import { tokenHash, unsubscribeId } from './crypto.js'
import { requestKey } from './service.js'
import { EmailJob } from './models.js'

const router=Router()
const tokenInput=z.object({token:z.string().regex(/^[a-f\d]{64}$/)}).strict()
const generic='If this email belongs to an eligible account, a link will be sent shortly. Please check your inbox and spam folder.'
router.get('/status',async(req,res)=>{const settings=await loadEmailSettings(req.app.locals.config);res.set('Cache-Control','no-store').json({passwordReset:settings.enabled&&settings.templates?.password_reset?.enabled!==false,verification:settings.enabled&&settings.templates?.email_verification?.enabled!==false})})
router.use(rateLimit({windowMs:15*60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Too many email requests. Please try again in 15 minutes.'}}))
for(const [path,kind] of [['/password/request','password_reset'],['/verification/request','email_verification']])router.post(path,async(req,res)=>{
  const {email}=z.object({email:emailAddress}).strict().parse(req.body)
  await req.app.locals.email.requestAuth(kind,email)
  res.status(202).set('Cache-Control','no-store').json({message:generic})
})
router.post('/password/reset',async(req,res)=>{
  const {token,password}=tokenInput.extend({password:z.string().min(12).max(128)}).strict().parse(req.body)
  const tokenRecord=await AuthToken.findOne({tokenHash:tokenHash(token),purpose:'password_reset',consumedAt:null,expiresAt:{$gt:new Date()}}).lean()
  if(!tokenRecord)throw fail(400,'This reset link is invalid or expired. Request a new link.')
  const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1})
  await transaction(async session=>{
    const consumed=await AuthToken.findOneAndUpdate({_id:tokenRecord._id,purpose:'password_reset',consumedAt:null,expiresAt:{$gt:new Date()}},{$set:{consumedAt:new Date()}},{new:true,session})
    if(!consumed)throw fail(400,'This reset link has already been used or expired.')
    const user=await User.findOne({_id:consumed.user,status:'active'}).select('+password').session(session).lean()
    if(!user?.password || consumed.sessionVersion!==user.sessionVersion)throw fail(400,'This reset link is no longer valid. Request a fresh link.')
    const result=await User.updateOne({_id:user._id,sessionVersion:user.sessionVersion},{$set:{password:hash},$inc:{sessionVersion:1}},{session,runValidators:true})
    if(!result.matchedCount)throw fail(409,'Your account changed. Request a new reset link.')
    await AuthToken.updateMany({user:user._id,purpose:'password_reset',consumedAt:null},{$set:{consumedAt:new Date()}},{session})
    await req.app.locals.email.event('password_changed',{userId:user._id,email:user.email,name:user.name,sessionVersion:user.sessionVersion+1},{session})
  })
  if(req.session)await new Promise((resolve,reject)=>req.session.destroy(error=>error?reject(error):resolve()))
  res.clearCookie('aurelia.sid').json({message:'Password reset. Sign in with your new password.'})
})
router.post('/verification/confirm',async(req,res)=>{
  const {token}=tokenInput.parse(req.body)
  await transaction(async session=>{
    const record=await AuthToken.findOneAndUpdate({tokenHash:tokenHash(token),purpose:'email_verification',consumedAt:null,expiresAt:{$gt:new Date()}},{$set:{consumedAt:new Date()}},{new:true,session})
    if(!record)throw fail(400,'This verification link is invalid or expired. Request a new link.')
    const user=await User.findOne({_id:record.user,status:'active'}).session(session).lean()
    if(!user)throw fail(400,'This verification link is no longer valid.')
    await User.updateOne({_id:user._id},{$set:{emailVerifiedAt:new Date()}},{session,runValidators:true})
    await AuthToken.updateMany({user:user._id,purpose:'email_verification',consumedAt:null},{$set:{consumedAt:new Date()}},{session})
    await req.app.locals.email.event('welcome',{userId:user._id,email:user.email,name:user.name},{session})
  })
  res.json({message:'Your email is verified. Welcome to AURELIA.'})
})
router.post('/newsletter/confirm',async(req,res)=>{
  const {token}=tokenInput.parse(req.body)
  await transaction(async session=>{
    const subscriber=await Subscriber.findOneAndUpdate({confirmTokenHash:tokenHash(token),confirmExpiresAt:{$gt:new Date()},subscriptionStatus:'pending'},{$set:{subscriptionStatus:'subscribed',confirmedAt:new Date()},$unset:{confirmTokenHash:1,confirmExpiresAt:1,unsubscribedAt:1}},{new:true,session,runValidators:true})
    if(!subscriber)throw fail(400,'This subscription link is invalid or expired. Subscribe again to request a fresh link.')
    await req.app.locals.email.enqueue('newsletter_welcome',subscriber.email,{},`newsletter-welcome:${subscriber._id}:${subscriber.confirmedAt.getTime()}`,{session,subscriber:subscriber._id})
  })
  res.json({message:'Your newsletter subscription is confirmed.'})
})
router.post('/newsletter/unsubscribe',async(req,res)=>{
  const {token}=z.object({token:z.string().max(100)}).strict().parse(req.body)
  const id=unsubscribeId(token)
  if(!id)throw fail(400,'This unsubscribe link is invalid.')
  await transaction(async session=>{
    await Subscriber.updateOne({_id:id},{$set:{subscriptionStatus:'unsubscribed',unsubscribedAt:new Date()},$unset:{confirmTokenHash:1,confirmExpiresAt:1}},{session})
    await EmailJob.updateMany({subscriber:id,status:'pending'},{$set:{status:'cancelled',lastError:'Subscriber opted out.',purgeAt:new Date(Date.now()+30*86400000)},$unset:{payloadEncrypted:1}},{session})
  })
  res.json({message:'You have been unsubscribed. You can subscribe again whenever you wish.'})
})
export async function subscribe(email,emailService) {
  const normalized=email.toLowerCase()
  await transaction(async session=>{
    let subscriber=await Subscriber.findOne({email:normalized}).session(session).lean()
    if(subscriber?.subscriptionStatus==='subscribed')return
    if(!subscriber) [subscriber]=await Subscriber.create([{email:normalized,consentAt:new Date(),subscriptionStatus:'pending'}],{session})
    else if(subscriber.subscriptionStatus!=='pending') {
      subscriber.consentAt=new Date(Math.max(Date.now(),subscriber.consentAt.getTime()+1))
      await Subscriber.updateOne({_id:subscriber._id},{$set:{subscriptionStatus:'pending',consentAt:subscriber.consentAt},$unset:{confirmTokenHash:1,confirmExpiresAt:1}},{session,runValidators:true})
    }
    // A new consent cycle needs a fresh message even after an immediate opt-out.
    await emailService.enqueue('newsletter_confirmation',normalized,{},`${requestKey('newsletter',normalized)}:${subscriber.consentAt.getTime()}`,{session,subscriber:subscriber._id})
  })
}
export default router
