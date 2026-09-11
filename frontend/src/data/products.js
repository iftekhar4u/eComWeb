const image = (id, width = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`

export const categoryDetails = {
  'skin-care': { label: 'Skin Care', description: 'Thoughtful essentials for a calm, healthy-looking complexion.', image: image('photo-1556228578-8c89e6adf883', 500) },
  makeup: { label: 'Makeup', description: 'Easy, expressive colour for the rituals you already have.', image: image('photo-1522335789203-aabd1fc54bc9', 500) },
  'hair-care': { label: 'Hair Care', description: 'Botanical nourishment for softer, stronger-looking hair.', image: image('photo-1527799820374-dcf8b5d7de8a', 500) },
  'body-care': { label: 'Body Care', description: 'Daily care that leaves your skin comfortable and cared for.', image: image('photo-1608248543803-ba4f8c70ae0b', 500) },
  men: { label: 'Men', description: 'Straightforward grooming essentials, made for everyday use.', image: image('photo-1585232351009-aa87416fca90', 500) },
  women: { label: 'Women', description: 'A considered edit of beauty essentials for every kind of ritual.', image: image('photo-1611930022073-b7a4ba5fcccd', 500) },
  'baby-care': { label: 'Baby Care', description: 'Gentle, comforting care for the smallest daily moments.', image: image('photo-1596462502278-27bfdc403348', 500) },
}

export const categoryOrder = ['skin-care', 'makeup', 'hair-care', 'body-care', 'men', 'women', 'baby-care']

export const products = [
  { id: 1, slug: 'vitamin-c-radiance-serum', name: 'Vitamin C Radiance Serum', category: 'skin-care', gender: 'women', price: 899, oldPrice: 1199, description: 'A brightening botanical serum for a fresh, even-looking glow.', highlights: ['Vitamin C for radiance', 'Lightweight daily texture', 'Suitable for everyday rituals'], rating: 4.9, numReviews: 126, thumbnail: image('photo-1620916566398-39f1143ab7be'), images: [image('photo-1620916566398-39f1143ab7be'), image('photo-1556228578-8c89e6adf883')], tag: 'Bestseller', stock: true },
  { id: 2, slug: 'hydrating-face-wash', name: 'Hydrating Face Wash', category: 'skin-care', gender: 'women', price: 499, oldPrice: 650, description: 'A gentle cleanser that leaves skin feeling clean, soft and comfortable.', highlights: ['Non-stripping cleanse', 'Botanical extracts', 'For morning and evening'], rating: 4.8, numReviews: 94, thumbnail: image('photo-1556228578-8c89e6adf883'), images: [image('photo-1556228578-8c89e6adf883')], tag: 'Bestseller', stock: true },
  { id: 3, slug: 'daily-glow-moisturizer', name: 'Daily Glow Moisturizer', category: 'skin-care', gender: 'women', price: 649, oldPrice: 799, description: 'A light, nourishing moisturizer for naturally radiant-looking skin.', highlights: ['Comfortable daily hydration', 'Soft glow finish', 'Layers well under makeup'], rating: 4.8, numReviews: 81, thumbnail: image('photo-1611930021554-8f7f9f9a2f0f'), images: [image('photo-1611930021554-8f7f9f9a2f0f')], tag: 'Bestseller', stock: true },
  { id: 4, slug: 'matte-finish-sunscreen', name: 'Matte Finish Sunscreen', category: 'skin-care', gender: 'women', price: 749, oldPrice: 999, description: 'Comfortable daily SPF with a smooth, shine-conscious finish.', highlights: ['SPF 50 protection', 'Lightweight finish', 'Made for daily wear'], rating: 4.7, numReviews: 72, thumbnail: image('photo-1556228720-195a672e8a03'), images: [image('photo-1556228720-195a672e8a03')], tag: 'Bestseller', stock: true },
  { id: 5, slug: 'herbal-hair-serum', name: 'Herbal Hair Serum', category: 'hair-care', gender: 'women', price: 579, oldPrice: 699, description: 'A silky botanical serum for smoother, more manageable hair.', highlights: ['Lightweight botanical oils', 'Smooths dry ends', 'No heavy residue'], rating: 4.8, numReviews: 73, thumbnail: image('photo-1608571423902-eed4a5ad8108'), images: [image('photo-1608571423902-eed4a5ad8108')], tag: 'Ritual pick', stock: true },
  { id: 6, slug: 'rose-body-lotion', name: 'Rose Body Lotion', category: 'body-care', gender: 'women', price: 549, oldPrice: 699, description: 'A softening body lotion with a delicate rose finish.', highlights: ['Everyday moisture', 'Silky, quick-absorbing feel', 'Subtle rose scent'], rating: 4.7, numReviews: 61, thumbnail: image('photo-1608248543803-ba4f8c70ae0b'), images: [image('photo-1608248543803-ba4f8c70ae0b')], tag: 'New arrival', stock: true },
  { id: 7, slug: 'nourishing-lip-balm', name: 'Nourishing Lip Balm', category: 'makeup', gender: 'women', price: 299, oldPrice: 399, description: 'A sheer, nourishing balm that brings comfort and a hint of colour.', highlights: ['Soft tint', 'Nourishing oils', 'Easy everyday finish'], rating: 4.8, numReviews: 48, thumbnail: image('photo-1522335789203-aabd1fc54bc9'), images: [image('photo-1522335789203-aabd1fc54bc9')], tag: 'New arrival', stock: true },
  { id: 8, slug: 'radiance-facial-kit', name: 'Radiance Facial Kit', category: 'women', gender: 'women', price: 1199, oldPrice: 1599, description: 'A complete glow ritual bringing together gentle, luminous essentials.', highlights: ['A complete beauty ritual', 'Thoughtful botanical formulas', 'Ideal for gifting'], rating: 4.9, numReviews: 38, thumbnail: image('photo-1611930022073-b7a4ba5fcccd'), images: [image('photo-1611930022073-b7a4ba5fcccd'), image('photo-1620916566398-39f1143ab7be')], tag: 'New arrival', stock: true },
  { id: 9, slug: 'cedar-grove-face-cleanser', name: 'Cedar Grove Face Cleanser', category: 'men', gender: 'men', price: 599, oldPrice: 749, description: 'A fresh, uncomplicated cleanser for a clear-feeling daily routine.', highlights: ['Fresh daily cleanse', 'Gentle botanical blend', 'For morning and evening'], rating: 4.7, numReviews: 29, thumbnail: image('photo-1585232351009-aa87416fca90'), images: [image('photo-1585232351009-aa87416fca90')], tag: 'New arrival', stock: true },
  { id: 10, slug: 'little-cloud-baby-lotion', name: 'Little Cloud Baby Lotion', category: 'baby-care', gender: 'unisex', price: 449, oldPrice: 549, description: 'A gentle lotion for soft, comforted skin and quiet daily moments.', highlights: ['Gentle everyday care', 'Soft, comforting texture', 'Made for delicate skin'], rating: 4.9, numReviews: 22, thumbnail: image('photo-1596462502278-27bfdc403348'), images: [image('photo-1596462502278-27bfdc403348')], tag: 'New arrival', stock: true },
]

export function normaliseCategory(value = '') {
  return value.toLowerCase().trim().replace(/\s+/g, '-').replace(/_/g, '-')
}

export function getProduct(value) {
  return products.find((product) => String(product.id) === String(value) || product.slug === value)
}