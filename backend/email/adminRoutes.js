import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { protect,requireAdmin } from '../middleware/authMiddleware.js'
import { EmailSettings,EmailJob,EmailCampaign } from './models.js'
import { Subscriber,AuditLog } from '../models/domainModels.js'
import { objectId,fail } from '../services/validation.js'
import { settingsInput,campaignInput,publicSettings,loadEmailSettings,websiteUrl } from './settings.js'
import { seal } from './crypto.js'
import { renderEmail } from './templates.js'
import { EMAIL_TEMPLATES,TEMPLATE_VARIABLES } from '../../shared/email.mjs'
const router=Router()
router.use(protect,requireAdmin,(_req,res,next)=>{res.set('Cache-Control','no-store');next()})
const pagination=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),status:z.string().max(30).default('')}).strict()
const audit=(req,action,id)=>AuditLog.create({actor:req.user._id,action,resourceType:'email',resourceId:String(id),summary:action.replaceAll('_',' ')})
router.get('/settings',async(req,res)=>{
  const record=await EmailSettings.findOne({key:'mail'}).select('+passwordEncrypted').lean()
  res.json({settings:publicSettings(record,req.app.locals.config),version:record?.__v || 0,passwordConfigured:Boolean(record?record.passwordEncrypted:req.app.locals.config.SMTP_PASS),source:record?'admin':'environment',templates:EMAIL_TEMPLATES,variables:TEMPLATE_VARIABLES})
})
router.put('/settings',async(req,res)=>{
  const {settings:input,version}=z.object({settings:settingsInput,version:z.number().int().min(0)}).strict().parse(req.body)
  const record=await EmailSettings.findOne({key:'mail'}).select('+passwordEncrypted').lean()
  if((record?.__v || 0)!==version)throw fail(409,'Email settings changed. Reload before saving.')
  const {password,clearPassword,...settings}=input
  let passwordEncrypted=record?.passwordEncrypted || (!record&&req.app.locals.config.SMTP_PASS?seal(req.app.locals.config.SMTP_PASS):'')
  if(password)passwordEncrypted=seal(password)
  if(clearPassword)passwordEncrypted=''
  if(settings.enabled&&settings.username&&!passwordEncrypted)throw fail(400,'Save an SMTP/app password for this username.')
  if(settings.enabled&&settings.templates.contact_admin?.enabled!==false&&!settings.supportEmail)throw fail(400,'Enter the support inbox for contact-form notifications.')
  if(settings.enabled)websiteUrl(settings,req.app.locals.config)
  let saved
  try {saved=await EmailSettings.findOneAndUpdate({key:'mail',__v:record?version:{$exists:false}},{$set:{...settings,passwordEncrypted,updatedBy:req.user._id},$inc:{__v:1}},{upsert:!record,new:true,runValidators:true})}catch(error){if(error.code===11000)throw fail(409,'Email settings changed. Reload before saving.');throw error}
  if(!saved)throw fail(409,'Email settings changed. Reload before saving.')
  await audit(req,'update_email_settings',saved._id)
  res.json({message:'Email settings saved. Changes apply to the next email.',version:saved.__v})
})
const checks=rateLimit({windowMs:15*60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false})
router.post('/verify',checks,async(req,res)=>{await req.app.locals.email.verify();res.json({message:'SMTP connection and authentication succeeded. Use a test email to check sender acceptance.'})})
router.post('/test',checks,async(req,res)=>{
  const settings=await loadEmailSettings(req.app.locals.config)
  if(!settings.enabled)throw fail(409,'Enable and save email settings first.')
  await req.app.locals.email.enqueue('test',req.user.email,{},`test:${crypto.randomUUID()}`)
  await audit(req,'queue_test_email',req.user._id)
  res.status(202).json({message:`Test email queued for ${req.user.email}. Check Delivery history for the result.`})
})
router.post('/preview',async(req,res)=>{
  const {kind,subject,body}=z.object({kind:z.enum([...Object.keys(EMAIL_TEMPLATES),'newsletter_campaign']),subject:z.string().max(200),body:z.string().max(10000)}).strict().parse(req.body)
  const settings=await loadEmailSettings(req.app.locals.config)
  settings.templates={...settings.templates,[kind]:{subject,body}}
  res.json(renderEmail(kind,{name:'Sample customer',orderNumber:'AUR-SAMPLE',trackingNumber:'TRACK-SAMPLE',contactName:'Sample customer',contactEmail:'customer@example.com',contactMessage:'A sample customer enquiry.',subject,body,actionUrl:'https://example.com/action',...(kind==='newsletter_campaign'&&{unsubscribeUrl:'https://example.com/unsubscribe'})},settings))
})
router.get('/jobs',async(req,res)=>{
  const {page,status}=pagination.parse(req.query)
  if(status&&!['pending','processing','sent','failed','cancelled'].includes(status))throw fail(400,'Invalid delivery status.')
  const filter=status?{status}:{}
  const [items,total]=await Promise.all([EmailJob.find(filter).select('kind to status attempts sentAt createdAt lastError campaign').sort({_id:-1}).skip((page-1)*20).limit(20).lean(),EmailJob.countDocuments(filter)])
  res.json({items,total,page,pages:Math.ceil(total/20)})
})
router.post('/jobs/:id/retry',async(req,res)=>{
  const id=objectId.parse(req.params.id)
  const result=await EmailJob.updateOne({_id:id,status:'failed',payloadEncrypted:{$exists:true},$or:[{expiresAt:{$exists:false}},{expiresAt:{$gt:new Date()}}]},{$set:{status:'pending',attempts:0,nextAttemptAt:new Date(),lastError:''},$unset:{purgeAt:1,lockedUntil:1,lockId:1}})
  if(!result.modifiedCount)throw fail(409,'This email cannot be retried. Request a fresh link if it expired.')
  await audit(req,'retry_email',id);res.json({message:'Email queued for retry.'})
})
router.get('/subscribers',async(req,res)=>{
  const {page,status}=pagination.parse(req.query)
  if(status&&!['pending','subscribed','unsubscribed'].includes(status))throw fail(400,'Invalid subscription status.')
  const filter=status==='pending'?{$or:[{subscriptionStatus:'pending'},{subscriptionStatus:{$exists:false}}]}:status?{subscriptionStatus:status}:{}
  const [items,total]=await Promise.all([Subscriber.find(filter).select('email subscriptionStatus consentAt confirmedAt unsubscribedAt').sort({_id:-1}).skip((page-1)*20).limit(20).lean(),Subscriber.countDocuments(filter)])
  res.json({items,total,page,pages:Math.ceil(total/20)})
})
router.get('/campaigns',async(req,res)=>{
  const [items,subscribers]=await Promise.all([EmailCampaign.find().sort({_id:-1}).limit(30).lean(),Subscriber.countDocuments({subscriptionStatus:'subscribed'})])
  res.json({items,subscribers})
})
router.post('/campaigns',async(req,res)=>{
  const item=await EmailCampaign.create({...campaignInput.parse(req.body),createdBy:req.user._id})
  await audit(req,'create_newsletter_draft',item._id);res.status(201).json({item})
})
router.put('/campaigns/:id',async(req,res)=>{
  const {subject,body,version}=campaignInput.extend({version:z.number().int().min(0)}).strict().parse(req.body)
  const item=await EmailCampaign.findOneAndUpdate({_id:objectId.parse(req.params.id),status:'draft',__v:version},{$set:{subject,body},$inc:{__v:1}},{new:true,runValidators:true})
  if(!item)throw fail(409,'This campaign changed or is no longer a draft. Reload it.')
  res.json({item})
})
router.post('/campaigns/:id/send',async(req,res)=>{
  const {confirmed,version}=z.object({confirmed:z.literal(true),version:z.number().int().min(0)}).strict().parse(req.body)
  const settings=await loadEmailSettings(req.app.locals.config)
  if(!confirmed||!settings.enabled)throw fail(409,'Enable email delivery before sending a campaign.')
  const item=await EmailCampaign.findOneAndUpdate({_id:objectId.parse(req.params.id),status:'draft',__v:version},{$set:{status:'sending',startedAt:new Date()},$inc:{__v:1}},{new:true})
  if(!item)throw fail(409,'This campaign changed or was already started.')
  await audit(req,'start_newsletter_campaign',item._id);res.status(202).json({message:'Campaign started for confirmed subscribers.',item})
})
router.post('/campaigns/:id/cancel',async(req,res)=>{
  const id=objectId.parse(req.params.id)
  await EmailCampaign.updateOne({_id:id,status:{$in:['draft','sending','queued']}},{$set:{status:'cancelled'},$inc:{__v:1}})
  await EmailJob.updateMany({campaign:id,status:'pending'},{$set:{status:'cancelled',purgeAt:new Date(Date.now()+30*86400000)},$unset:{payloadEncrypted:1}})
  await audit(req,'cancel_newsletter_campaign',id);res.json({message:'Remaining campaign emails cancelled. Messages already being sent may finish.'})
})
export default router
