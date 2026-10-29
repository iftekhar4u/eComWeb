// The existing store supports INR only; timestamps are grouped in India time.
export const TIMEZONE = 'Asia/Kolkata'
export const LOW_STOCK = 5
const DAY = 86400000
export function periods(days, now = new Date()) {
  const end = new Date(now)
  const start = new Date(end.getTime() - days * DAY)
  return { start, end, previousStart: new Date(start.getTime() - days * DAY) }
}
export function change(current, previous) {
  return previous === 0 ? (current === 0 ? 0 : null) : Math.round((current - previous) / previous * 100)
}
export function netPaid(order) {
  return order.paymentStatus === 'paid' ? Math.max(0, order.totalPaise - (order.refundedPaise || 0)) : 0
}
export const revenueExpression = { $min: ['$totalPaise', { $max: [0, { $subtract: [{ $cond: [{ $eq: ['$paymentMethod','cod'] }, { $ifNull: ['$codCollectedPaise', 0] }, { $ifNull: ['$capturedPaise', '$totalPaise'] }] }, { $ifNull: ['$refundedPaise', 0] }] }] }] }
