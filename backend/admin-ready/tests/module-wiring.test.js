import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import argon2 from 'argon2'
import { createReadyApp } from '../app.js'
import { getConfig } from '../../config/env.js'
import { createIntegrationStore } from '../../integrations/store.js'
import { SiteSettings } from '../../models/domainModels.js'
import { fixture, config as emailConfig, User } from '../../email/tests/fixture.js'

// Exercise the real assembled app: router-only tests cannot catch missing mounts.
// All persistence is isolated and no SMTP worker or external provider is started.
const db = fixture()
const directory = await mkdtemp(path.join(tmpdir(), 'aurelia-wiring-'))
const config = {
  ...emailConfig,
  NODE_ENV: 'development',
  EMAIL_ENABLED: false,
  MFA_ENCRYPTION_KEY: 'isolated-wiring-key-at-least-32-characters',
  INTEGRATIONS_DIRECTORY: directory,
}
const settingsRead = SiteSettings.findOne
SiteSettings.findOne = () => ({ select: () => ({ lean: async () => ({
  key: 'site', brandName: 'AURELIA', __v: 0,
  seoPages: { home: { title: 'Home SEO from existing settings' } },
}) }) })
const app = createReadyApp({ config, integrations: createIntegrationStore(config) })
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
const visitor = request(server)
const admin = request.agent(server)
let csrf
test.before(async () => {
  const password = 'IsolatedAdminPassword!123'
  const user = await User.create({ name: 'Wiring Test', email: 'wiring@example.test', role: 'admin', password: await argon2.hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) })
  csrf = (await admin.get('/api/auth/csrf-token')).body.csrfToken
  const login = await admin.post('/api/auth/login').set('x-csrf-token', csrf).send({ email: user.email, password })
  assert.equal(login.status, 200)
  csrf = login.body.csrfToken
})

test('assembled app serves protected SEO/email settings and public metadata without 404s', async () => {
  for (const url of ['/api/admin/seo/settings', '/api/admin/email/settings']) {
    assert.equal((await visitor.get(url)).status, 401)
    const response = await admin.get(url)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    assert.ok(response.body.settings)
  }
  const seo = await visitor.get('/api/seo/resolve').query({ path: '/' })
  assert.equal(seo.status, 200)
  assert.equal(seo.body.title, 'Home SEO from existing settings')
  const email = await visitor.get('/api/email/status')
  assert.equal(email.status, 200)
  assert.deepEqual(email.body, { passwordReset: false, verification: false })
  assert.equal((await visitor.get('/robots.txt')).status, 200)
  assert.equal((await visitor.get('/sitemaps/fixed.xml')).status, 200)
})

test('same assembled app saves WhatsApp with country code and exposes only public fields', async () => {
  assert.deepEqual((await visitor.get('/api/integrations/whatsapp')).body, { enabled: false })
  const initial = await admin.get('/api/admin-ready/integrations')
  assert.equal(initial.status, 200)
  const input = { ...initial.body.whatsapp, revision: initial.body.revision, enabled: true, phone: '+91 98765 43210', message: 'Help & advice?', includePage: true }
  assert.equal((await admin.put('/api/admin-ready/integrations/whatsapp').send(input)).status, 403)
  const saved = await admin.put('/api/admin-ready/integrations/whatsapp').set('x-csrf-token', csrf).send(input)
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  const publicData = await visitor.get('/api/integrations/whatsapp')
  assert.equal(publicData.status, 200)
  assert.equal(publicData.body.phone, '919876543210')
  assert.equal(publicData.body.enabled, true)
  assert.deepEqual(Object.keys(publicData.body).sort(), ['enabled', 'includePage', 'label', 'message', 'phone'])
})

test('email environment defaults and dedicated encryption key survive configuration parsing', () => {
  const parsed = getConfig({
    NODE_ENV: 'test', EMAIL_ENABLED: 'true', SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'fixture-user', SMTP_PASS: 'fixture-secret',
    MAIL_FROM: 'store@example.test', MAIL_SUPPORT: 'support@example.test',
    EMAIL_ENCRYPTION_KEY: 'isolated-dedicated-email-key-at-least-32-characters',
  })

  assert.equal(parsed.EMAIL_ENABLED, true)
  assert.equal(parsed.SMTP_SECURE, true)
  assert.equal(parsed.SMTP_PORT, 465)
  assert.equal(parsed.SMTP_HOST, 'smtp.example.test')
  assert.equal(parsed.SMTP_USER, 'fixture-user')
  assert.equal(parsed.SMTP_PASS, 'fixture-secret')
  assert.equal(parsed.MAIL_FROM, 'store@example.test')
  assert.equal(parsed.MAIL_SUPPORT, 'support@example.test')
  assert.equal(parsed.EMAIL_ENCRYPTION_KEY, 'isolated-dedicated-email-key-at-least-32-characters')
})

test('Cloudinary environment configuration accepts a complete set and rejects partial credentials', () => {
  const parsed = getConfig({
    NODE_ENV: 'test',
    CLOUDINARY_CLOUD_NAME: 'env-cloud',
    CLOUDINARY_API_KEY: 'env-key',
    CLOUDINARY_API_SECRET: 'env-secret',
    CLOUDINARY_FOLDER: 'aurelia/catalog',
  })

  test('administrator authenticator is disabled by default and can be explicitly re-enabled', () => {
    assert.equal(getConfig({ NODE_ENV: 'test' }).ADMIN_MFA_ENABLED, false)
    assert.equal(getConfig({ NODE_ENV: 'test', ADMIN_MFA_ENABLED: 'true' }).ADMIN_MFA_ENABLED, true)
  })
  assert.equal(parsed.CLOUDINARY_CLOUD_NAME, 'env-cloud')
  assert.equal(parsed.CLOUDINARY_API_KEY, 'env-key')
  assert.equal(parsed.CLOUDINARY_API_SECRET, 'env-secret')
  assert.equal(parsed.CLOUDINARY_FOLDER, 'aurelia/catalog')
  assert.throws(() => getConfig({ NODE_ENV: 'test', CLOUDINARY_CLOUD_NAME: 'env-cloud' }), /CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET together/)
})

test.after(async () => {
  await new Promise(resolve => server.close(resolve))
  SiteSettings.findOne = settingsRead
  db.restore()
  await rm(directory, { recursive: true, force: true })
})
