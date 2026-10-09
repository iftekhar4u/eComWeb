import crypto from 'node:crypto'
import User from '../models/User.js'
import { AuthToken, Subscriber } from '../models/domainModels.js'
import { transaction } from '../services/commerce.js'
import { EmailJob, EmailCampaign } from './models.js'
import { configureEmailCrypto, seal, unseal, randomToken, tokenHash, unsubscribeToken } from './crypto.js'
import { loadEmailSettings, makeTransport, mailError, websiteUrl } from './settings.js'
import { renderEmail } from './templates.js'
import { fail } from '../services/validation.js'

const DAY=86400000
const terminalRetention=()=>new Date(Date.now()+30*DAY)
const userKinds=new Set(['welcome','password_changed'])
const orderKinds=new Set(['order_confirmation','shipped','delivered','cancelled','refund'])
const authKinds=new Set(['password_reset','email_verification'])
export const requestKey=(kind,email,now=Date.now())=>`${kind}:${tokenHash(email)}:${Math.floor(now/300000)}`

export function createEmailService(config,{transportFactory=makeTransport}={}) {
  configureEmailCrypto(config)
  let running=false,stopping=false
  async function enqueue(kind,to,data,eventKey,{session,expiresAt,campaign,subscriber}={}) {
    const record={kind,to:to.toLowerCase(),eventKey,payloadEncrypted:seal(data),status:'pending',attempts:0,nextAttemptAt:new Date(),...(expiresAt&&{expiresAt}),...(campaign&&{campaign}),...(subscriber&&{subscriber})}
    return EmailJob.updateOne({eventKey},{$setOnInsert:record},{upsert:true,runValidators:true,...(session&&{session})})
  }
  async function event(kind,data,options={}) {
    if(kind==='signup')return enqueue('email_verification',data.email,{userId:String(data.userId)},`signup:${data.userId}`,options)
    if(userKinds.has(kind)) {
      if(kind==='password_changed')await AuthToken.updateMany({user:data.userId,purpose:'password_reset',consumedAt:null},{$set:{consumedAt:new Date()}},{...(options.session&&{session:options.session})})
      return enqueue(kind,data.email,{name:data.name},`${kind}:${data.userId}:${kind==='password_changed'?data.sessionVersion:'first'}`,options)
    }
    if(orderKinds.has(kind)) {
      const user=await User.findById(data.customerId).select('email').session(options.session || null).lean()
      if(!user?.email)return
      return enqueue(kind,user.email,data,`order:${data.orderId}:${kind}${kind==='refund'?':'+data.refundedPaise:''}`,options)
    }
    if(kind==='contact') {
      const settings=await loadEmailSettings(config)
      if(settings.supportEmail) await enqueue('contact_admin',settings.supportEmail,{...data,name:data.contactName},`contact:${data.messageId}:admin`,options)
      await enqueue('contact_receipt',data.contactEmail,{name:data.contactName,contactName:data.contactName,contactEmail:data.contactEmail,contactMessage:data.contactMessage},`contact:${data.messageId}:receipt`,options)
    }
  }
  async function requestAuth(kind,email) {
    if(!authKinds.has(kind))throw fail(400,'Invalid email action.')
    const settings=await loadEmailSettings(config)
    if(!settings.enabled || settings.templates?.[kind]?.enabled===false)throw fail(503,'This email service is currently unavailable. Please contact the store.')
    // Same response and queue operation for existing, unknown and Google-only accounts.
    await enqueue(kind,email,{},requestKey(kind,email),{expiresAt:new Date(Date.now()+30*60000)})
  }
  async function prepare(job,data,settings) {
    const origin=websiteUrl(settings,config)
    if(authKinds.has(job.kind)) {
      const user=await User.findOne({email:job.to,status:'active'}).select('+password').lean()
      if(!user || (job.kind==='password_reset'&&!user.password) || (job.kind==='email_verification'&&user.emailVerifiedAt))return null
      if(data.tokenId) {
        if(!await AuthToken.exists({_id:data.tokenId,user:user._id,purpose:job.kind,consumedAt:null,expiresAt:{$gt:new Date()}}))return null
      } else {
        const token=randomToken(),expiresAt=new Date(Date.now()+(job.kind==='password_reset'?30*60000:DAY))
        data={name:user.name,userId:String(user._id),actionUrl:`${origin}/${job.kind==='password_reset'?'forgot-password':'signup'}#${job.kind==='password_reset'?'reset':'verify'}=${token}`}
        await transaction(async session=>{
          await AuthToken.updateMany({user:user._id,purpose:job.kind,consumedAt:null},{$set:{consumedAt:new Date()}},{session})
          const [record]=await AuthToken.create([{user:user._id,purpose:job.kind,tokenHash:tokenHash(token),expiresAt,sessionVersion:user.sessionVersion}],{session})
          data.tokenId=String(record._id)
          const saved=await EmailJob.updateOne({_id:job._id,lockId:job.lockId,status:'processing'},{$set:{payloadEncrypted:seal(data),expiresAt}},{session})
          if(!saved.matchedCount)throw new Error('Email job ownership changed')
        })
      }
    }
    if(job.kind==='newsletter_confirmation') {
      const subscriber=await Subscriber.findOne({_id:job.subscriber,subscriptionStatus:'pending'}).select('+confirmTokenHash').lean()
      if(!subscriber)return null
      if(data.tokenHash) {
        if(subscriber.confirmTokenHash!==data.tokenHash || !(subscriber.confirmExpiresAt>new Date()))return null
      } else {
        const token=randomToken(),expiresAt=new Date(Date.now()+DAY)
        data={actionUrl:`${origin}/contact#newsletter-confirm=${token}`,tokenHash:tokenHash(token)}
        await transaction(async session=>{
          const saved=await Subscriber.updateOne({_id:subscriber._id,subscriptionStatus:'pending'},{$set:{confirmTokenHash:data.tokenHash,confirmExpiresAt:expiresAt}},{session})
          if(!saved.matchedCount)throw new Error('Subscription changed')
          await EmailJob.updateOne({_id:job._id,lockId:job.lockId},{$set:{payloadEncrypted:seal(data),expiresAt}},{session})
        })
      }
    }
    if(['newsletter_campaign','newsletter_welcome'].includes(job.kind)) {
      const subscriber=await Subscriber.findOne({_id:job.subscriber,subscriptionStatus:'subscribed'}).lean()
      if(!subscriber)return null
      if(job.campaign && !await EmailCampaign.exists({_id:job.campaign,status:{$in:['sending','queued']}}))return null
      data.unsubscribeUrl=`${origin}/contact#unsubscribe=${unsubscribeToken(subscriber)}`
    }
    if(orderKinds.has(job.kind))data.actionUrl=`${origin}/orders/${data.orderId}`
    if(job.kind==='welcome')data.actionUrl=`${origin}/shop`
    if(job.kind==='password_changed')data.actionUrl=`${origin}/forgot-password`
    return data
  }
  async function finish(job,status,extra={}) {
    await EmailJob.updateOne({_id:job._id,lockId:job.lockId,status:'processing'},{$set:{status,purgeAt:terminalRetention(),...extra},$unset:{payloadEncrypted:1,lockedUntil:1,lockId:1}})
  }
  async function expandCampaign() {
    const candidate=await EmailCampaign.findOne({status:'sending'}).sort({_id:1}).lean()
    if(!candidate)return
    await transaction(async session=>{
      const campaign=await EmailCampaign.findOne({_id:candidate._id,status:'sending'}).session(session)
      if(!campaign)return
      const subscribers=await Subscriber.find({subscriptionStatus:'subscribed',confirmedAt:{$lte:campaign.startedAt},...(campaign.cursor&&{_id:{$gt:campaign.cursor}})}).sort({_id:1}).limit(50).session(session).lean()
      for(const subscriber of subscribers)await enqueue('newsletter_campaign',subscriber.email,{subject:campaign.subject,body:campaign.body},`campaign:${campaign._id}:${subscriber._id}`,{session,campaign:campaign._id,subscriber:subscriber._id})
      if(subscribers.length){campaign.cursor=subscribers.at(-1)._id;campaign.queuedCount+=subscribers.length}
      if(subscribers.length<50)campaign.status='queued'
      await campaign.save({session})
    })
  }
  async function run() {
    if(running||stopping)return
    running=true
    let transport
    try {
      const settings=await loadEmailSettings(config,{secrets:true})
      if(!settings.enabled)return
      websiteUrl(settings,config)
      await expandCampaign()
      transport=transportFactory(settings,config)
      for(let index=0;index<5&&!stopping;index++) {
        // A lease supports safe claims across processes and recovery after a crash.
        const now=new Date(),lockId=crypto.randomUUID()
        const job=await EmailJob.findOneAndUpdate({$or:[{status:'pending',nextAttemptAt:{$lte:now}},{status:'processing',lockedUntil:{$lt:now}}]},{$set:{status:'processing',lockId,lockedUntil:new Date(Date.now()+5*60000)},$inc:{attempts:1}},{new:true,sort:{createdAt:1}}).select('+payloadEncrypted').lean()
        if(!job)break
        try {
          if(job.attempts>5){await EmailJob.updateOne({_id:job._id,lockId},{$set:{status:'failed',lastError:'Retry limit reached.',purgeAt:terminalRetention()},$unset:{lockId:1,lockedUntil:1}});continue}
          if(job.expiresAt && job.expiresAt<=new Date()){await finish(job,'cancelled',{lastError:'This email action expired. Request a fresh link.'});continue}
          if(settings.templates?.[job.kind]?.enabled===false){await finish(job,'cancelled',{lastError:'This email type is disabled in settings.'});continue}
          const data=await prepare(job,unseal(job.payloadEncrypted),settings)
          if(!data){await finish(job,'cancelled',{lastError:'The email action is no longer applicable.'});continue}
          const rendered=renderEmail(job.kind,data,settings)
          const domain=settings.fromEmail.split('@')[1] || 'localhost'
          const messageId=`<aurelia-${job._id}@${domain}>`
          const result=await transport.sendMail({from:{name:settings.fromName,address:settings.fromEmail},to:job.to,replyTo:job.kind==='contact_admin'?data.contactEmail:settings.supportEmail || settings.fromEmail,messageId,...rendered,
            ...(data.unsubscribeUrl&&{headers:{'List-Unsubscribe':`<${data.unsubscribeUrl}>`}})})
          if(result.rejected?.length || (Array.isArray(result.accepted)&&!result.accepted.length))throw new Error('Recipient rejected')
          await finish(job,'sent',{sentAt:new Date(),messageId,lastError:''})
        } catch(error) {
          await EmailJob.updateOne({_id:job._id,lockId,status:'processing'},{$set:{status:job.attempts>=5?'failed':'pending',lastError:mailError(error),nextAttemptAt:new Date(Date.now()+Math.min(3600000,30000*2**(job.attempts-1))),...(job.attempts>=5&&{purgeAt:terminalRetention()})},$unset:{lockId:1,lockedUntil:1}})
        }
      }
    } catch(error) { console.error(JSON.stringify({level:'error',message:'Email worker paused',reason:mailError(error)})) }
    finally {transport?.close?.();running=false}
  }
  function start() {stopping=false;const timer=setInterval(()=>void run(),10000);timer.unref();void run();return async()=>{stopping=true;clearInterval(timer);while(running)await new Promise(resolve=>setTimeout(resolve,50))}}
  async function verify() {
    const settings=await loadEmailSettings(config,{secrets:true})
    if(!settings.host||!settings.fromEmail)throw fail(400,'Save the SMTP host and sender email first.')
    const transport=transportFactory(settings,config)
    try {await transport.verify()}catch(error){throw fail(502,mailError(error))}finally{transport.close?.()}
  }
  return {config,enqueue,event,requestAuth,run,start,verify,prepare}
}
