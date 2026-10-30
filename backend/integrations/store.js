import crypto from 'node:crypto'
import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const integrationError = (status, message) => Object.assign(new Error(message), { status })
const defaultDirectory = fileURLToPath(new URL('../.private/', import.meta.url))
export function defaultSettings() {
  return {
    revision: 0,
    whatsapp: { enabled: false, phone: '', message: 'Hi AURELIA, I have a question.', label: 'Chat on WhatsApp', includePage: false },
    cloudinary: { enabled: false, cloudName: '', apiKey: '', apiSecret: '', folder: 'aurelia' },
    mongodb: { uri: '', activeUri: '' },
    history: [],
  }
}

// This vault deliberately lives outside MongoDB: it must be readable before connecting.
// Mount its directory on persistent storage when deploying. Never serve it as static files.
export function createIntegrationStore(config = {}) {
  const directory = path.resolve(config.INTEGRATIONS_DIRECTORY || defaultDirectory)
  const file = path.join(directory, 'integrations.enc')
  function key() {
    if (!config.MFA_ENCRYPTION_KEY || config.MFA_ENCRYPTION_KEY.length < 32) {
      throw integrationError(503, 'A stable MFA_ENCRYPTION_KEY of at least 32 characters is required to save integrations.')
    }
    return crypto.createHmac('sha256', config.MFA_ENCRYPTION_KEY).update('aurelia-integrations-v1').digest()
  }
  async function read() {
    let raw
    try { raw = await readFile(file, 'utf8') } catch (error) {
      if (error.code === 'ENOENT') return defaultSettings()
      throw integrationError(503, 'Integration settings could not be read. Check the private directory permissions.')
    }
    try {
      const envelope = JSON.parse(raw)
      if (envelope.version !== 1) throw new Error('version')
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(envelope.iv, 'base64'))
      decipher.setAAD(Buffer.from('aurelia-integrations-v1'))
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
      const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'))
      if (!Number.isSafeInteger(value.revision) || !value.whatsapp || !value.cloudinary || !value.mongodb || !Array.isArray(value.history)) throw new Error('format')
      return value
    } catch {
      throw integrationError(503, 'Integration settings cannot be decrypted. Restore the original MFA_ENCRYPTION_KEY and private settings file; do not overwrite them.')
    }
  }
  async function update(expectedRevision, actor, action, change) {
    // A file lock also prevents lost updates across processes sharing one local volume.
    await mkdir(directory, { recursive: true, mode: 0o700 })
    let lock
    try { lock = await open(`${file}.lock`, 'wx', 0o600) } catch {
      throw integrationError(409, 'Integration settings are busy or the directory is not writable. Retry; see the README if this persists.')
    }
    const temporary = `${file}.${crypto.randomUUID()}.tmp`
    try {
      const current = await read()
      if (expectedRevision !== current.revision) throw integrationError(409, 'Integration settings changed. Reload the settings page before saving.')
      const next = await change(structuredClone(current))
      next.revision = current.revision + 1
      next.history = [...current.history, { at: new Date().toISOString(), actor: String(actor), action }].slice(-30)
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
      cipher.setAAD(Buffer.from('aurelia-integrations-v1'))
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()])
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }))
        await handle.sync()
      } finally { await handle.close() }
      await rename(temporary, file)
      return next
    } catch (error) {
      if (error.status) throw error
      throw integrationError(503, 'Integration settings could not be saved. Check the private directory and encryption key.')
    } finally {
      await unlink(temporary).catch(() => {})
      await lock.close()
      await unlink(`${file}.lock`).catch(() => {})
    }
  }
  return { read, update }
}

export function publicWhatsApp(settings) {
  const { enabled, phone, message, label, includePage } = settings.whatsapp
  return enabled && /^[1-9][0-9]{6,14}$/.test(phone)
    ? { enabled: true, phone, message, label, includePage }
    : { enabled: false }
}

export function resolveCloudinary(settings, runtimeConfig = {}) {
  const saved = settings.cloudinary || defaultSettings().cloudinary
  if (saved.apiKey || saved.apiSecret) return saved
  return {
    enabled: Boolean(runtimeConfig.CLOUDINARY_CLOUD_NAME && runtimeConfig.CLOUDINARY_API_KEY && runtimeConfig.CLOUDINARY_API_SECRET),
    cloudName: runtimeConfig.CLOUDINARY_CLOUD_NAME || saved.cloudName,
    apiKey: runtimeConfig.CLOUDINARY_API_KEY || '',
    apiSecret: runtimeConfig.CLOUDINARY_API_SECRET || '',
    folder: runtimeConfig.CLOUDINARY_FOLDER || saved.folder || 'aurelia',
  }
}

export function adminSettings(settings, runtimeConfig) {
  const desired = runtimeConfig.INTEGRATIONS_IGNORE_DATABASE ? runtimeConfig.BOOTSTRAP_MONGO_URI || runtimeConfig.MONGO_URI : settings.mongodb.activeUri || runtimeConfig.BOOTSTRAP_MONGO_URI || runtimeConfig.MONGO_URI
  const cloudinary = resolveCloudinary(settings, runtimeConfig)
  const cloudinarySource = settings.cloudinary.apiKey || settings.cloudinary.apiSecret
    ? 'admin'
    : runtimeConfig.CLOUDINARY_CLOUD_NAME && runtimeConfig.CLOUDINARY_API_KEY && runtimeConfig.CLOUDINARY_API_SECRET
      ? 'environment'
      : 'admin'
  return {
    revision: settings.revision,
    whatsapp: settings.whatsapp,
    cloudinary: { enabled: cloudinary.enabled, cloudName: cloudinary.cloudName, folder: cloudinary.folder, source: cloudinarySource, apiKeySaved: Boolean(cloudinary.apiKey), apiSecretSaved: Boolean(cloudinary.apiSecret) },
    mongodb: {
      uriSaved: Boolean(settings.mongodb.uri),
      atlasSelected: Boolean(settings.mongodb.activeUri),
      savedMatchesSelected: Boolean(settings.mongodb.uri) && settings.mongodb.uri === settings.mongodb.activeUri,
      runningOnAtlas: Boolean(runtimeConfig.INTEGRATIONS_ATLAS_ACTIVE),
      recoveryOverride: Boolean(runtimeConfig.INTEGRATIONS_IGNORE_DATABASE),
      restartRequired: desired !== runtimeConfig.MONGO_URI,
    },
    history: settings.history,
  }
}
