import Product from '../models/Product.js'
import { Category, ProductCollection, Page, BlogPost, SiteSettings } from '../models/domainModels.js'
import { publicProducts } from '../services/catalog.js'
import { buildMetadata, normalizePath, fixedPage, STATIC_PAGES, RESOURCE_PATHS, siteOrigin, safeUrl, xmlEscape } from '../../shared/seo.mjs'

export const seoResources = { products: Product, categories: Category, collections: ProductCollection, pages: Page, blogs: BlogPost }
export const publishedFilter = kind => kind === 'categories' ? { active: true } : { status: 'published' }
export async function resolveMetadata(path, search, fallbackOrigin) {
  path = normalizePath(path)
  const settings = await SiteSettings.findOne({ key: 'site' }).select('brandName seoSettings seoPages').lean() || {}
  let kind, record, status = 200
  for (const [resource, prefix] of Object.entries(RESOURCE_PATHS)) {
    if (!path.startsWith(prefix)) continue
    const slug = decodeURIComponent(path.slice(prefix.length))
    if (!slug || slug.includes('/')) continue
    kind = resource
    record = await seoResources[kind].findOne({ slug: kind === 'categories' ? slug.toLowerCase() : slug, ...publishedFilter(kind) }).lean()
    if (record && kind === 'products') record = (await publicProducts([record]))[0]
    if (!record) status = 404
    break
  }
  if (!kind && !fixedPage(path)) status = 404
  return buildMetadata({ path, search, kind, record, settings, origin: fallbackOrigin, status })
}
export const SITEMAP_PAGE_SIZE = 1000
const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n'
const sitemapFilter = kind => ({ ...publishedFilter(kind), 'seo.noindex': { $ne: true } })
export function sitemapEntries(records, prefix, origin) {
  return records.filter(record => !record.seo?.noindex).flatMap(record => {
    const url = new URL(prefix + encodeURIComponent(record.slug), origin).href
    const canonical = safeUrl(record.seo?.canonical, origin)
    // Alternate URLs and off-site canonical destinations are not sitemap entries.
    if (canonical && canonical !== url) return []
    const date = record.updatedAt && new Date(record.updatedAt)
    return [{ loc: url, ...(date && !Number.isNaN(date.getTime()) && { lastmod: date.toISOString() }) }]
  })
}
export const urlset = entries => `${xmlHeader}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry => `<url><loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : ''}</url>`).join('')}</urlset>`
export async function sitemapIndex(fallbackOrigin) {
  const settings = await SiteSettings.findOne({ key: 'site' }).select('seoSettings').lean() || {}
  const origin = siteOrigin(settings, fallbackOrigin)
  const counts = await Promise.all(Object.keys(seoResources).map(async kind => [kind, await seoResources[kind].countDocuments(sitemapFilter(kind))]))
  const files = ['/sitemaps/fixed.xml', ...counts.flatMap(([kind, count]) => Array.from({ length: Math.ceil(count / SITEMAP_PAGE_SIZE) }, (_, index) => `/sitemaps/${kind}-${index + 1}.xml`))]
  return `${xmlHeader}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files.map(file => `<sitemap><loc>${xmlEscape(origin + file)}</loc></sitemap>`).join('')}</sitemapindex>`
}
export async function sitemapPart(name, fallbackOrigin) {
  const settings = await SiteSettings.findOne({ key: 'site' }).select('seoSettings seoPages').lean() || {}
  const origin = siteOrigin(settings, fallbackOrigin)
  if (name === 'fixed.xml') return urlset(STATIC_PAGES.filter(page => !page.private && !settings.seoPages?.[page.key]?.noindex).flatMap(page => {
    const loc = new URL(page.path, origin).href, canonical = safeUrl(settings.seoPages?.[page.key]?.canonical, origin)
    return canonical && canonical !== loc ? [] : [{ loc }]
  }))
  const match = /^(products|categories|collections|pages|blogs)-([1-9]\d*)\.xml$/.exec(name)
  if (!match || Number(match[2]) > 100000) return null
  const [, kind, page] = match
  const records = await seoResources[kind].find(sitemapFilter(kind)).sort({ _id: 1 }).skip((Number(page) - 1) * SITEMAP_PAGE_SIZE).limit(SITEMAP_PAGE_SIZE).select('slug seo updatedAt').lean()
  if (!records.length && Number(page) > 1) return null
  return urlset(sitemapEntries(records, RESOURCE_PATHS[kind], origin))
}
