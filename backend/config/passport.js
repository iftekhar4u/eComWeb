import { safeEmailEvent } from '../email/events.js'
import crypto from 'node:crypto'
import argon2 from 'argon2'
import { OAuth2Client } from 'google-auth-library'
import LocalStrategy from 'passport-local'
import GoogleStrategy from 'passport-google-oidc'
import User from '../models/User.js'

const Local = LocalStrategy.Strategy
const GOOGLE_ISSUER = 'https://accounts.google.com'
const GOOGLE_STATE_MAX_AGE_MS = 10 * 60 * 1000

function genericFailure(done) {
  return done(null, false, { message: 'Invalid email or password' })
}

function verifiedGoogleClaims(idToken) {
  try {
    const encodedPayload = idToken.split('.')[1]
    if (!encodedPayload) return null
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

async function findOrCreateGoogleUser(issuer, profile, idToken, googleClient, clientId, done) {
  const claims = verifiedGoogleClaims(idToken)
  let verifiedClaims
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: clientId })
    verifiedClaims = ticket.getPayload()
  } catch {
    return done(null, false, { message: 'Google account verification was not completed' })
  }
  if (!claims || !verifiedClaims || verifiedClaims.iss !== GOOGLE_ISSUER || verifiedClaims.sub !== profile.id || verifiedClaims.email_verified !== true) return done(null, false, { message: 'Google account verification was not completed' })
  const email = profile.emails?.[0]?.value?.toLowerCase()
  if (!email || !profile.id) return done(null, false, { message: 'Google account did not provide a verified email' })

  const existingIdentity = await User.findOne({ 'google.issuer': issuer, 'google.subject': profile.id })
  if (existingIdentity) return done(null, existingIdentity)

  const emailOwner = await User.findOne({ email })
  if (emailOwner) return done(null, false, { code: 'GOOGLE_EMAIL_COLLISION', message: 'Sign in with your existing account before linking Google', google: { issuer, subject: profile.id, email } })

  try {
    const user = await User.create({
      name: profile.displayName || profile.name?.givenName || 'Aurelia customer',
      email,
      google: { issuer, subject: profile.id, linkedAt: new Date() },
      emailVerifiedAt: new Date(),
      role: 'customer',
      status: 'active',
    })
    await safeEmailEvent('welcome', { userId: user._id, email: user.email, name: user.name })
    return done(null, user)
  } catch (error) {
    if (error?.code === 11000) {
      const concurrentUser = await User.findOne({ 'google.issuer': issuer, 'google.subject': profile.id })
      if (concurrentUser) return done(null, concurrentUser)
    }
    return done(error)
  }
}

export function configurePassport(passport, config) {
  passport.use('local', new Local({ usernameField: 'email', passwordField: 'password', passReqToCallback: true }, async (_req, email, password, done) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
      if (!user || user.status !== 'active' || !user.password || !(await argon2.verify(user.password, password))) return genericFailure(done)
      return done(null, user)
    } catch (error) { return done(error) }
  }))

  if (config.GOOGLE_AUTH_ENABLED) {
    const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID)
    passport.use('google', new GoogleStrategy({
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile'],
      nonce: true,
      passReqToCallback: true,
    }, async (req, issuer, _uiProfile, idProfile, _context, idToken, _accessToken, _refreshToken, _params, done) => {
      try {
        const issuedAt = Number(req.session.googleAuth?.issuedAt || 0)
        if (!issuedAt || Date.now() - issuedAt > GOOGLE_STATE_MAX_AGE_MS) return done(null, false, { code: 'GOOGLE_STATE_EXPIRED', message: 'Google sign-in expired. Please try again.' })
        return findOrCreateGoogleUser(issuer, idProfile, idToken, googleClient, config.GOOGLE_CLIENT_ID, done)
      } catch (error) { return done(error) }
    }))
  }

  passport.serializeUser((user, done) => done(null, { id: user._id.toString(), sessionVersion: user.sessionVersion }))
  passport.deserializeUser(async (serialized, done) => {
    try {
      const user = await User.findById(serialized.id)
      if (!user || user.status !== 'active' || user.sessionVersion !== serialized.sessionVersion) return done(null, false)
      done(null, user)
    } catch (error) { done(error) }
  })
}

export function createGoogleState() {
  return { issuedAt: Date.now(), requestId: crypto.randomBytes(16).toString('hex') }
}

export { GOOGLE_STATE_MAX_AGE_MS }
