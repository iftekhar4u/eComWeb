import mongoose from 'mongoose'
import { EMAIL_KINDS } from '../../shared/email.mjs'
const { Schema } = mongoose
const options = { timestamps: true, strict: 'throw' }
const template = new Schema({ enabled: { type: Boolean, default: true }, subject: { type: String, maxlength: 200 }, body: { type: String, maxlength: 10000 } }, { _id: false, strict: 'throw' })
const settings = new Schema({
  key: { type: String, required: true, enum: ['mail'] }, enabled: { type: Boolean, default: false },
  host: { type: String, maxlength: 253 }, port: { type: Number, min: 1, max: 65535 }, secure: Boolean,
  username: { type: String, maxlength: 320 }, passwordEncrypted: { type: String, maxlength: 4096, select: false },
  fromEmail: { type: String, maxlength: 254 }, fromName: { type: String, maxlength: 100 },
  supportEmail: { type: String, maxlength: 254 }, publicUrl: { type: String, maxlength: 2048 },
  templates: { type: Map, of: template }, updatedBy: Schema.Types.ObjectId,
}, options)
settings.index({ key: 1 }, { unique: true })
export const EmailSettings = mongoose.models.EmailSettings || mongoose.model('EmailSettings', settings, 'email_settings')
const jobs = new Schema({
  eventKey: { type: String, required: true, maxlength: 240 }, kind: { type: String, required: true, enum: EMAIL_KINDS },
  to: { type: String, required: true, maxlength: 254 }, payloadEncrypted: { type: String, maxlength: 150000, select: false },
  status: { type: String, enum: ['pending','processing','sent','failed','cancelled'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0 }, nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: Date, lockId: String, sentAt: Date, expiresAt: Date, purgeAt: Date,
  lastError: { type: String, maxlength: 300 }, messageId: { type: String, maxlength: 300 },
  campaign: Schema.Types.ObjectId, subscriber: Schema.Types.ObjectId,
}, options)
jobs.index({ eventKey: 1 }, { unique: true })
jobs.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 })
jobs.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })
export const EmailJob = mongoose.models.EmailJob || mongoose.model('EmailJob', jobs, 'email_jobs')
const campaigns = new Schema({
  subject: { type: String, required: true, maxlength: 200 }, body: { type: String, required: true, maxlength: 10000 },
  status: { type: String, enum: ['draft','sending','queued','cancelled'], default: 'draft' },
  startedAt: Date, cursor: Schema.Types.ObjectId, queuedCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, required: true },
}, { ...options, optimisticConcurrency: true })
export const EmailCampaign = mongoose.models.EmailCampaign || mongoose.model('EmailCampaign', campaigns, 'email_campaigns')
