import crypto from 'node:crypto'
import { fail } from './validation.js'
export function validSignature(payload, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = crypto.createHmac('sha256', secret).update(payload).digest()
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
export function createRazorpay(config, fetcher = fetch) {
  const enabled = Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET)
  const environment = config.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live' : 'sandbox'
  async function request(path, body, headers = {}) {
    if (!enabled) throw fail(503, 'Online payments are not configured yet. Please contact the store.')
    let response
    try {
      response = await fetcher(`https://api.razorpay.com/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json', ...headers },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      })
    } catch { throw Object.assign(fail(503, 'The payment service could not be reached. Check this order before trying again.'), { outcomeUnknown: true, code: 'PROVIDER_UNREACHABLE' }) }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw Object.assign(fail(502, 'The payment service could not complete this request. Check its recorded status before retrying.'), { providerStatus: response.status, outcomeUnknown: ![400,401,403,404,422].includes(response.status), code: `PROVIDER_${response.status}` })
    return data
  }
  async function all(path) {
    const items = []
    // A bounded fetch never silently treats a truncated result as exhaustive.
    for (let skip = 0; skip < 10000; skip += 100) {
      const page = await request(`${path}${path.includes('?') ? '&' : '?'}count=100&skip=${skip}`)
      if (!Array.isArray(page.items)) throw fail(502, 'Invalid payment service response.')
      items.push(...page.items)
      if (page.items.length < 100) return { items }
    }
    throw fail(503, 'Provider history exceeds the safe scan limit. Manual reconciliation is required.')
  }
  return { enabled, environment, keyId: config.RAZORPAY_KEY_ID,
    createOrder: (order) => request('/orders', { amount: order.totalPaise, currency: 'INR', receipt: order.orderNumber, partial_payment: false, notes: { localOrderId: String(order._id) } }),
    findOrders: receipt => all(`/orders?receipt=${encodeURIComponent(receipt)}`),
    fetchOrder: id => request(`/orders/${encodeURIComponent(id)}`),
    fetchPayment: id => request(`/payments/${encodeURIComponent(id)}`),
    orderPayments: id => request(`/orders/${encodeURIComponent(id)}/payments`),
    capture: (id, amount) => request(`/payments/${encodeURIComponent(id)}/capture`, { amount, currency: 'INR' }),
    createRefund: (paymentId, body, key) => request(`/payments/${encodeURIComponent(paymentId)}/refund`, body, { 'X-Refund-Idempotency': key }),
    fetchRefund: id => request(`/refunds/${encodeURIComponent(id)}`),
    paymentRefunds: id => all(`/payments/${encodeURIComponent(id)}/refunds`),
    validateCredentials: () => request('/orders?count=1'),
    verifyCheckout: (orderId, paymentId, signature) => validSignature(`${orderId}|${paymentId}`, signature, config.RAZORPAY_KEY_SECRET),
    verifyWebhook: (body, signature) => validSignature(body, signature, config.RAZORPAY_WEBHOOK_SECRET),
  }
}
