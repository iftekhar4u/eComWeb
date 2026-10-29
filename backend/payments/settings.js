import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { z } from 'zod'
import { PaymentSettings, PaymentProfile } from './models.js'
import { AuditLog } from '../models/domainModels.js'
import { encryptSecret, decryptSecret } from './crypto.js'
import { createRazorpay } from '../services/razorpay.js'
import { transaction } from '../services/commerce.js'
import { fail } from '../services/validation.js'

const amount = z.number().int().min(0).max(100000000)
const httpsUrl = z.string().max(2048).refine(value => { if (!value) return true; try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password } catch { return false } }, 'Use an HTTPS logo URL without credentials.')
export const policyInput = z.object({
  prepaidEnabled: z.boolean(), codEnabled: z.boolean(), activeMode: z.enum(['sandbox', 'live']),
  cancellationHours: z.number().int().min(24).max(168), reservationMinutes: z.number().int().min(5).max(120),
  codMinPaise: amount, codMaxPaise: amount, codFeePaise: amount,
  codPincodes: z.array(z.string().regex(/^[1-9]\d{5}$/)).max(2000), codExcludedSkus: z.array(z.string().trim().min(1).max(64)).max(500),
  codMaxOpenOrders: z.number().int().min(1).max(10), storeName: z.string().trim().min(1).max(100), logoUrl: httpsUrl,
  color: z.string().regex(/^#[a-f\d]{6}$/i), supportEmail: z.union([z.literal(''), z.string().email().max(254)]), supportPhone: z.string().max(30),
  methods: z.object({ card: z.boolean(), upi: z.boolean(), netbanking: z.boolean(), wallet: z.boolean() }).strict(),
  retryLimit: z.number().int().min(3).max(50), reconcileSeconds: z.number().int().min(30).max(3600),
}).strict().refine(v => v.codMinPaise <= v.codMaxPaise, 'COD minimum must not exceed maximum.')
const credentialInput = z.object({
  environment: z.enum(['sandbox', 'live']), accountId: z.string().regex(/^acc_[a-zA-Z0-9]+$/).max(100),
  keyId: z.string().regex(/^rzp_(test|live)_[a-zA-Z0-9]+$/).max(100), keySecret: z.string().max(1024).default(''), webhookSecret: z.string().max(1024).default(''),
  retirePreviousApi: z.boolean().default(false), oldWebhookDays: z.number().int().min(1).max(30).default(7),
}).strict().refine(v => v.keyId.startsWith(v.environment === 'live' ? 'rzp_live_' : 'rzp_test_'), 'Key ID does not match the selected environment.')
export const settingsInput = z.object({ revision: z.number().int().nonnegative(), currentPassword: z.string().min(1).max(128), policy: policyInput, credentials: credentialInput.optional() }).strict()
export const webhookEvents = ['payment.authorized', 'payment.captured', 'payment.failed', 'order.paid', 'refund.created', 'refund.processed', 'refund.failed']
export function defaultSettings(config) {
  const doc = new PaymentSettings({ key: 'payments', revision: 0, policy: { prepaidEnabled: Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET), codEnabled: Boolean(config.COD_ENABLED), activeMode: config.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live' : 'sandbox', reservationMinutes: config.CHECKOUT_RESERVATION_MINUTES || 30 } })
  return doc.toObject()
}
export function createPaymentSettings(config, gatewayOverride) {
  const fallback = () => { const value = defaultSettings(config); if (gatewayOverride) { value.policy.prepaidEnabled = Boolean(gatewayOverride.enabled); value.policy.activeMode = gatewayOverride.environment || 'sandbox' } return value }
  const legacyAccount = config.RAZORPAY_ACCOUNT_ID || `legacy-${crypto.createHash('sha256').update(config.RAZORPAY_KEY_ID || 'disabled').digest('hex').slice(0,24)}`
  const legacyId = `env-${crypto.createHash('sha256').update(config.RAZORPAY_KEY_ID || 'disabled').digest('hex').slice(0,24)}`
  const legacyGateway = () => Object.assign(gatewayOverride || createRazorpay(config), { accountId: gatewayOverride?.accountId || legacyAccount, credentialProfileId: gatewayOverride?.credentialProfileId || legacyId })
  async function read() {
    if (gatewayOverride && mongoose.connection.readyState !== 1) return fallback()
    return await PaymentSettings.findOne({ key: 'payments' }).lean() || fallback()
  }
  const decode = profile => ({ RAZORPAY_KEY_ID: profile.keyId, RAZORPAY_KEY_SECRET: decryptSecret(profile.keySecretEncrypted, config, `${profile.profileId}:key`), RAZORPAY_WEBHOOK_SECRET: decryptSecret(profile.webhookSecretEncrypted, config, `${profile.profileId}:webhook`) })
  const loadProfile = id => PaymentProfile.findOne({ profileId: id }).select('+keySecretEncrypted +webhookSecretEncrypted')
  async function resolve(reference) {
    if (gatewayOverride) return legacyGateway()
    const settings = await read()
    const requested = reference?.credentialProfileId
    const legacyReference = reference && (!requested || requested === `legacy-${reference.environment}`)
    const profileId = legacyReference ? legacyId : requested || (reference ? legacyId : settings[`${settings.policy.activeMode}Profile`])
    let profile = profileId && await loadProfile(profileId)
    if (!profile) {
      if ((!reference && settings.revision === 0) || (reference && (!reference.credentialProfileId || profileId === legacyId))) {
        const gateway = legacyGateway()
        if (reference?.environment && reference.environment !== gateway.environment) throw fail(409, 'Legacy payment credentials for this environment are unavailable.')
        if (reference?.accountId && reference.accountId !== gateway.accountId && !legacyReference) throw fail(409, 'Legacy payment account is unavailable.')
        return legacyReference ? { ...gateway, accountId: reference.accountId || gateway.accountId, credentialProfileId: reference.credentialProfileId || gateway.credentialProfileId } : gateway
      }
      throw fail(503, 'This payment credential profile is unavailable. Review Payment Settings.')
    }
    const signatureProfile = profile
    // API credentials may rotate, but only within the SAME explicit merchant and environment.
    const apiProfile = await PaymentProfile.findOne({ accountId: profile.accountId, environment: profile.environment, apiUsable: true }).sort({ createdAt: -1, _id: -1 }).select('+keySecretEncrypted +webhookSecretEncrypted')
    if (!apiProfile) throw fail(503, 'No usable API credential remains for this payment account. Restore access in Payment Settings.')
    if (!legacyReference && reference?.accountId && reference.accountId !== profile.accountId || reference?.environment && reference.environment !== profile.environment) throw fail(409, 'Payment credential context mismatch.')
    const oldGateway = createRazorpay(decode(signatureProfile)), gateway = createRazorpay(decode(apiProfile))
    return { ...gateway, accountId: legacyReference ? reference.accountId || profile.accountId : profile.accountId, credentialProfileId: legacyReference ? reference.credentialProfileId || profile.profileId : profile.profileId, keyId: gateway.keyId, verifyCheckout: (orderId, paymentId, signature) => oldGateway.verifyCheckout(orderId, paymentId, signature) || gateway.verifyCheckout(orderId, paymentId, signature), verifyWebhook: oldGateway.verifyWebhook }
  }
  async function publicConfig() {
    const settings = await read(), p = settings.policy
    let enabled = false
    if (p.prepaidEnabled) { try { enabled = (await resolve()).enabled } catch { /* COD remains independent. */ } }
    return { razorpayEnabled: enabled, codEnabled: p.codEnabled, revision: settings.revision, cancellationHours: p.cancellationHours, appearance: { name: p.storeName, image: p.logoUrl || undefined, theme: { color: p.color }, method: p.methods }, supportEmail: p.supportEmail, supportPhone: p.supportPhone }
  }
  async function adminView() {
    const settings = await read(), profiles = await PaymentProfile.find().sort({ createdAt: -1 }).limit(100).lean()
    const base = (config.PAYMENT_PUBLIC_ORIGIN || config.CLIENT_URL).replace(/\/$/, '')
    return { revision: settings.revision, policy: settings.policy, profiles: profiles.map(p => ({ profileId: p.profileId, accountId: p.accountId, environment: p.environment, keyIdMasked: `${p.keyId.slice(0,9)}…${p.keyId.slice(-4)}`, configured: true, apiUsable: p.apiUsable, active: settings[`${p.environment}Profile`] === p.profileId, validatedAt: p.validatedAt, validationResult: p.validationResult, lastWebhookAt: p.lastWebhookAt, webhookUntil: p.webhookUntil, webhookUrl: `${base}/api/payments/razorpay/webhook/${p.profileId}` })), webhookUrl: `${base}/api/payments/razorpay/webhook`, webhookEvents, encryptionReady: Boolean(config.PAYMENT_ENCRYPTION_KEY), source: settings.revision ? 'database' : 'environment' }
  }
  async function persistProfile(credentials, actor, session, explicitId) {
    const profileId = explicitId || crypto.randomUUID()
    const [doc] = await PaymentProfile.create([{ profileId, accountId: credentials.accountId, environment: credentials.environment, keyId: credentials.keyId,
      keySecretEncrypted: encryptSecret(credentials.keySecret, config, `${profileId}:key`), webhookSecretEncrypted: encryptSecret(credentials.webhookSecret, config, `${profileId}:webhook`), createdBy: actor }], { session })
    return doc
  }
  async function save(input, actor) {
    return transaction(async session => {
      let current = await PaymentSettings.findOne({ key: 'payments' }).session(session)
      if ((current?.revision || 0) !== input.revision) throw fail(409, 'Payment settings changed. Reload before saving.')
      if (!current) {
        current = new PaymentSettings({ ...fallback(), _id: undefined })
        if (config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET && config.RAZORPAY_WEBHOOK_SECRET) {
          const legacy = await loadProfile(legacyId).session(session) || await persistProfile({ accountId: legacyAccount, environment: legacyGateway().environment, keyId: config.RAZORPAY_KEY_ID, keySecret: config.RAZORPAY_KEY_SECRET, webhookSecret: config.RAZORPAY_WEBHOOK_SECRET }, actor, session, legacyId)
          current[`${legacy.environment}Profile`] = legacyId
        }
      }
      if (input.credentials) {
        const c = input.credentials, oldId = current[`${c.environment}Profile`]
        const old = oldId && await loadProfile(oldId).session(session)
        const previous = old && decode(old) // Corrupt ciphertext fails; never silently replace it.
        const keySecret = c.keySecret || (old?.keyId === c.keyId ? previous.RAZORPAY_KEY_SECRET : '')
        const webhookSecret = c.webhookSecret || (old?.accountId === c.accountId ? previous.RAZORPAY_WEBHOOK_SECRET : '')
        if (!keySecret || webhookSecret.length < 16) throw fail(400, 'Supply the new Key Secret and a Webhook Secret of at least 16 characters.')
        const profile = await persistProfile({ ...c, keySecret, webhookSecret }, actor, session)
        if (old) { old.webhookUntil = new Date(Date.now() + c.oldWebhookDays * 86400000); if (c.retirePreviousApi) old.apiUsable = false; await old.save({ session }) }
        current[`${c.environment}Profile`] = profile.profileId
      }
      if (input.policy.prepaidEnabled && !current[`${input.policy.activeMode}Profile`]) throw fail(400, 'Configure credentials for the active payment environment first.')
      current.policy = input.policy; current.revision += 1; current.updatedBy = actor
      await current.save({ session })
      await AuditLog.create([{ actor, action: 'payments.settings', resourceType: 'payment_settings', resourceId: 'payments', summary: `Payment policy revision ${current.revision}; fields: policy${input.credentials ? ', credential profile' : ''}` }], { session })
      return { revision: current.revision }
    })
  }
  async function verifyWebhook(body, signature, profileId) {
    const filter = profileId ? { profileId } : {}
    const profiles = gatewayOverride && mongoose.connection.readyState !== 1 ? [] : await PaymentProfile.find(filter).select('+keySecretEncrypted +webhookSecretEncrypted').lean()
    const matches = []
    for (const p of profiles) {
      if (p.webhookUntil && new Date(p.webhookUntil) < new Date()) continue
      const secret = decryptSecret(p.webhookSecretEncrypted, config, `${p.profileId}:webhook`)
      if (createRazorpay({ RAZORPAY_WEBHOOK_SECRET: secret }).verifyWebhook(body, signature)) matches.push(p)
    }
    if (!matches.length && (await read()).revision === 0 && (!profileId || profileId === legacyId) && legacyGateway().verifyWebhook(body, signature)) matches.push({ profileId: legacyGateway().credentialProfileId, accountId: legacyGateway().accountId, environment: legacyGateway().environment })
    const contexts = new Set(matches.map(p => `${p.accountId}:${p.environment}`))
    if (contexts.size !== 1) throw fail(400, 'Invalid or ambiguous webhook signature.')
    return matches[0]
  }
  async function validate(profileId) {
    const profile = await loadProfile(profileId)
    if (!profile) throw fail(404, 'Payment profile not found.')
    let result = 'API authentication failed'
    try { await createRazorpay(decode(profile)).validateCredentials(); result = 'API authentication succeeded' }
    finally { await PaymentProfile.updateOne({ _id: profile._id }, { $set: { validatedAt: new Date(), validationResult: result } }) }
    return { message: `${result}. Merchant account association and enabled payment methods must also be checked in your Dashboard.` }
  }
  return { read, resolve, publicConfig, adminView, save, verifyWebhook, validate }
}
