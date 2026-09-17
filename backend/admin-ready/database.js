import {collectionDefinitions,applicationCollectionNames} from '../db/collectionDefinitions.js'

// Provision only an empty application database. Existing records, validators and
// indexes are left in place; no seed data, deletes, collMod or index drops occur.
export async function prepareDatabase(db) {
  if(['admin','local','config'].includes(db.databaseName)) throw new Error('Choose an application database in your MongoDB URI, such as aurelia_dev.')
  const hello=await db.admin().command({hello:1})
  if(!hello.setName && hello.msg!=='isdbgrid') throw new Error('This store needs MongoDB transactions. Use the local MongoDB replica set rs0 on port 27017. Check backend/.env and the MongoDB Windows service; see README.md.')
  const existing=new Set((await db.listCollections({}, {nameOnly:true}).toArray()).map(c=>c.name))
  for(const name of applicationCollectionNames) {
    if(existing.has(name) && await db.collection(name).findOne({}, {projection:{_id:1}})) return {initialized:false,existingPreserved:true}
  }
  for(const [name,definition] of Object.entries(collectionDefinitions)) {
    if(!existing.has(name)) await db.createCollection(name,{validator:definition.validator,validationLevel:'strict',validationAction:'error'})
    const collection=db.collection(name)
    const indexes=await collection.listIndexes().toArray()
    for(const [key,options] of definition.indexes) {
      const found=indexes.find(index=>JSON.stringify(index.key)===JSON.stringify(key))
      if(found) {
        if(Boolean(found.unique)!==Boolean(options.unique)) throw new Error(`Existing index ${found.name} on ${name} needs review. No indexes were removed or replaced.`)
        continue
      }
      await collection.createIndex(key,options)
    }
  }
  return {initialized:true,existingPreserved:true}
}
