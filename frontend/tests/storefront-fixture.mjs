// Deterministic test data, never imported by the production app.
export const about = { title: 'About AURELIA', slug: 'about', status: 'published', content: 'Thoughtful beauty for everyday rituals.\n\nExplore our botanical skincare collection and find a routine that works for you.' }
export const products = Array.from({ length: 8 }, (_, i) => ({ _id: String(i + 1).padStart(24, '0'), variantId: String(i + 20).padStart(24, '0'), name: `Botanical cleanser ${i + 1}`, slug: `botanical-cleanser-${i + 1}`, category: 'skincare', price: 49900, stock: 10, rating: 4.8, numReviews: 12, image: '/favicon.svg', thumbnail: '/favicon.svg', images: ['/favicon.svg'], benefits: ['Everyday care'], bestSeller: true, newArrival: true }))
export const storefront = {
  settings: { brandName: 'AURELIA', announcement: 'Botanical beauty for your everyday ritual', freeShippingThresholdPaise: 99900, testimonials: [{ name: 'Fixture customer', rating: 5, text: 'A lovely addition to my everyday routine.' }] },
  categories: ['Skincare', 'Haircare', 'Bodycare'].map(name => ({ name, slug: name.toLowerCase(), image: '/favicon.svg' })),
  sections: [{ slot: 'hero', heading: 'Beauty, considered.', body: 'Thoughtful essentials for your everyday ritual.', eyebrow: 'AURELIA botanical beauty', image: '/fixture/hero.png', buttonText: 'Shop now', link: '/shop' }],
  collections: [], blogs: [{ slug: 'everyday-routine', title: 'A thoughtful everyday routine', excerpt: 'Simple steps for your daily skincare.', content: 'Build a routine that works for you.' }],
}
export function fixtureResponse(path, query = new URLSearchParams()) {
  if (path === '/api/auth/session') return { status: 401, data: { message: 'Authentication required' } }
  if (path === '/api/auth/google/status' || path === '/api/integrations/whatsapp') return { data: { enabled: false } }
  if (path === '/api/auth/csrf-token') return { data: { csrfToken: 'fixture-csrf-token' } }
  if (path === '/api/content/storefront') return { data: storefront }
  if (path === '/api/content/pages/about') return { data: about }
  if (path === '/api/content/blogs') return { data: { items: storefront.blogs, pages: 1, page: 1, total: 1 } }
  if (path === '/api/products') return { data: { products: products.slice(0, Number(query.get('limit') || 8)), total: 8, page: 1, pages: 1 } }
  if (path.startsWith('/api/seo/')) return { data: { title: 'AURELIA | Botanical beauty', description: 'Thoughtful botanical essentials for your everyday beauty ritual.', robots: 'index, follow', canonical: 'https://shop.example/', structuredData: [] } }
  if (path === '/api/cart' || path === '/api/wishlist') return { data: { items: [], version: 0 } }
  return { status: 404, data: { message: 'Fixture resource not found' } }
}
