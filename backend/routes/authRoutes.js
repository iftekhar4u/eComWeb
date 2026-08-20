import crypto from 'node:crypto'
import { Router } from 'express'
import argon2 from 'argon2'
import passport from 'passport'
import { generateSecret, generateURI, verify } from 'otplib'
import { z } from 'zod'
import User from '../models/User.js'
import { protect, protectPendingAdmin, safeUser } from '../middleware/authMiddleware.js'
import { issueCsrfToken } from '../middleware/csrfMiddleware.js'
import { createGoogleState, GOOGLE_STATE_MAX_AGE_MS } from '../config/passport.js'

const router = Router()
const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(128) }).strict()
const registration = credentials.extend({ name: z.string().trim().min(2).max(100) }).strict()
const mfaCode = z.object({ code: z.string().regex(/^\d{6}$/) }).strict()

function encryptionKey() {
	const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY || 'test-mfa-encryption-key-test-mfa-key', 'utf8')
	return crypto.createHash('sha256').update(key).digest()
}

function encryptSecret(secret) {
	const iv = crypto.randomBytes(12)
	const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
	const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
	return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

function decryptSecret(value) {
	const [iv, tag, encrypted] = value.split('.'); const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64'))
	return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
}

async function establishSession(req, user, { reauthenticated = false } = {}) {
	await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()))
	await new Promise((resolve, reject) => req.logIn(user, { session: true }, (error) => error ? reject(error) : resolve()))
	req.session.userId = user._id.toString()
	req.session.sessionVersion = user.sessionVersion
	req.session.mfaVerified = user.role !== 'admin'
	req.session.csrfToken = crypto.randomUUID()
	if (reauthenticated) req.session.reauthenticatedAt = Date.now()
}

router.get('/csrf-token', issueCsrfToken)
router.get('/google/status', (req, res) => res.json({ enabled: Boolean(req.app.locals.googleAuthEnabled) }))
router.post('/register', async (req, res, next) => {
	try {
		const input = registration.parse(req.body)
		const existing = await User.exists({ email: input.email.toLowerCase() })
		if (existing) return res.status(400).json({ message: 'Unable to create account with those details' })
		const user = await User.create({ name: input.name, email: input.email, password: await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) })
		await establishSession(req, user)
		res.status(201).json({ user: safeUser(user), csrfToken: req.session.csrfToken })
	} catch (error) { next(error) }
})
router.post('/login', (req, res, next) => passport.authenticate('local', async (error, user) => {
	if (error) return next(error)
	if (!user) return res.status(401).json({ message: 'Invalid email or password' })
	try {
		const pendingGoogleLink = req.session.pendingGoogleLink
		await establishSession(req, user, { reauthenticated: true })
		if (pendingGoogleLink) req.session.pendingGoogleLink = pendingGoogleLink
		res.json({ user: safeUser(user), mfaRequired: user.role === 'admin', csrfToken: req.session.csrfToken })
	} catch (sessionError) { next(sessionError) }
})(req, res, next))
router.post('/logout', (req, res, next) => req.session.destroy((error) => { if (error) return next(error); res.clearCookie('aurelia.sid'); res.json({ message: 'Signed out' }) }))
router.get('/me', protect, (req, res) => res.json({ user: safeUser(req.user) }))
router.post('/google/link', protect, async (req, res, next) => {
	try {
		const pending = req.session.pendingGoogleLink
		if (!pending || Date.now() - Number(req.session.reauthenticatedAt || 0) > 10 * 60 * 1000 || pending.expiresAt < Date.now()) return res.status(403).json({ message: 'Recent account reauthentication is required before linking Google' })
		if (pending.email !== req.user.email) return res.status(409).json({ message: 'The Google email does not match this account' })
		const linked = await User.findOneAndUpdate({ _id: req.user._id, 'google.subject': { $exists: false } }, { $set: { google: { issuer: pending.issuer, subject: pending.subject, linkedAt: new Date() } } }, { new: true, runValidators: true })
		if (!linked) return res.status(409).json({ message: 'A Google identity is already linked or the account changed' })
		delete req.session.pendingGoogleLink
		res.json({ user: safeUser(linked) })
	} catch (error) {
		if (error?.code === 11000) return res.status(409).json({ message: 'That Google identity is already linked' })
		next(error)
	}
})
router.get('/google', (req, res, next) => {
	if (!req.app.locals.googleAuthEnabled) return res.status(503).json({ message: 'Google sign-in is not configured' })
	const state = createGoogleState()
	req.session.googleAuth = state
	passport.authenticate('google', { scope: ['email', 'profile'], state })(req, res, next)
})
router.get('/google/callback', (req, res, next) => {
	if (!req.app.locals.googleAuthEnabled) return res.redirect('/login?error=google-unavailable')
	passport.authenticate('google', async (error, user, info) => {
		const issuedAt = Number(info?.state?.issuedAt || req.session.googleAuth?.issuedAt || 0)
		delete req.session.googleAuth
		if (error) return next(error)
		if (!issuedAt || Date.now() - issuedAt > GOOGLE_STATE_MAX_AGE_MS) return res.redirect('/login?error=google-expired')
		if (!user) {
			if (info?.code === 'GOOGLE_EMAIL_COLLISION' && info.google) req.session.pendingGoogleLink = { ...info.google, expiresAt: Date.now() + GOOGLE_STATE_MAX_AGE_MS }
			return res.redirect(`/login?error=${info?.code === 'GOOGLE_EMAIL_COLLISION' ? 'google-account-link-required' : 'google-unavailable'}`)
		}
		try {
			await establishSession(req, user)
			res.redirect(`${req.app.locals.clientUrl}/shop`)
		} catch (sessionError) { next(sessionError) }
	})(req, res, next)
})
router.post('/mfa/setup', protectPendingAdmin, async (req, res, next) => {
	try {
		const secret = generateSecret()
		const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(6).toString('hex'))
		req.user.mfa.secretEncrypted = encryptSecret(secret)
		req.user.mfa.recoveryCodeHashes = await Promise.all(recoveryCodes.map((code) => argon2.hash(code, { type: argon2.argon2id })))
		await req.user.save()
		res.json({ otpauthUrl: generateURI({ issuer: 'AURELIA', label: req.user.email, secret }), recoveryCodes })
	} catch (error) { next(error) }
})
router.post('/mfa/verify', protectPendingAdmin, async (req, res, next) => {
	try {
		const { code } = mfaCode.parse(req.body)
		if (!req.user.mfa.secretEncrypted || !(await verify({ token: code, secret: decryptSecret(req.user.mfa.secretEncrypted) }))) return res.status(401).json({ message: 'Invalid MFA code' })
		req.user.mfa.enabled = true
		await req.user.save()
		req.session.mfaVerified = true
		res.json({ user: safeUser(req.user) })
	} catch (error) { next(error) }
})
export default router
