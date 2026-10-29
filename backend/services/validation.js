import { z } from 'zod'
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier')
export const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const imageUrl = z.string().max(2048).refine(value => value === '' || /^https:\/\/[^\s]+$/i.test(value), 'Use an HTTPS image URL')
export const internalLink = z.string().max(500).regex(/^\/(?!\/)[a-zA-Z0-9/?#=&%._-]*$/, 'Use a local website path')
export const addressInput = z.object({ name: z.string().trim().min(2).max(100), line1: z.string().trim().min(5).max(200), line2: z.string().trim().max(200).default(''), city: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), postalCode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a six-digit Indian PIN code'), country: z.literal('IN').default('IN'), phone: z.string().regex(/^(?:\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number') }).strict()
export const lineItemsInput = z.array(z.object({ variantId: objectId, quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(100).refine(items => new Set(items.map(i => i.variantId)).size === items.length, 'Duplicate items are not allowed')
export function fail(status, message) { return Object.assign(new Error(message), { status }) }
