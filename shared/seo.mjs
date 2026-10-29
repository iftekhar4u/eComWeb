// One metadata definition shared by Express and the React navigation layer.
export const SEO_LIMITS = { title: 160, description: 320, canonical: 2048, imageAlt: 300, socialTitle: 160, socialDescription: 320, socialImage: 2048, socialImageAlt: 300, twitterTitle: 160, twitterDescription: 320, twitterImage: 2048 }
export const STATIC_PAGES = [
  { key: 'home', path: '/', label: 'Homepage', title: 'Your beauty. Your radiance.', description: 'Premium botanical beauty and skincare essentials for your everyday routine.' },
  { key: 'shop', path: '/shop', label: 'Shop', title: 'Shop beauty rituals', description: 'Explore botanical skincare, sun care and hair care essentials.' },
  { key: 'blog', path: '/blog', label: 'Blog index', title: 'Beauty tips & guides', description: 'Thoughtful skincare tips and beauty guides from our journal.' },
  { key: 'collections', path: '/collections', label: 'Collections index', title: 'Our collections', description: 'Explore our curated beauty and skincare collections.' },
  { key: 'contact', path: '/contact', label: 'Contact', title: 'Contact us', description: 'Contact our team for help with products and orders.' },
  { key: 'login', path: '/login', label: 'Login', title: 'Sign in', private: true },
  { key: 'signup', path: '/signup', label: 'Signup', title: 'Create an account', private: true },
  { key: 'forgotPassword', path: '/forgot-password', label: 'Forgot password', title: 'Reset your password', private: true },
  { key: 'wishlist', path: '/wishlist', label: 'Wishlist', title: 'My wishlist', private: true },
  { key: 'cart', path: '/cart', label: 'Cart', title: 'Shopping bag', private: true },
  { key: 'checkout', path: '/checkout', label: 'Checkout', title: 'Checkout', private: true },
  { key: 'orders', path: '/orders', label: 'Orders and order details', title: 'My orders', private: true },
  { key: 'profile', path: '/profile', label: 'Account', title: 'My account', private: true },
  { key: 'admin', path: '/admin', label: 'Admin pages', title: 'Admin studio', private: true },
]
export const RESOURCE_PATHS = { products: '/product/', categories: '/category/', collections: '/collections/', pages: '/pages/', blogs: '/blog/' }
export const plainText = (value, max = 320) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
export const normalizePath = path => String(path || '/').replace(/\/+$/, '') || '/'
export const fixedPage = path => STATIC_PAGES.find(page => page.path === normalizePath(path)) || (/^\/orders\/[^/]+$/.test(path) ? STATIC_PAGES.find(p => p.key === 'orders') : /^\/admin(?:\/|$)/.test(path) ? STATIC_PAGES.find(p => p.key === 'admin') : null)
export function safeUrl(value, origin) {
  if (!value || /[\u0000-\u0020\\]/.test(value)) return ''
  try { const url = new URL(value, origin); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' }
}
export function siteOrigin(settings = {}, fallback = 'http://localhost:5173') {
  const url = safeUrl(settings.seoSettings?.siteUrl) || safeUrl(fallback)
  return url ? new URL(url).origin : 'http://localhost:5173'
}
export function buildMetadata({ path = '/', search = '', kind, record, settings = {}, origin: fallback, status = 200 } = {}) {
  path = normalizePath(path)
  const origin = siteOrigin(settings, fallback), fixed = fixedPage(path)
  const privatePage = Boolean(fixed?.private || path.startsWith('/__dev/'))
  const seo = (kind ? record?.seo : settings.seoPages?.[fixed?.key]) || {}
  const brand = settings.brandName || 'AURELIA', missing = status === 404
  const params = new URLSearchParams(search)
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1)
  const paginated = (path === '/shop' || path === '/blog' || kind === 'categories') && page > 1
  const filtered = path === '/shop' && ['search', 'category', 'sort', 'minPrice', 'maxPrice'].some(key => params.has(key) && params.get(key))
  const baseTitle = missing ? 'Page not found' : record?.name || record?.title || fixed?.title || brand
  const title = `${plainText(seo.title, 160) || `${baseTitle} | ${brand}`}${paginated ? ` — Page ${page}` : ''}`
  const description = plainText(seo.description || record?.shortDescription || record?.excerpt || record?.description || record?.content || fixed?.description || settings.seoSettings?.defaultDescription || `Discover ${brand}.`)
  // Pagination is a separate page. Do not canonicalize page 2 to page 1.
  let canonical = safeUrl(seo.canonical, origin) || new URL(path, origin).href
  const canonicalUrl = new URL(canonical); canonicalUrl.hash = ''
  if (paginated) canonicalUrl.searchParams.set('page', String(page))
  if (filtered) for (const key of ['search', 'category', 'sort', 'minPrice', 'maxPrice']) if (params.get(key)) canonicalUrl.searchParams.set(key, params.get(key))
  canonical = canonicalUrl.href
  const noindex = privatePage || missing || status >= 500 || filtered || Boolean(seo.noindex)
  const image = safeUrl(seo.socialImage || record?.thumbnail || record?.image || settings.seoSettings?.defaultImage, origin)
  const imageAlt = plainText(seo.socialImageAlt || seo.imageAlt || record?.name || record?.title || settings.seoSettings?.defaultImageAlt || brand, 300)
  const metadata = { path, search, title, description, canonical, robots: noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large', siteName: brand, ogType: kind === 'blogs' ? 'article' : 'website', socialTitle: plainText(seo.socialTitle, 160) || title, socialDescription: plainText(seo.socialDescription) || description, image, imageAlt, twitterTitle: plainText(seo.twitterTitle, 160) || plainText(seo.socialTitle, 160) || title, twitterDescription: plainText(seo.twitterDescription) || plainText(seo.socialDescription) || description, twitterImage: safeUrl(seo.twitterImage, origin) || image, structuredData: [], status }
  if (noindex) return metadata
  if (path === '/') metadata.structuredData.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: brand, url: origin + '/' })
  if (record && kind === 'products') {
    const product = { '@context': 'https://schema.org', '@type': 'Product', name: record.name, description: plainText(record.description || description, 10000), url: canonical, brand: { '@type': 'Brand', name: record.brand || brand } }
    const images = [...new Set([record.thumbnail, ...(record.images || [])].map(src => safeUrl(src, origin)).filter(Boolean))]
    if (images.length) product.image = images
    if (record.sku) product.sku = record.sku
    if (record.variantId && Number.isInteger(record.price) && record.price >= 0) product.offers = { '@type': 'Offer', url: canonical, priceCurrency: 'INR', price: (record.price / 100).toFixed(2), availability: record.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition' }
    if (record.numReviews > 0 && record.rating > 0 && record.rating <= 5) product.aggregateRating = { '@type': 'AggregateRating', ratingValue: record.rating, reviewCount: record.numReviews }
    metadata.structuredData.push(product)
  }
  if (record && kind === 'blogs') {
    const article = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: record.title, description, mainEntityOfPage: canonical }
    const articleImage = safeUrl(record.image, origin)
    if (articleImage) article.image = articleImage
    if (record.publishedAt) article.datePublished = new Date(record.publishedAt).toISOString()
    if (record.updatedAt) article.dateModified = new Date(record.updatedAt).toISOString()
    metadata.structuredData.push(article)
  }
  if (kind && record) metadata.structuredData.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: origin + '/' }, { '@type': 'ListItem', position: 2, name: record.name || record.title, item: canonical }] })
  return metadata
}
export const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
export const xmlEscape = value => String(value ?? '').replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char])
export function headTags(metadata) {
  const tag = (attr, key, value) => value ? `<meta data-aurelia-seo="server" ${attr}="${key}" content="${xmlEscape(value)}"/>` : ''
  return `<title data-aurelia-seo="server">${xmlEscape(metadata.title)}</title>` + tag('name', 'description', metadata.description) + tag('name', 'robots', metadata.robots) + `<link data-aurelia-seo="server" rel="canonical" href="${xmlEscape(metadata.canonical)}"/>` + [['og:title', metadata.socialTitle], ['og:description', metadata.socialDescription], ['og:type', metadata.ogType], ['og:url', metadata.canonical], ['og:site_name', metadata.siteName], ['og:image', metadata.image], ['og:image:alt', metadata.image && metadata.imageAlt]].map(([key, value]) => tag('property', key, value)).join('') + [['twitter:card', metadata.twitterImage ? 'summary_large_image' : 'summary'], ['twitter:title', metadata.twitterTitle], ['twitter:description', metadata.twitterDescription], ['twitter:image', metadata.twitterImage], ['twitter:image:alt', metadata.twitterImage && metadata.imageAlt]].map(([key, value]) => tag('name', key, value)).join('') + (metadata.structuredData.length ? `<script data-aurelia-seo="server" type="application/ld+json">${jsonForHtml(metadata.structuredData)}</script>` : '')
}
export function injectHead(html, metadata) {
  // Only SEO head elements are replaced. The React root, scripts, CSS and body stay intact.
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, head => head.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '').replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '').replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '').replace(/<script\b[^>]*id=["']aurelia-seo-state["'][^>]*>[\s\S]*?<\/script>/gi, '').replace('</head>', `${headTags(metadata)}<script id="aurelia-seo-state" type="application/json">${jsonForHtml(metadata)}</script></head>`))
}
