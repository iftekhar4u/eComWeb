import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureSeoDatabase, extendSeoValidator } from '../database.js'
import { seoValidator } from '../schema.js'

test('SEO migration extends only SEO permissions and preserves existing validators',()=>{
  const schema = {bsonType:'object',required:['name','price'],additionalProperties:false,properties:{name:{bsonType:'string'},price:{bsonType:'int',minimum:0},seo:{bsonType:'object',additionalProperties:false,properties:{title:{bsonType:'string',maxLength:100},description:{bsonType:'string',maxLength:320}}}}}
  const validator={$and:[{$jsonSchema:schema},{$expr:{$gte:['$price',0]}}]}
  const result=extendSeoValidator(validator,{seo:seoValidator})
  assert.deepEqual(result.$and[1],validator.$and[1]);assert.deepEqual(result.$and[0].$jsonSchema.required,['name','price'])
  assert.equal(result.$and[0].$jsonSchema.properties.seo.properties.title.maxLength,100)
  assert.equal(result.$and[0].$jsonSchema.properties.seo.properties.canonical.maxLength,2048)
  assert.ok(!validator.$and[0].$jsonSchema.properties.seo.properties.canonical)
})
test('startup SEO migration is idempotent and never touches records or indexes',async()=>{
  const collections=[{name:'products',options:{validator:{$jsonSchema:{bsonType:'object',required:['name'],properties:{name:{bsonType:'string'}},additionalProperties:false}}}},{name:'users',options:{validator:{$jsonSchema:{required:['password']}}}}]
  const commands=[],db={listCollections:()=>({toArray:async()=>collections}),command:async command=>{commands.push(command);collections.find(c=>c.name===command.collMod).options.validator=command.validator}}
  assert.deepEqual((await ensureSeoDatabase(db)).changed,['products'])
  assert.equal(commands.length,1);assert.deepEqual(Object.keys(commands[0]),['collMod','validator'])
  assert.deepEqual((await ensureSeoDatabase(db)).changed,[])
  assert.deepEqual(collections[1].options.validator,{$jsonSchema:{required:['password']}})
})
