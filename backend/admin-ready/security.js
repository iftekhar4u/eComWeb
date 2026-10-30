import crypto from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import argon2 from 'argon2'
import { generateSecret, generateURI, verify } from 'otplib'
import { z } from 'zod'
import User from '../models/User.js'
import { protectPendingAdmin, requireAdmin, safeUser } from '../middleware/authMiddleware.js'

export function encryptionKey() {
  return crypto.createHash('sha256').update(process.env.MFA_ENCRYPTION_KEY || 'test-mfa-encryption-key-test-mfa-key').digest()
}
export function encrypt(secret) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}
export function decrypt(value) {
  const parts = String(value || '').split('.')
  if (parts.length !== 3) throw Object.assign(new Error('Authenticator enrollment is missing. Set it up first.'), { status: 409 })
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[0], 'base64'))
    decipher.setAuthTag(Buffer.from(parts[1], 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw Object.assign(new Error('The authenticator encryption key does not match. Restore your original MFA_ENCRYPTION_KEY or use a saved recovery code.'), { status: 409 })
  }
}
async function complete(req, res, user) {
  const passportSession = req.session.passport
  await new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()))
  req.session.userId = String(user._id)
  req.session.sessionVersion = user.sessionVersion
  req.session.passport = passportSession
  req.session.mfaVerified = true
  req.session.reauthenticatedAt = Date.now()
  req.session.csrfToken = crypto.randomBytes(32).toString('hex')
  await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()))
  res.json({ user: safeUser(user), mfaRequired: false, csrfToken: req.session.csrfToken })
}
const router = Router()
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many verification attempts. Try again in 15 minutes.' } }))
router.use(protectPendingAdmin)
function requireMfaEnabled(req, res, next) {
  if (req.app.locals.config?.ADMIN_MFA_ENABLED !== true) return res.status(503).json({ message: 'Administrator authenticator is currently disabled.' })
  next()
}
router.post('/setup', requireMfaEnabled, async (req, res) => {
  if (req.user.mfa?.enabled) return res.status(409).json({ message: 'Authenticator already enrolled. Enter a code or use a recovery code.' })
  let pending = req.session.adminReadyEnrollment
  if (!pending || pending.expiresAt < Date.now()) {
    const secret = generateSecret(), recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(6).toString('hex'))
    pending = { secretEncrypted: encrypt(secret), recoveryCodes, expiresAt: Date.now() + 10 * 60 * 1000 }
    const hashes = await Promise.all(recoveryCodes.map(code => argon2.hash(code, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })))
    // Update only the MFA fields. Saving a hydrated legacy User fails its immutable role validation.
    const result = await User.updateOne({ _id: req.user._id, role: 'admin', 'mfa.enabled': { $ne: true }, sessionVersion: req.user.sessionVersion }, { $set: { 'mfa.secretEncrypted': pending.secretEncrypted, 'mfa.recoveryCodeHashes': hashes } }, { runValidators: true })
    if (!result.matchedCount) return res.status(409).json({ message: 'Account changed. Sign in again.' })
    req.session.adminReadyEnrollment = pending
  }
  const secret = decrypt(pending.secretEncrypted)
  res.set('Cache-Control', 'no-store').json({ secret, recoveryCodes: pending.recoveryCodes, otpauthUrl: generateURI({ issuer: 'AURELIA', label: req.user.email, secret }) })
})
router.post('/verify', requireMfaEnabled, async (req, res) => {
  const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator.') }).strict().parse(req.body)
  if (!req.user.mfa?.secretEncrypted) return res.status(409).json({ message: 'Set up your authenticator first.' })
  if (!req.user.mfa.enabled && (!req.session.adminReadyEnrollment || req.session.adminReadyEnrollment.expiresAt < Date.now())) return res.status(409).json({ message: 'Setup expired. Start authenticator setup again.' })
  const valid = await verify({ token: code, secret: decrypt(req.user.mfa.secretEncrypted), epochTolerance: 30 })
  if (!valid.valid) return res.status(401).json({ message: 'Incorrect code. Check that your phone time is automatic and try the current code.' })
  const result = await User.updateOne({ _id: req.user._id, role: 'admin', sessionVersion: req.user.sessionVersion, 'mfa.secretEncrypted': req.user.mfa.secretEncrypted }, { $set: { 'mfa.enabled': true } }, { runValidators: true })
  if (!result.matchedCount) return res.status(409).json({ message: 'Account changed. Sign in again.' })
  req.user.mfa.enabled = true
  await complete(req, res, req.user)
})
router.post('/recover', requireMfaEnabled, async (req, res) => {
  const { code } = z.object({ code: z.string().trim().toLowerCase().regex(/^[a-f0-9]{12}$/, 'Enter a saved 12-character recovery code.') }).strict().parse(req.body)
  if (!req.user.mfa?.enabled) return res.status(409).json({ message: 'Complete authenticator enrollment first.' })
  for (const hash of req.user.mfa.recoveryCodeHashes || []) {
    if (!await argon2.verify(hash, code)) continue
    const result = await User.updateOne({ _id: req.user._id, role: 'admin', sessionVersion: req.user.sessionVersion, 'mfa.recoveryCodeHashes': hash }, { $pull: { 'mfa.recoveryCodeHashes': hash } }, { runValidators: true })
    if (!result.modifiedCount) break
    return complete(req, res, req.user)
  }
  res.status(401).json({ message: 'Invalid or already-used recovery code.' })
})
router.post('/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).strict().parse(req.body)
  if (currentPassword === newPassword) return res.status(400).json({ message: 'Choose a different new password.' })
  const user = await User.findById(req.user._id).select('+password')
  if (!user.password) return res.status(409).json({ message: 'This account uses Google sign-in. Manage that password through Google.' })
  if (!await argon2.verify(user.password, currentPassword)) return res.status(401).json({ message: 'Current password is incorrect.' })
  const password = await argon2.hash(newPassword, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
  const result = await User.updateOne({ _id: user._id, role: 'admin', sessionVersion: user.sessionVersion }, { $set: { password }, $inc: { sessionVersion: 1 } }, { runValidators: true })
  if (!result.matchedCount) return res.status(409).json({ message: 'Account changed. Sign in again.' })
  await new Promise((resolve, reject) => req.session.destroy(e => e ? reject(e) : resolve()))
  res.clearCookie('aurelia.sid').json({ message: 'Password changed. All sessions have been invalidated. Sign in with your new password.' })
})
export default router
