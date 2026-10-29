import { isDeepStrictEqual } from 'node:util'
import { seoValidator, seoSettingsValidator, seoPagesValidator } from './schema.js'

const additions = { products: { seo: seoValidator }, categories: { seo: seoValidator }, product_collections: { seo: seoValidator }, pages: { seo: seoValidator }, blog_posts: { seo: seoValidator }, site_settings: { seoSettings: seoSettingsValidator, seoPages: seoPagesValidator } }
export function extendSeoValidator(validator, fields) {
  const copy = structuredClone(validator || {})
  // Extend only top-level document schemas, including those inside logical validators.
  function visit(rule) {
    if (rule.$jsonSchema) {
      rule.$jsonSchema.properties ||= {}
      for (const [field, schema] of Object.entries(fields)) {
        const existing = rule.$jsonSchema.properties[field]
        rule.$jsonSchema.properties[field] = existing ? { ...existing, properties: { ...schema.properties, ...existing.properties } } : structuredClone(schema)
      }
    }
    for (const op of ['$and','$or','$nor']) for (const child of rule[op] || []) visit(child)
  }
  visit(copy)
  return copy
}
// No document updates, index changes, collection drops, seeds or replacement validators.
export async function ensureSeoDatabase(db) {
  const collections = await db.listCollections({}, { nameOnly: false }).toArray()
  const changed = []
  for (const collection of collections) {
    const fields = additions[collection.name]
    if (!fields || collection.type === 'view') continue
    const existing = collection.options?.validator || {}, validator = extendSeoValidator(existing, fields)
    if (!isDeepStrictEqual(existing, validator)) {
      await db.command({ collMod: collection.name, validator })
      changed.push(collection.name)
    }
  }
  return { changed }
}
