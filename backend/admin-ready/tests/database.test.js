import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareDatabase} from '../database.js'
import {applicationCollectionNames,collectionDefinitions} from '../../db/collectionDefinitions.js'
function database({names=[],hasData=false,replica=true}={}){
 const created=[],indexes=[]
 return {created,indexes,databaseName:'aurelia_dev',admin:()=>({command:async()=>replica?{setName:'rs0'}:{}}),listCollections:()=>({toArray:async()=>names.map(name=>({name}))}),createCollection:async name=>created.push(name),collection:name=>({findOne:async()=>hasData?{_id:'existing-record'}:null,listIndexes:()=>({toArray:async()=>[{name:'_id_',key:{_id:1}}]}),createIndex:async(key,options)=>indexes.push({name,key,options})})}
}
test('existing application records prevent automatic database initialization',async()=>{
 const db=database({names:['users','products'],hasData:true}),result=await prepareDatabase(db)
 assert.equal(result.initialized,false);assert.equal(result.existingPreserved,true);assert.equal(db.created.length,0);assert.equal(db.indexes.length,0)
})
test('an empty database receives the original collections and indexes without seed records',async()=>{
 const db=database(),result=await prepareDatabase(db)
 assert.equal(result.initialized,true);assert.deepEqual(db.created,applicationCollectionNames)
 assert.equal(db.indexes.length,Object.values(collectionDefinitions).reduce((sum,d)=>sum+d.indexes.length,0))
})
test('standalone MongoDB and system databases fail before any writes',async()=>{
 const db=database({replica:false});await assert.rejects(()=>prepareDatabase(db),/MongoDB transactions/);assert.equal(db.created.length,0)
 db.databaseName='admin';await assert.rejects(()=>prepareDatabase(db),/application database/)
})
