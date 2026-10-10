import crypto from 'node:crypto'
let config = null
export function configureEmailCrypto(value) { config = value }
function key() {
  const secret = config?.EMAIL_ENCRYPTION_KEY || config?.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('Email encryption needs EMAIL_ENCRYPTION_KEY or the existing SESSION_SECRET (at least 32 characters).')
  return crypto.createHash('sha256').update('aurelia-email-v1\0' + secret).digest()
}
export function seal(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), bytes].map(part => part.toString('base64url')).join('.')
}
export function unseal(value) {
  try {
    const [iv, tag, bytes] = String(value).split('.').map(part => Buffer.from(part, 'base64url'))
    const cipher = crypto.createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString('utf8'))
  } catch { throw new Error('Email encryption key does not match. Restore the original email encryption key or save the SMTP password again.') }
}
export const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex')
export const randomToken = () => crypto.randomBytes(32).toString('hex')
export function unsubscribeToken(subscriber) {
  const id = String(subscriber._id)
  return `${id}.${crypto.createHmac('sha256', key()).update('unsubscribe:' + id).digest('hex')}`
}
export function unsubscribeId(token) {
  if (!/^[a-f\d]{24}\.[a-f\d]{64}$/.test(token)) return null
  const [id, signature] = token.split('.'), expected = unsubscribeToken({ _id: id }).split('.')[1]
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null
}
