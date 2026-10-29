import { PaymentJob } from './models.js'
import { orderEmailChanges, orderEmailSnapshot } from '../email/events.js'
export async function scheduleOrder(orderId, session) {
  return PaymentJob.updateOne({ key: `reconcile:${orderId}` }, { $setOnInsert: { kind: 'reconcile', order: orderId, state: 'ready', nextAttemptAt: new Date() } }, { upsert: true, session })
}
export async function notification(kind, order, session) {
  const key = `mail:${order._id}:${kind}:${kind === 'refund' ? order.refundedPaise : 'once'}`
  await PaymentJob.updateOne({ key }, { $setOnInsert: { kind: 'notification', order: order._id, notificationKind: kind, snapshot: JSON.stringify(orderEmailSnapshot(order)), state: 'ready', nextAttemptAt: new Date() } }, { upsert: true, session })
}
export async function queueOrderNotifications(before, order, session) {
  for (const kind of orderEmailChanges(before, order)) await notification(kind, order, session)
}
