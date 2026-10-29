import { Router } from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { protect, requireAdmin } from '../middleware/authMiddleware.js'
import { requireCsrf } from '../middleware/csrfMiddleware.js'
import { SiteSettings, AuditLog } from '../models/domainModels.js'
import { objectId, fail } from '../services/validation.js'
import { seoInput, seoSettingsInput } from './schema.js'
import { resolveMetadata, seoResources, sitemapIndex, sitemapPart } from './service.js'
import { STATIC_PAGES, RESOURCE_PATHS, siteOrigin, buildMetadata, injectHead } from '../../shared/seo.mjs'

export const publicSeoRoutes = Router()
publicSeoRoutes.get('/resolve', async (req,res) => {
  const input = z.object({ path: z.string().max(1000).regex(/^\/(?!\/)[^?#\\]*$/), search: z.string().max(2000).default('') }).strict().parse(req.query)
  res.set('Cache-Control','no-store').json(await resolveMetadata(input.path, input.search, req.app.locals.clientUrl))
})

export const adminSeoRoutes = Router()
adminSeoRoutes.use(requireCsrf, protect, requireAdmin)
adminSeoRoutes.get('/settings', async (req,res) => {
  const settings = await SiteSettings.findOne({key:'site'}).select('brandName seoSettings seoPages __v').lean()
  res.json({ settings: settings?.seoSettings || {}, version: settings?.__v || 0, origin: siteOrigin(settings || {}, req.app.locals.clientUrl), pages: STATIC_PAGES.map(page => ({ ...page, seo: settings?.seoPages?.[page.key] || {} })) })
})
async function saveSettings(req, update, version) {
  const exists = await SiteSettings.exists({ key: 'site' })
  const filter = { key: 'site', ...(exists && { $or: [{__v:version}, ...(version === 0 ? [{__v:{$exists:false}}] : [])] }) }
  if (!exists && version !== 0) throw fail(409,'SEO settings changed. Reload before saving.')
  let item
  try { item = await SiteSettings.findOneAndUpdate(filter, { $set: {...update,updatedBy:req.user._id}, $inc: {__v:1}, ...(!exists && {$setOnInsert:{brandName:'AURELIA'}}) }, {new:true,upsert:!exists,runValidators:true}) } catch(error) { if (error.code === 11000) throw fail(409,'SEO settings changed. Reload before saving.'); throw error }
  if (!item) throw fail(409,'SEO settings changed. Reload before saving.')
  await AuditLog.create({actor:req.user._id,action:'update_seo',resourceType:'settings',resourceId:String(item._id),summary:'Updated SEO settings'})
  return item
}
adminSeoRoutes.put('/settings', async (req,res) => {
  const input = z.object({settings:seoSettingsInput,version:z.number().int().min(0)}).strict().parse(req.body)
  const item = await saveSettings(req,{seoSettings:input.settings},input.version)
  res.json({message:'SEO defaults saved.',version:item.__v})
})
adminSeoRoutes.put('/fixed/:key', async (req,res) => {
  const page = STATIC_PAGES.find(p => p.key === req.params.key)
  if (!page) throw fail(404,'Page not found')
  const input = z.object({seo:seoInput,version:z.number().int().min(0)}).strict().parse(req.body)
  if (page.private) input.seo.noindex = true
  const item = await saveSettings(req,{[`seoPages.${page.key}`]:input.seo},input.version)
  res.json({message:'Page SEO saved.',version:item.__v})
})
adminSeoRoutes.get('/:resource', async (req,res) => {
  const Model = Object.hasOwn(seoResources,req.params.resource) && seoResources[req.params.resource]
  if (!Model) throw fail(404,'SEO resource not found')
  const {page,search} = z.object({page:z.coerce.number().int().min(1).max(10000).default(1),search:z.string().trim().max(100).default('')}).strict().parse(req.query)
  const field = ['blogs','pages'].includes(req.params.resource) ? 'title' : 'name'
  const filter = search ? {[field]:{$regex:search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'}} : {}
  const [items,total] = await Promise.all([Model.find(filter).select('name title slug seo status active description shortDescription excerpt thumbnail image updatedAt __v').sort({_id:1}).skip((page-1)*20).limit(20).lean(),Model.countDocuments(filter)])
  res.json({items:items.map(item=>({...item,path:RESOURCE_PATHS[req.params.resource]+encodeURIComponent(item.slug)})),total,page,pages:Math.ceil(total/20)})
})
adminSeoRoutes.put('/:resource/:id', async (req,res) => {
  const Model = Object.hasOwn(seoResources,req.params.resource) && seoResources[req.params.resource]
  if (!Model) throw fail(404,'SEO resource not found')
  const id = objectId.parse(req.params.id)
  const input = z.object({seo:seoInput,updatedAt:z.string().datetime()}).strict().parse(req.body)
  const item = await Model.findOneAndUpdate({_id:id,updatedAt:new Date(input.updatedAt)},{$set:{seo:input.seo},$inc:{__v:1}},{new:true,runValidators:true})
  if (!item) throw fail(409,'This record changed or was removed. Reload before saving.')
  await AuditLog.create({actor:req.user._id,action:'update_seo',resourceType:req.params.resource,resourceId:id,summary:'Updated SEO fields only'})
  res.json({message:'SEO saved.',item})
})

export const crawlRoutes = Router()
crawlRoutes.get('/about', (_req, res) => res.redirect(301, '/pages/about'))
crawlRoutes.get('/robots.txt', async (req,res) => {
  const settings = await SiteSettings.findOne({key:'site'}).select('seoSettings').lean() || {}
  res.type('text/plain').set('Cache-Control','no-cache').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /__dev/\nSitemap: ${siteOrigin(settings,req.app.locals.clientUrl)}/sitemap.xml\n`)
})
crawlRoutes.get('/sitemap.xml', async (req,res) => res.type('application/xml').set('Cache-Control','no-cache').send(await sitemapIndex(req.app.locals.clientUrl)))
crawlRoutes.get('/sitemaps/:name', async (req,res) => {
  const xml = await sitemapPart(req.params.name,req.app.locals.clientUrl)
  if (!xml) return res.status(404).type('text/plain').send('Sitemap not found')
  res.type('application/xml').set('Cache-Control','no-cache').send(xml)
})
export function seoHtml(staticDirectory) {
  let template
  return async (req,res,next) => {
    if (!['GET','HEAD'].includes(req.method) || req.path === '/api' || req.path.startsWith('/api/') || (path.extname(req.path) && req.path !== '/index.html')) return next()
    template ||= await readFile(path.join(staticDirectory,'index.html'),'utf8')
    let metadata
    try { metadata = await resolveMetadata(req.path, new URL(req.originalUrl,'http://local').search,req.app.locals.clientUrl) }
    catch(error) {
      // Keep existing UI usable during a metadata/database failure; ask crawlers to retry.
      req.app.emit('seoError',error)
      metadata = buildMetadata({path:req.path,origin:req.app.locals.clientUrl,status:503})
    }
    res.status(metadata.status).set('Cache-Control','no-store').type('html').send(injectHead(template,metadata))
  }
}
