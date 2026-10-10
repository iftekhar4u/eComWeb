import { isDeepStrictEqual } from 'node:util'
import { EMAIL_KINDS, EMAIL_TEMPLATES } from '../../shared/email.mjs'
const str = maxLength => ({ bsonType:'string',maxLength })
const date = { bsonType:'date' }, oid = { bsonType:'objectId' }, bool = { bsonType:'bool' }
const integer = (minimum=0,maximum=2147483647) => ({bsonType:'int',minimum,maximum})
const object = (required,properties) => ({$jsonSchema:{bsonType:'object',required,additionalProperties:false,properties:{_id:oid,createdAt:date,updatedAt:date,__v:integer(),...properties}}})
export const subscriberEmailValidator = { subscriptionStatus:{enum:['pending','subscribed','unsubscribed']}, confirmTokenHash:str(64), confirmExpiresAt:date, confirmedAt:date, unsubscribedAt:date }
const template = {bsonType:'object',additionalProperties:false,properties:{enabled:bool,subject:str(200),body:str(10000)}}
export const emailCollectionDefinitions = {
  email_settings:{validator:object(['key'],{key:{enum:['mail']},enabled:bool,host:str(253),port:integer(1,65535),secure:bool,username:str(320),passwordEncrypted:str(4096),fromEmail:str(254),fromName:str(100),supportEmail:str(254),publicUrl:str(2048),templates:{bsonType:'object',additionalProperties:false,properties:Object.fromEntries(Object.keys(EMAIL_TEMPLATES).map(key=>[key,template]))},updatedBy:oid}),indexes:[[{key:1},{name:'uq_email_settings_key',unique:true}]]},
  email_jobs:{validator:object(['eventKey','kind','to','status','attempts','nextAttemptAt'],{eventKey:str(240),kind:{enum:EMAIL_KINDS},to:str(254),payloadEncrypted:str(150000),status:{enum:['pending','processing','sent','failed','cancelled']},attempts:integer(),nextAttemptAt:date,lockedUntil:date,lockId:str(100),sentAt:date,expiresAt:date,purgeAt:date,lastError:str(300),messageId:str(300),campaign:oid,subscriber:oid}),indexes:[[{eventKey:1},{name:'uq_email_jobs_event',unique:true}],[{status:1,nextAttemptAt:1,lockedUntil:1},{name:'email_jobs_ready'}],[{purgeAt:1},{name:'ttl_email_jobs',expireAfterSeconds:0}]]},
  email_campaigns:{validator:object(['subject','body','status','createdBy'],{subject:str(200),body:str(10000),status:{enum:['draft','sending','queued','cancelled']},startedAt:date,cursor:oid,queuedCount:integer(),createdBy:oid}),indexes:[]},
}
export function extendSubscriberValidator(validator) {
  const result=structuredClone(validator || {})
  const visit=rule=>{if(rule.$jsonSchema){rule.$jsonSchema.properties={...subscriberEmailValidator,...rule.$jsonSchema.properties}};for(const op of ['$and','$or','$nor'])for(const child of rule[op] || [])visit(child)}
  visit(result);return result
}
export async function ensureEmailDatabase(db) {
  const current=await db.listCollections({}, {nameOnly:false}).toArray()
  for(const [name,definition] of Object.entries(emailCollectionDefinitions)) {
    if(!current.some(item=>item.name===name)) await db.createCollection(name,{validator:definition.validator,validationLevel:'strict',validationAction:'error'})
    const collection=db.collection(name), indexes=await collection.listIndexes().toArray()
    for(const [key,options] of definition.indexes) {
      const found=indexes.find(index=>JSON.stringify(index.key)===JSON.stringify(key))
      if(found) {if(Boolean(found.unique)!==Boolean(options.unique) || found.expireAfterSeconds!==options.expireAfterSeconds)throw new Error(`Email index on ${name} needs review. No indexes were removed.`)}
      else await collection.createIndex(key,options)
    }
  }
  const subscribers=current.find(item=>item.name==='subscribers')
  if(subscribers) {
    const old=subscribers.options?.validator || {}, next=extendSubscriberValidator(old)
    if(!isDeepStrictEqual(old,next))await db.command({collMod:'subscribers',validator:next})
  }
  const tokens=current.find(item=>item.name==='auth_tokens')
  if(tokens) {
    const old=tokens.options?.validator || {}, next=structuredClone(old)
    const visit=rule=>{if(rule.$jsonSchema){rule.$jsonSchema.properties ||= {};rule.$jsonSchema.properties.sessionVersion ||= integer()};for(const op of ['$and','$or','$nor'])for(const child of rule[op] || [])visit(child)}
    visit(next)
    if(!isDeepStrictEqual(old,next))await db.command({collMod:'auth_tokens',validator:next})
  }
}
