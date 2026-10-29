// Deterministic storage double ONLY. This does not emulate MongoDB transaction
// isolation, validators, unique indexes, rollback or cross-process races.
import mongoose from 'mongoose'
import { vi } from 'vitest'
export const oid = () => new mongoose.Types.ObjectId()
const valueAt = (doc,path) => path.split('.').reduce((o,k)=>o?.[k],doc)
const equal = (a,b) => a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : String(a) === String(b)
function expr(value, doc) {
  if (typeof value==='string' && value.startsWith('$')) return valueAt(doc,value.slice(1))
  if (Array.isArray(value)) return value.map(v=>expr(v,doc))
  if (!value || typeof value!=='object') return value
  const [op,args] = Object.entries(value)[0], values = expr(args,doc)
  if(op==='$subtract')return values[0]-values[1]
  if(op==='$gte')return values[0]>=values[1]
  if(op==='$lte')return values[0]<=values[1]
  return false
}
export function matches(doc,filter={}) {
  return Object.entries(filter).every(([key,condition])=>{
    if(key==='$or')return condition.some(f=>matches(doc,f))
    if(key==='$and')return condition.every(f=>matches(doc,f))
    if(key==='$expr')return expr(condition,doc)
    const value = valueAt(doc,key)
    if(condition && typeof condition==='object' && !(condition instanceof Date) && !condition._bsontype) return Object.entries(condition).every(([op,v])=> {
      if(op==='$in')return v.some(x=>equal(x,value))
      if(op==='$nin')return !v.some(x=>equal(x,value))
      if(op==='$ne')return !equal(value,v)
      if(op==='$exists')return (value!==undefined)===v
      if(op==='$lt')return value<v
      if(op==='$lte')return value<=v
      if(op==='$gt')return value>v
      if(op==='$gte')return value>=v
      return false
    })
    return equal(value,condition)
  })
}
export function memoryModels(Models) {
  const stores = new Map(), originalDb=mongoose.connection.db
  mongoose.connection.db = { admin:()=>({command:async()=>({setName:'unit-storage-double'})}) }
  vi.spyOn(mongoose,'startSession').mockResolvedValue({withTransaction:fn=>fn(),endSession:async()=>{}})
  function query(producer) {
    let lean=false, limit=Infinity, skip=0, sort
    const q={ session:()=>q, select:()=>q, lean:()=>{lean=true;return q}, sort:value=>{sort=value;return q}, limit:value=>{limit=value;return q}, skip:value=>{skip=value;return q}, then:(ok,no)=>Promise.resolve().then(producer).then(result=>{
      if(Array.isArray(result)) { result=[...result];if(sort)result.sort((a,b)=>{for(const [key,dir] of Object.entries(sort)){const av=valueAt(a,key),bv=valueAt(b,key);if(av>bv)return dir;if(av<bv)return -dir}return 0});result=result.slice(skip,skip+limit) }
      return lean ? Array.isArray(result)?result.map(v=>v.toObject?.()||v):result?.toObject?.()||result : result
    }).then(ok,no) };return q
  }
  for(const Model of Models) {
    const rows=[];stores.set(Model,rows)
    async function save(doc) { await doc.validate();doc.createdAt ||= new Date();doc.updatedAt=new Date();if(!rows.some(r=>equal(r._id,doc._id)))rows.push(doc);return doc }
    vi.spyOn(Model.prototype,'save').mockImplementation(function(){return save(this)})
    vi.spyOn(Model,'create').mockImplementation(async input=>Array.isArray(input)?Promise.all(input.map(v=>save(new Model(v)))):save(new Model(input)))
    vi.spyOn(Model,'find').mockImplementation(filter=>query(()=>rows.filter(r=>matches(r,filter))))
    vi.spyOn(Model,'findOne').mockImplementation(filter=>query(()=>rows.find(r=>matches(r,filter))||null))
    vi.spyOn(Model,'findById').mockImplementation(id=>query(()=>rows.find(r=>equal(r._id,id))||null))
    vi.spyOn(Model,'exists').mockImplementation(filter=>query(()=>rows.find(r=>matches(r,filter))?{_id:rows.find(r=>matches(r,filter))._id}:null))
    vi.spyOn(Model,'countDocuments').mockImplementation(filter=>query(()=>rows.filter(r=>matches(r,filter)).length))
    function update(filter,change,options={},byId=false) {
      let doc=rows.find(r=>matches(r,byId?{_id:filter}:filter)),insert=false
      if(!doc && options.upsert){doc=new Model(Object.fromEntries(Object.entries(filter).filter(([k,v])=>!k.startsWith('$')&&(typeof v!=='object'||v?._bsontype))));insert=true;rows.push(doc)}
      if(!doc)return null
      if(insert)for(const [k,v] of Object.entries(change.$setOnInsert||{}))doc.set(k,v)
      for(const [k,v] of Object.entries(change.$set||{}))doc.set(k,v)
      for(const [k,v] of Object.entries(change.$inc||{}))doc.set(k,(doc.get(k)||0)+v)
      for(const k of Object.keys(change.$unset||{}))doc.set(k,undefined)
      return doc
    }
    vi.spyOn(Model,'updateOne').mockImplementation((f,u,o)=>query(()=>({modifiedCount:update(f,u,o)?1:0})))
    vi.spyOn(Model,'findOneAndUpdate').mockImplementation((f,u,o)=>query(()=>update(f,u,o)))
    vi.spyOn(Model,'findByIdAndUpdate').mockImplementation((f,u,o)=>query(()=>update(f,u,o,true)))
  }
  return { rows:Model=>stores.get(Model), close(){vi.restoreAllMocks();mongoose.connection.db=originalDb} }
}
