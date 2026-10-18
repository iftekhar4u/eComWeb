import { Router } from 'express'
import { z } from 'zod'
import argon2 from 'argon2'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import User from '../models/User.js'
import { protect, requireAdmin } from '../middleware/authMiddleware.js'
import { adminSettings, publicWhatsApp, integrationError } from './store.js'
import { testAtlas, validateAtlasUri } from './atlas.js'
import { readDatabaseStatus } from './database-status.js'
import { testCloudinary, uploadImage, MAX_IMAGE_BYTES } from './cloudinary.js'

const revision = z.number().int().nonnegative()
const password = z.string().min(1).max(128)
const secret = z.string().trim().max(4096).default('')
const whatsappInput = z.object({ revision, enabled: z.boolean(), phone: z.string().trim().max(30).transform(s => s.replace(/[+\s()-]/g, '')), message: z.string().trim().max(1000), label: z.string().trim().min(1).max(80), includePage: z.boolean() }).strict().refine(v => (!v.enabled && !v.phone) || /^[1-9][0-9]{6,14}$/.test(v.phone), 'Use a WhatsApp number with country code (7–15 digits).')
const cloudInput = z.object({ revision, currentPassword: password, enabled: z.boolean(), cloudName: z.string().trim().regex(/^[a-zA-Z0-9_-]{0,100}$/), apiKey: secret, apiSecret: secret, folder: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/) }).strict()
const atlasInput = z.object({ revision, currentPassword: password, uri: secret }).strict()
const actionInput = z.object({ revision, currentPassword: password, confirmMigration: z.boolean().optional() }).strict()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 }, fileFilter: (_req, file, cb) => cb(['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype) ? null : integrationError(400, 'Upload a JPEG, PNG, WebP, or GIF image.'), true) }).single('image')

async function reauthenticate(req, currentPassword) {
  const account = await User.findById(req.user._id).select('+password +mfa.secretEncrypted')
  if (!account?.password || !await argon2.verify(account.password, currentPassword).catch(() => false)) throw integrationError(403, 'The current administrator password is incorrect.')
  return account
}
function checkRevision(settings, expected) {
  if (settings.revision !== expected) throw integrationError(409, 'Integration settings changed. Reload the settings page before saving.')
}

export function integrationRoutes({ store, config, cloudTest = testCloudinary, atlasTest = testAtlas, imageUpload = uploadImage, databaseStatus = readDatabaseStatus }) {
  const router = Router()
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.use(protect, requireAdmin)
  const sensitive = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many integration changes or password attempts. Wait 15 minutes and retry.' } })
  const uploads = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Upload limit reached. Wait before uploading more images.' } })
  const respond = (res, settings, message) => res.json({ settings: adminSettings(settings, config), message })

  router.get('/', async (_req, res) => res.json(adminSettings(await store.read(), config)))
  router.get('/mongodb/status', async (_req, res) => res.json(await databaseStatus(config)))
  router.put('/whatsapp', sensitive, async (req, res) => {
    const { revision: expected, ...whatsapp } = whatsappInput.parse(req.body)
    const value = await store.update(expected, req.user._id, 'whatsapp.save', current => ({ ...current, whatsapp }))
    respond(res, value, 'WhatsApp settings saved. Store visitors see them on their next page load.')
  })
  async function cloudCandidate(req) {
    const input = cloudInput.parse(req.body)
    await reauthenticate(req, input.currentPassword)
    const current = await store.read()
    checkRevision(current, input.revision)
    const cloudinary = { enabled: input.enabled, cloudName: input.cloudName, folder: input.folder, apiKey: input.apiKey || current.cloudinary.apiKey, apiSecret: input.apiSecret || current.cloudinary.apiSecret }
    return { input, cloudinary }
  }
  router.post('/cloudinary/test', sensitive, async (req, res) => {
    const { cloudinary } = await cloudCandidate(req)
    await cloudTest(cloudinary)
    res.json({ message: 'Cloudinary connection verified. Save to apply these credentials.' })
  })
  router.put('/cloudinary', sensitive, async (req, res) => {
    const { input, cloudinary } = await cloudCandidate(req)
    if (cloudinary.enabled) await cloudTest(cloudinary)
    const value = await store.update(input.revision, req.user._id, 'cloudinary.save', current => ({ ...current, cloudinary }))
    respond(res, value, 'Cloudinary settings saved. New uploads use these settings immediately.')
  })
  router.post('/cloudinary/upload', uploads, (req, res, next) => upload(req, res, error => {
    if (error instanceof multer.MulterError) return next(integrationError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or smaller.' : 'Choose exactly one image file.'))
    next(error)
  }), async (req, res) => {
    const settings = await store.read()
    res.status(201).json(await imageUpload(settings.cloudinary, req.file))
  })
  async function atlasCandidate(req) {
    const input = atlasInput.parse(req.body)
    await reauthenticate(req, input.currentPassword)
    const current = await store.read()
    checkRevision(current, input.revision)
    return { input, uri: validateAtlasUri(input.uri || current.mongodb.uri) }
  }
  router.post('/mongodb/test', sensitive, async (req, res) => {
    const { uri } = await atlasCandidate(req)
    await atlasTest(uri)
    res.json({ message: 'Atlas connection and transaction support verified. No data was copied or connection switched.' })
  })
  router.put('/mongodb', sensitive, async (req, res) => {
    const { input, uri } = await atlasCandidate(req)
    await atlasTest(uri)
    const value = await store.update(input.revision, req.user._id, 'mongodb.stage', current => ({ ...current, mongodb: { ...current.mongodb, uri } }))
    respond(res, value, 'Atlas credentials saved. Copy and verify your data before selecting Atlas for the next restart.')
  })
  router.post('/mongodb/activate', sensitive, async (req, res) => {
    const input = actionInput.parse(req.body)
    const account = await reauthenticate(req, input.currentPassword)
    const current = await store.read()
    checkRevision(current, input.revision)
    if (!input.confirmMigration) throw integrationError(400, 'Confirm that your data copy and backup are complete before selecting Atlas.')
    if (config.INTEGRATIONS_IGNORE_DATABASE) throw integrationError(409, 'Remove INTEGRATIONS_IGNORE_DATABASE and restart before selecting Atlas.')
    await atlasTest(current.mongodb.uri, account)
    const value = await store.update(input.revision, req.user._id, 'mongodb.select-atlas', state => ({ ...state, mongodb: { ...state.mongodb, activeUri: state.mongodb.uri } }))
    respond(res, value, 'Atlas selected for the next backend restart. Keep the store closed until the final data copy is verified, then restart and sign in again.')
  })
  router.post('/mongodb/use-environment', sensitive, async (req, res) => {
    const input = actionInput.parse(req.body)
    await reauthenticate(req, input.currentPassword)
    const value = await store.update(input.revision, req.user._id, 'mongodb.select-environment', current => ({ ...current, mongodb: { ...current.mongodb, activeUri: '' } }))
    respond(res, value, 'The backend .env database is selected for the next restart. Reconcile any writes made to Atlas before switching back.')
  })
  return router
}

export function publicIntegrationRoutes(store) {
  const router = Router()
  router.get('/whatsapp', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(publicWhatsApp(await store.read()))
  })
  return router
}
