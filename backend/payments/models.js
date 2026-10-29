import mongoose from 'mongoose'

const { Schema } = mongoose
const options = { timestamps: true, strict: 'throw', optimisticConcurrency: true }
const money = { type: Number, min: 0, max: 100000000, validate: Number.isSafeInteger, default: 0 }
const text = max => ({ type: String, maxlength: max })
const oid = { type: Schema.Types.ObjectId, required: true }
const state = (values, initial) => ({ type: String, enum: values, default: initial, required: true })
const policySchema = new Schema({
  prepaidEnabled: { type: Boolean, default: false }, codEnabled: { type: Boolean, default: false },
  activeMode: state(['sandbox', 'live'], 'sandbox'),
  cancellationHours: { type: Number, min: 24, max: 168, default: 24 },
  reservationMinutes: { type: Number, min: 5, max: 120, default: 30 },
  codMinPaise: money, codMaxPaise: { ...money, default: 500000 }, codFeePaise: money,
  codPincodes: { type: [String], default: [] }, codExcludedSkus: { type: [String], default: [] },
  codMaxOpenOrders: { type: Number, min: 1, max: 10, default: 3 },
  storeName: { ...text(100), default: 'AURELIA' }, logoUrl: { ...text(2048), default: '' },
  color: { ...text(7), default: '#302d29' }, supportEmail: { ...text(254), default: '' }, supportPhone: { ...text(30), default: '' },
  methods: { card: { type: Boolean, default: true }, upi: { type: Boolean, default: true }, netbanking: { type: Boolean, default: false }, wallet: { type: Boolean, default: false } },
  retryLimit: { type: Number, min: 3, max: 50, default: 12 }, reconcileSeconds: { type: Number, min: 30, max: 3600, default: 60 },
}, { _id: false, strict: 'throw' })
const settingsSchema = new Schema({ key: { type: String, required: true, enum: ['payments'] }, revision: { type: Number, default: 0, min: 0 }, policy: { type: policySchema, required: true }, sandboxProfile: text(80), liveProfile: text(80), updatedBy: Schema.Types.ObjectId }, options)
settingsSchema.index({ key: 1 }, { unique: true })
const profileSchema = new Schema({
  profileId: { ...text(80), required: true }, accountId: { ...text(100), required: true }, environment: state(['sandbox', 'live'], 'sandbox'),
  keyId: { ...text(100), required: true }, keySecretEncrypted: { ...text(4096), required: true, select: false }, webhookSecretEncrypted: { ...text(4096), required: true, select: false },
  apiUsable: { type: Boolean, default: true }, webhookUntil: Date, validatedAt: Date, validationResult: text(100),
  lastWebhookAt: Date, createdBy: Schema.Types.ObjectId,
}, options)
profileSchema.index({ profileId: 1 }, { unique: true })
profileSchema.index({ accountId: 1, environment: 1, createdAt: -1 })
const attemptSchema = new Schema({
  order: oid, payment: oid, providerPaymentId: { ...text(200), required: true }, providerOrderId: { ...text(200), required: true },
  accountId: { ...text(100), required: true }, environment: state(['sandbox', 'live'], 'sandbox'), credentialProfileId: text(80),
  amountPaise: { ...money, required: true }, refundedPaise: money, currency: { type: String, enum: ['INR'], default: 'INR' },
  status: state(['created', 'authorized', 'captured', 'failed', 'refunded'], 'created'), capturedAt: Date, lastCheckedAt: Date,
}, options)
attemptSchema.index({ accountId: 1, environment: 1, providerPaymentId: 1 }, { unique: true })
attemptSchema.index({ order: 1, createdAt: 1 })
export const refundStates = ['requested', 'submitting', 'unknown', 'pending', 'processed', 'failed', 'review']
export const committedRefundStates = refundStates.filter(s => s !== 'failed')
const refundSchema = new Schema({
  order: oid, attempt: oid, accountId: { ...text(100), required: true }, environment: state(['sandbox', 'live'], 'sandbox'), credentialProfileId: text(80),
  providerPaymentId: { ...text(200), required: true }, providerRefundId: text(200), operationKey: { ...text(128), required: true },
  idempotencyKey: { ...text(80), required: true }, requestHash: { ...text(64), required: true },
  amountPaise: { ...money, min: 1, required: true }, reason: { ...text(300), required: true }, actor: Schema.Types.ObjectId,
  status: state(refundStates, 'requested'), source: state(['admin', 'cancellation', 'overpayment', 'dashboard'], 'admin'),
  submittedAt: Date, processedAt: Date, failureCode: text(80), bankReference: text(200),
  attempts: { type: Number, min: 0, default: 0 }, nextAttemptAt: { type: Date, default: Date.now }, leaseUntil: Date, leaseToken: text(80),
}, options)
refundSchema.index({ order: 1, operationKey: 1 }, { unique: true })
refundSchema.index({ accountId: 1, environment: 1, providerRefundId: 1 }, { unique: true, partialFilterExpression: { providerRefundId: { $type: 'string' } } })
refundSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 })
const operationSchema = new Schema({
  order: oid, operationKey: { ...text(128), required: true }, requestHash: { ...text(64), required: true },
  kind: state(['cod_collect', 'cod_remit', 'cod_reimburse', 'return_received', 'cart_cleanup'], 'cart_cleanup'),
  amountPaise: money, actor: Schema.Types.ObjectId, reference: text(200), evidence: text(500), result: text(100),
}, options)
operationSchema.index({ order: 1, operationKey: 1 }, { unique: true })
const jobSchema = new Schema({
  key: { ...text(180), required: true }, kind: state(['reconcile', 'notification', 'heartbeat'], 'reconcile'), order: Schema.Types.ObjectId,
  notificationKind: text(80), snapshot: { type: String, maxlength: 60000 }, state: state(['ready', 'running', 'done', 'review'], 'ready'),
  attempts: { type: Number, min: 0, default: 0 }, nextAttemptAt: { type: Date, default: Date.now }, leaseUntil: Date, leaseToken: text(80),
  lastSuccessAt: Date, failureCode: text(80),
}, options)
jobSchema.index({ key: 1 }, { unique: true })
jobSchema.index({ kind: 1, state: 1, nextAttemptAt: 1, leaseUntil: 1 })
export const paymentSchemas = { payment_settings: ['PaymentSettings', settingsSchema], payment_profiles: ['PaymentProfile', profileSchema], payment_attempts: ['PaymentAttempt', attemptSchema], refunds: ['Refund', refundSchema], commerce_operations: ['CommerceOperation', operationSchema], payment_jobs: ['PaymentJob', jobSchema] }
const models = Object.fromEntries(Object.entries(paymentSchemas).map(([collection, [name, schema]]) => [name, mongoose.models[name] || mongoose.model(name, schema, collection)]))
export const { PaymentSettings, PaymentProfile, PaymentAttempt, Refund, CommerceOperation, PaymentJob } = models
