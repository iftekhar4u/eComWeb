// Isolated collection adapter: real Mongoose casting, validation and queries;
// deterministic persistence for tests without a live MongoDB connection.
// This does not replace a deployment check against a real replica set.
import mongoose from 'mongoose'
import User from '../../models/User.js'
import { AuthToken, Subscriber, AuditLog, ContactMessage } from '../../models/domainModels.js'
import { EmailSettings, EmailJob, EmailCampaign } from '../models.js'
export { User, AuthToken, Subscriber, AuditLog, ContactMessage, EmailSettings, EmailJob, EmailCampaign }
export const config={NODE_ENV:'test',CLIENT_URL:'http://localhost:5173',SESSION_SECRET:'isolated-email-test-secret-with-32-characters',EMAIL_ENABLED:true,SMTP_HOST:'smtp.example.com',SMTP_PORT:587,SMTP_SECURE:false,SMTP_USER:'test-user',SMTP_PASS:'fixture-password',MAIL_FROM:'store@example.com',MAIL_SUPPORT:'support@example.com',TRUST_PROXY:0,GOOGLE_AUTH_ENABLED:false}
const clone=value=>value instanceof Date?new Date(value):value instanceof mongoose.Types.ObjectId?new mongoose.Types.ObjectId(String(value)):value?.$__?clone(value.toObject({flattenMaps:true})):value instanceof Map?clone(Object.fromEntries(value)):Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])):value
const get=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row)
function set(row,key,value){const path=key.split('.'),last=path.pop();let target=row;for(const part of path)target=target[part]??={};target[last]=clone(value)}
function unset(row,key){const path=key.split('.'),last=path.pop();let target=row;for(const part of path)target=target?.[part];if(target)delete target[last]}
const equal=(a,b)=>a==null&&b==null || (a instanceof Date || b instanceof Date?Number(a)===Number(b):String(a)===String(b))
function matches(row,query={}) {
 return Object.entries(query).every(([key,expected])=>{
  if(key==='$or')return expected.some(q=>matches(row,q))
  if(key==='$and')return expected.every(q=>matches(row,q))
  const actual=get(row,key)
  if(expected&&typeof expected==='object'&&!(expected instanceof Date)&&!(expected instanceof mongoose.Types.ObjectId))return Object.entries(expected).every(([op,v])=>{
   if(op==='$in')return v.some(x=>equal(actual,x))
   if(op==='$ne')return !equal(actual,v)
   if(op==='$exists')return (actual!==undefined)===v
   if(actual===undefined)return false
   if(op==='$gt')return actual>v
   if(op==='$gte')return actual>=v
   if(op==='$lt')return actual<v
   if(op==='$lte')return actual<=v
   throw new Error(`Unsupported fixture operator ${op}`)
  })
  return equal(actual,expected)
 })
}
function project(row,projection={}) {
 if(!row)return null
 const inclusive=Object.keys(projection).filter(k=>projection[k]&&k!=='_id'), result=inclusive.length?{_id:clone(row._id)}:clone(row)
 for(const key of inclusive)if(get(row,key)!==undefined)set(result,key,get(row,key))
 for(const [key,v] of Object.entries(projection))if(!v)unset(result,key)
 return result
}
function sortRows(rows,sort={}){return rows.sort((a,b)=>{for(const [key,direction] of Object.entries(sort)){const x=get(a,key),y=get(b,key);if(x>y)return direction;if(x<y)return -direction}return 0})}
export function fixture() {
 const collections=new Map(),restores=[]
 const models=[User,AuthToken,Subscriber,AuditLog,ContactMessage,EmailSettings,EmailJob,EmailCampaign]
 const rows=model=>collections.get(model.modelName)
 const patch=(target,key,value)=>{const old=target[key];restores.push(()=>target[key]=old);target[key]=value}
 function unique(model,record,skip) {
  const fields=model===EmailSettings?['key']:model===EmailJob?['eventKey']:model===User||model===Subscriber?['email']:model===AuthToken?['tokenHash','purpose']:[]
  if(fields.length&&rows(model).some(row=>row!==skip&&fields.every(k=>equal(row[k],record[k]))))throw Object.assign(new Error('Duplicate test record'),{code:11000})
 }
 function update(model,filter,change,options={},many=false) {
  const selected=sortRows(rows(model).filter(row=>matches(row,filter)),options.sort)
  let targets=many?selected:selected.slice(0,1),inserted=false
  if(!targets.length&&options.upsert){const record={_id:new mongoose.Types.ObjectId()};for(const [k,v] of Object.entries(filter))if(!k.startsWith('$')&&(!(v&&typeof v==='object')||v instanceof mongoose.Types.ObjectId))record[k]=clone(v);targets=[record];inserted=true}
  for(const row of targets){const next=clone(row);for(const [k,v]of Object.entries({...change.$set,...(inserted?change.$setOnInsert:{})}))set(next,k,v);for(const [k,v]of Object.entries(change.$inc||{}))set(next,k,(get(next,k)||0)+v);for(const k of Object.keys(change.$unset||{}))unset(next,k);unique(model,next,row);for(const k of Object.keys(row))delete row[k];Object.assign(row,next);if(inserted)rows(model).push(row)}
  return {acknowledged:true,matchedCount:inserted?0:targets.length,modifiedCount:inserted?0:targets.length,upsertedId:inserted?targets[0]._id:null,record:targets[0]||null}
 }
 for(const model of models) {
  collections.set(model.modelName,[])
  patch(model.collection,'findOne',async(filter,options={})=>project(sortRows(rows(model).filter(row=>matches(row,filter)),options.sort)[0],options.projection))
  patch(model.collection,'find',(filter={},options={})=>({toArray:async()=>sortRows(rows(model).filter(row=>matches(row,filter)),options.sort).slice(options.skip||0,options.limit?(options.skip||0)+options.limit:undefined).map(row=>project(row,options.projection))}))
  patch(model.collection,'countDocuments',async(filter={})=>rows(model).filter(row=>matches(row,filter)).length)
  patch(model.collection,'insertOne',async(record)=>{unique(model,record);rows(model).push(clone(record));return {acknowledged:true,insertedId:record._id}})
  patch(model.collection,'updateOne',async(filter,change,options)=>update(model,filter,change,options))
  patch(model.collection,'updateMany',async(filter,change,options)=>update(model,filter,change,options,true))
  patch(model.collection,'findOneAndUpdate',async(filter,change,options)=>project(update(model,filter,change,options).record,options?.projection))
 }
 patch(mongoose.connection,'db',{admin:()=>({command:async()=>({setName:'isolated-fixture'})})})
 patch(mongoose,'startSession',async()=>({endSession:async()=>{},withTransaction:async work=>{const snapshot=clone(Object.fromEntries(collections));try{return await work()}catch(error){for(const [key,value]of Object.entries(snapshot))collections.set(key,value);throw error}}}))
 return {rows,reset(){for(const model of models)collections.set(model.modelName,[])},restore(){for(const undo of restores.reverse())undo()}}
}
