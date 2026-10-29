import api from './api'
let loadingScript
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  if (loadingScript) return loadingScript
  loadingScript = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true
    const timeout = setTimeout(() => { script.remove(); loadingScript = null; reject(new Error('Payment checkout took too long to load. Check your connection and try again.')) }, 20000)
    script.onload = () => { clearTimeout(timeout); resolve() }
    script.onerror = () => { clearTimeout(timeout); script.remove(); loadingScript = null; reject(new Error('Unable to load secure payment checkout. Please try again.')) }
    document.body.appendChild(script)
  })
  return loadingScript
}
export async function openPayment({ order, checkout, user, onMessage }) {
  await loadCheckout()
  return new Promise((resolve, reject) => {
    let verifying = false, completed = false
    const popup = new window.Razorpay({ ...checkout, name: checkout.name || 'AURELIA', description: order.orderNumber, notes: { localOrderId: order._id }, theme: checkout.theme || { color: '#302d29' }, timeout: Math.max(1, Math.floor((new Date(order.expiresAt) - Date.now()) / 1000)), prefill: { name: order.deliveryAddress.name, email: user.email, contact: order.deliveryAddress.phone },
      modal: { confirm_close: true, ondismiss: () => { if (!verifying && !completed) resolve({ cancelled: true, order }) } },
      handler: async response => {
        verifying = true; onMessage?.('Confirming your payment...')
        try { const { data } = await api.post(`/orders/${order._id}/verify`, response); completed = true; resolve(data) }
        catch (error) { reject(error) }
      },
    })
    popup.on('payment.failed', () => onMessage?.('That payment attempt failed. You can retry in the payment window or close it and check your order.'))
    popup.open()
  })
}
