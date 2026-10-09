import { z } from 'zod'
import nodemailer from 'nodemailer'
import { EmailSettings } from './models.js'
import { unseal } from './crypto.js'
import { EMAIL_TEMPLATES, TEMPLATE_VARIABLES } from '../../shared/email.mjs'
export const emailAddress = z.string().trim().toLowerCase().email().max(254)
const optionalEmail = z.union([emailAddress, z.literal('')])
const text = max => z.string().trim().max(max)
const subject = text(200).min(1).refine(value => !/[\r\n]/.test(value), 'Use a single-line subject.')
export const templateInput = z.object({ enabled: z.boolean(), subject, body: text(10000).min(1) }).strict().superRefine((value,ctx) => {
  for (const match of (value.subject + value.body).matchAll(/{{\s*([^{}]+?)\s*}}/g)) if (!TEMPLATE_VARIABLES.includes(match[1])) ctx.addIssue({ code:'custom',message:`Unknown placeholder: ${match[1]}` })
})
export const campaignInput = z.object({ subject, body: text(10000).min(1) }).strict()
export const settingsInput = z.object({
  enabled: z.boolean(), host: text(253).regex(/^(?:[a-z\d][a-z\d.-]*|)$/i), port: z.number().int().min(1).max(65535), secure: z.boolean(),
  username: text(320), password: z.string().max(2048).optional(), clearPassword: z.boolean().optional(),
  fromEmail: optionalEmail, fromName: text(100).min(1), supportEmail: optionalEmail,
  publicUrl: text(2048).refine(value => { if (!value) return true; try {const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash} catch {return false} }, 'Use a website origin such as https://your-domain.com.'),
  templates: z.object(Object.fromEntries(Object.keys(EMAIL_TEMPLATES).map(key => [key,templateInput.optional()]))).strict(),
}).strict().superRefine((value,ctx) => {
  if (value.enabled && (!value.host || !value.fromEmail)) ctx.addIssue({code:'custom',message:'SMTP host and sender email are required before enabling email.'})
  if (value.password && value.clearPassword) ctx.addIssue({code:'custom',message:'Enter a new password or clear it, not both.'})
})
export function defaults(config) {
  return { enabled: Boolean(config.EMAIL_ENABLED), host: config.SMTP_HOST || '', port: config.SMTP_PORT || 587, secure: Boolean(config.SMTP_SECURE), username: config.SMTP_USER || '', fromEmail: config.MAIL_FROM || '', fromName: 'AURELIA', supportEmail: config.MAIL_SUPPORT || '', publicUrl: '', templates: {} }
}
export async function loadEmailSettings(config, { secrets = false } = {}) {
  const record = await EmailSettings.findOne({ key:'mail' }).select(secrets ? '+passwordEncrypted' : '-passwordEncrypted').lean()
  const result = { ...defaults(config), ...record }
  if (secrets) result.password = record ? (record.passwordEncrypted ? unseal(record.passwordEncrypted) : '') : config.SMTP_PASS || ''
  result.publicUrl = result.publicUrl || config.CLIENT_URL
  return result
}
export function publicSettings(record,config) {
  const value = { ...defaults(config), ...record }
  return Object.fromEntries(['enabled','host','port','secure','username','fromEmail','fromName','supportEmail','publicUrl','templates'].map(key => [key,value[key]]))
}
export function websiteUrl(settings, config) {
  const url = new URL(settings.publicUrl || config.CLIENT_URL)
  if (config.NODE_ENV === 'production' && url.protocol !== 'https:') throw Object.assign(new Error('Use HTTPS for the public email website URL in production.'),{status:400})
  return url.origin
}
export function smtpOptions(settings, config) {
  return { host: settings.host, port: settings.port, secure: settings.secure,
    requireTLS: config.NODE_ENV === 'production' && !settings.secure,
    ...(settings.username && { auth: { user: settings.username, pass: settings.password } }),
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,dnsTimeout:10000,
    disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false }
}
export const makeTransport = (settings,config) => nodemailer.createTransport(smtpOptions(settings,config))
export function mailError(error) {
  if (error?.code === 'EAUTH' || error?.responseCode === 535) return 'SMTP authentication failed. Check the username and SMTP/app password.'
  if (['ECONNECTION','ESOCKET','ETIMEDOUT','EDNS','ECONNREFUSED'].includes(error?.code)) return 'SMTP connection failed. Check the host, port, TLS setting and network access.'
  if (/encryption key/.test(error?.message || '')) return 'Email encryption key changed. Restore the original key or save the SMTP password again.'
  return 'Email was not accepted. Check SMTP settings, sender authorization and provider limits.'
}
