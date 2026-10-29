import mongoose from 'mongoose'
import { z } from 'zod'
import { SEO_LIMITS, STATIC_PAGES } from '../../shared/seo.mjs'

const webUrl = value => {
  if (!value) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !/[\s\\]/.test(value) } catch { return false }
}
const canonicalUrl = value => !value || (/^\/(?!\/)[^\s#\\]*$/.test(value) && !value.includes('..')) || webUrl(value)
const urlField = key => key === 'canonical' ? canonicalUrl : webUrl
const isUrl = key => ['canonical','socialImage','twitterImage'].includes(key)
export const seoInput = z.object({
  ...Object.fromEntries(Object.entries(SEO_LIMITS).map(([key,max]) => [key, (isUrl(key) ? z.string().trim().max(max).refine(urlField(key), key === 'canonical' ? 'Use a local /page path or an absolute HTTPS canonical URL without a fragment.' : 'Use an absolute HTTPS image URL.') : z.string().trim().max(max)).optional()])),
  imageAlts: z.array(z.string().trim().max(300)).max(12).optional(), noindex: z.boolean().optional(),
}).strict()
export const seoSettingsInput = z.object({ siteUrl: z.string().trim().max(2048).refine(value => !value || (webUrl(value) && new URL(value).pathname === '/' && !new URL(value).search), 'Use your public HTTPS domain, without a path or query.'), defaultDescription: z.string().trim().max(320), defaultImage: z.string().trim().max(2048).refine(webUrl, 'Use an HTTPS image URL.'), defaultImageAlt: z.string().trim().max(300) }).strict()
export const seoSchema = new mongoose.Schema({ ...Object.fromEntries(Object.entries(SEO_LIMITS).map(([key,max]) => [key, { type: String, trim: true, maxlength: max, ...(isUrl(key) && { validate: urlField(key) }) }])), imageAlts: { type: [String], default: undefined, validate: values => values.length <= 12 && values.every(value => value.length <= 300) }, noindex: Boolean }, { _id: false, strict: 'throw' })
export const seoPagesSchema = new mongoose.Schema(Object.fromEntries(STATIC_PAGES.map(page => [page.key, { type: seoSchema, default: undefined }])), { _id: false, strict: 'throw' })
export const seoSettingsSchema = new mongoose.Schema({ siteUrl: { type: String, maxlength: 2048 }, defaultDescription: { type: String, maxlength: 320 }, defaultImage: { type: String, maxlength: 2048 }, defaultImageAlt: { type: String, maxlength: 300 } }, { _id: false, strict: 'throw' })
export const seoValidator = { bsonType: 'object', properties: { ...Object.fromEntries(Object.entries(SEO_LIMITS).map(([key,maxLength]) => [key,{ bsonType: 'string', maxLength }])), imageAlts: { bsonType: 'array', maxItems: 12, items: { bsonType: 'string', maxLength: 300 } }, noindex: { bsonType: 'bool' } }, additionalProperties: false }
export const seoSettingsValidator = { bsonType: 'object', properties: { siteUrl: { bsonType: 'string', maxLength: 2048 }, defaultDescription: { bsonType: 'string', maxLength: 320 }, defaultImage: { bsonType: 'string', maxLength: 2048 }, defaultImageAlt: { bsonType: 'string', maxLength: 300 } }, additionalProperties: false }
export const seoPagesValidator = { bsonType: 'object', properties: Object.fromEntries(STATIC_PAGES.map(p => [p.key, seoValidator])), additionalProperties: false }
