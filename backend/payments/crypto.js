import crypto from 'node:crypto'
import { fail } from '../services/validation.js'
function key(config) {
  if (!config.PAYMENT_ENCRYPTION_KEY || config.PAYMENT_ENCRYPTION_KEY.length < 32) throw fail(503, 'Set a stable PAYMENT_ENCRYPTION_KEY on the server before saving payment credentials.')
  return crypto.hkdfSync('sha256', config.PAYMENT_ENCRYPTION_KEY, 'aurelia-payments-v1', 'credential-encryption', 32)
}
export function encryptSecret(value, config, context) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(config), iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}
export function decryptSecret(value, config, context) {
  try {
    const [version, iv, tag, data, extra] = value.split('.')
    if (version !== 'v1' || extra || !data) throw new Error('format')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(config), Buffer.from(iv, 'base64'))
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch { throw fail(503, 'Payment credentials could not be decrypted. Restore the correct encryption key; stored credentials were preserved.') }
}
