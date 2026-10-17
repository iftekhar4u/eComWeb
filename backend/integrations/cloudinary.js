import crypto from 'node:crypto'
import { integrationError } from './store.js'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export function imageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}
function credentials(config) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config.cloudName) || !config.apiKey || !config.apiSecret) throw integrationError(400, 'Save your Cloudinary cloud name, API key, and API secret first.')
}
async function cloudRequest(url, options, fetcher) {
  try {
    const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error('provider error')
    return await response.json()
  } catch { throw integrationError(502, 'Cloudinary request failed. Check your saved credentials, account permissions, quota, and network, then retry.') }
}
export async function testCloudinary(config, fetcher = fetch) {
  credentials(config)
  const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')
  const result = await cloudRequest(`https://api.cloudinary.com/v1_1/${config.cloudName}/ping`, { headers: { Authorization: `Basic ${auth}` } }, fetcher)
  if (result.status !== 'ok') throw integrationError(502, 'Cloudinary did not confirm the connection.')
  return { connected: true }
}
export async function uploadImage(config, file, fetcher = fetch) {
  if (!config.enabled) throw integrationError(409, 'Enable Cloudinary in Admin Settings before uploading.')
  credentials(config)
  if (!file?.buffer?.length) throw integrationError(400, 'Choose one image to upload.')
  if (file.buffer.length > MAX_IMAGE_BYTES) throw integrationError(413, 'Images must be 5 MB or smaller.')
  const mime = imageType(file.buffer)
  if (!mime || mime !== file.mimetype) throw integrationError(400, 'Upload a valid JPEG, PNG, WebP, or GIF image. SVG and other file types are not supported.')
  const params = { folder: config.folder, public_id: crypto.randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)), overwrite: 'false' }
  const signed = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&')
  const signature = crypto.createHash('sha256').update(signed + config.apiSecret).digest('hex')
  const body = new FormData()
  for (const [key, value] of Object.entries(params)) body.set(key, value)
  body.set('api_key', config.apiKey)
  body.set('signature', signature)
  body.set('file', new Blob([file.buffer], { type: mime }), `image.${mime.split('/')[1]}`)
  const result = await cloudRequest(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, { method: 'POST', body }, fetcher)
  let url
  try { url = new URL(result.secure_url) } catch { throw integrationError(502, 'Cloudinary returned an invalid image URL.') }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(`/${config.cloudName}/image/upload/`)) throw integrationError(502, 'Cloudinary returned an unexpected image URL.')
  return { url: url.href, publicId: result.public_id, width: result.width, height: result.height }
}
