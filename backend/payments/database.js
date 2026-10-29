import { paymentSchemas } from './models.js'

// Generate strict BSON shape from the SAME Mongoose schemas; retain constraints
// that Mongoose's toJSONSchema does not emit (bounds and string lengths).
function bsonSchema(schema) {
  const result = schema.toJSONSchema({ useBsonType: true })
  result.bsonType = 'object'; result.additionalProperties = false
  schema.eachPath((name, path) => {
    const keys = name.split('.'); let parent = result
    for (const key of keys.slice(0,-1)) parent = parent?.properties?.[key]
    const prop = parent?.properties?.[keys.at(-1)]
    if (!prop) return
    if (path.instance === 'Number') { prop.bsonType = 'int'; prop.minimum = path.options.min ?? 0; prop.maximum = path.options.max ?? 2147483647 }
    if (path.options.maxlength) prop.maxLength = path.options.maxlength
    if (path.schema) Object.assign(prop, bsonSchema(path.schema))
  })
  function strict(node) {
    if (node.properties) { node.bsonType = 'object'; node.additionalProperties = false; for (const value of Object.values(node.properties)) strict(value) }
    if (node.items) strict(node.items)
  }
  strict(result)
  return result
}
export const paymentCollectionDefinitions = Object.fromEntries(Object.entries(paymentSchemas).map(([name, [, schema]]) => [name, {
  validator: { $jsonSchema: bsonSchema(schema) },
  indexes: schema.indexes().map(([key, options], i) => [key, { ...options, name: `${name}_${i}` }]),
}]))
const str = maxLength => ({ bsonType: 'string', maxLength })
const date = { bsonType: 'date' }, oid = { bsonType: 'objectId' }, money = { bsonType: 'int', minimum: 0, maximum: 2147483647 }
export const orderPaymentProperties = {
  placedAt: date, cancellationDeadline: date, policyRevision: money, paymentEnvironment: { enum: ['sandbox','live','unknown'] }, accountId: str(100), credentialProfileId: str(80),
  codFeePaise: money, capturedPaise: money, refundPendingPaise: money, codCollectedPaise: money, codRemittedPaise: money, codReimbursedPaise: money,
  legacyCollectionUnverified: { bsonType: 'bool' }, cancelledAt: date, cancelledBy: oid, cancellationReason: str(300), financialRevision: money, cartVersion: money, cartCleanedAt: date,
  returnStatus: { enum: ['none','failed_delivery','refused','returning','received'] },
}
export const eventPaymentProperties = { accountId: str(100), credentialProfileId: str(80), eventKind: str(80), remotePaymentId: str(200), remoteRefundId: str(200), remoteOrderId: str(200), attempts: money, nextAttemptAt: date, leaseUntil: date, leaseToken: str(80), failureCode: str(100) }

export async function backfillPayments(db) {
  const orders = db.collection('orders'), payments = db.collection('payments')
  // All fields are additive; historical outcomes and evidence are left intact.
  for await (const payment of payments.find({})) {
    const context = { accountId: payment.accountId || `legacy-${payment.environment}`, credentialProfileId: payment.credentialProfileId || `legacy-${payment.environment}` }
    await payments.updateOne({ _id: payment._id }, { $set: context })
    await orders.updateOne({ _id: payment.order, paymentEnvironment: { $exists: false } }, { $set: { paymentEnvironment: payment.environment, ...context } })
  }
  for await (const order of orders.find({ placedAt: { $exists: false } })) {
    const placedAt = order.createdAt || new Date(0)
    await orders.updateOne({ _id: order._id }, { $set: {
      placedAt, cancellationDeadline: new Date(placedAt.getTime() + 86400000), policyRevision: 0, codFeePaise: 0,
      ...(order.paymentEnvironment ? {} : { paymentEnvironment: 'unknown' }),
      legacyCollectionUnverified: order.paymentMethod === 'cod' && order.paymentStatus === 'paid',
      codCollectedPaise: 0, codRemittedPaise: 0, codReimbursedPaise: 0, refundPendingPaise: 0, financialRevision: 0, returnStatus: 'none',
    } })
  }
  await db.collection('payment_events').updateMany({ accountId: { $exists: false } }, [{ $set: { accountId: { $concat: ['legacy-', '$environment'] } } }])
  await db.collection('carts').updateMany({ __v: { $exists: false } }, { $set: { __v: 0 } })
  for await (const order of orders.find({ paymentMethod: 'razorpay' })) {
    await db.collection('payment_jobs').updateOne({ key: `reconcile:${order._id}` }, { $setOnInsert: { key: `reconcile:${order._id}`, kind: 'reconcile', order: order._id, state: 'ready', attempts: 0, nextAttemptAt: new Date(), createdAt: new Date(), updatedAt: new Date(), __v: 0 } }, { upsert: true })
  }
}
