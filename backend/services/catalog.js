import Product from '../models/Product.js'
import { ProductVariant } from '../models/domainModels.js'
export const publicFields = 'name slug description shortDescription brand category gender price discountPrice images thumbnail stock rating numReviews ingredients benefits howToUse skinType concerns size featured bestSeller newArrival tags seo sku'
export async function publicProducts(products) {
  if (!products.length) return []
  const variants = await ProductVariant.find({ product: { $in: products.map(p => p._id) }, active: true }).sort({ createdAt: 1 }).lean()
  const byProduct = new Map()
  for (const variant of variants) {
    const id = String(variant.product)
    if (!byProduct.has(id)) byProduct.set(id, [])
    byProduct.get(id).push(variant)
  }
  return products.map(p => {
    const choices = byProduct.get(String(p._id)) || []
    const first = choices[0]
    return { ...p, id: String(p._id), variantId: first ? String(first._id) : null,
      price: first?.price ?? p.discountPrice ?? p.price, compareAtPrice: first?.compareAtPrice ?? (p.discountPrice !== undefined ? p.price : undefined),
      stock: first ? first.stockOnHand - first.reservedQuantity : 0,
      variants: choices.map(v => ({ id: String(v._id), sku: v.sku, size: v.size, shade: v.shade, price: v.price, stock: v.stockOnHand - v.reservedQuantity })) }
  })
}
export async function findPublicProducts(ids) {
  return publicProducts(await Product.find({ _id: { $in: ids }, status: 'published' }).select(publicFields).lean())
}
