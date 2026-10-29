// Bound at server startup after the email collections have been provisioned.
// Keeping delivery behind this boundary leaves standalone commerce consumers intact.
let handler = null
export function emailEventsAvailable() { return Boolean(handler) }
export function bindEmailEvents(next) { handler = next }
export async function emailEvent(kind, data, options = {}) { return handler?.(kind, data, options) }
export async function safeEmailEvent(kind,data,options) {
  try { return await emailEvent(kind,data,options) }
  catch { console.error(JSON.stringify({level:'error',message:'Could not queue email notification',kind})) }
}
export function orderEmailSnapshot(order) {
  return {orderId:String(order._id),customerId:String(order.customer),orderNumber:order.orderNumber,name:order.deliveryAddress?.name || 'Customer',items:order.items.map(item=>({name:item.name,quantity:item.quantity,lineTotalPaise:item.lineTotalPaise})),totalPaise:order.totalPaise,paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,fulfillmentStatus:order.fulfillmentStatus,trackingNumber:order.trackingNumber || '',refundedPaise:order.refundedPaise || 0}
}
export function orderEmailChanges(before,after) {
  const kinds=[]
  if(after.paymentMethod!=='cod' && before.paymentStatus!=='paid' && after.paymentStatus==='paid' && after.inventoryStatus==='committed' && !['cancelled','delivered'].includes(after.fulfillmentStatus))kinds.push('order_confirmation')
  if(['shipped','delivered','cancelled'].includes(after.fulfillmentStatus) && before.fulfillmentStatus!==after.fulfillmentStatus)kinds.push(after.fulfillmentStatus)
  if((after.refundedPaise || 0)>(before.refundedPaise || 0))kinds.push('refund')
  return kinds
}
export async function orderEmailEvents(before,after,session) {
  for(const kind of orderEmailChanges(before,after)) await emailEvent(kind,orderEmailSnapshot(after),{session})
}
