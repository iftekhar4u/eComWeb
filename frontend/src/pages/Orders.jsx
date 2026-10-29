import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import api from '../services/api'
import useApi from '../hooks/useApi'
import { money } from '../services/format'
import { openPayment } from '../services/payment'
export default function Orders() {
  const { id } = useParams(), { user, loading, mfaRequired } = useAuth()
  const state = useApi(user && !mfaRequired ? `/orders${id ? `/${id}` : ''}` : null)
  if (loading) return <main className="page-shell">Loading account...</main>
  if (!user || mfaRequired) return <Navigate to={`/login?returnTo=${encodeURIComponent(id ? `/orders/${id}` : '/orders')}`} replace />
  return <main className="page-shell"><p className="eyebrow">My AURELIA</p><h1>{id ? 'Your order.' : 'My orders.'}</h1>{state.error && <p className="form-error" role="alert">{state.error}</p>}{state.loading && !state.data ? <p>Loading orders...</p> : id && state.data?.order ? <OrderDetails order={state.data.order} refunds={state.data.refunds || []} reload={state.reload} /> : <><div className="order-list">{state.data?.orders.map(o => <Link className="order-card" key={o._id} to={`/orders/${o._id}`}><strong>{o.orderNumber}</strong><span>{new Date(o.createdAt).toLocaleDateString()}</span><span>{money(o.totalPaise)}</span><span>Payment: {o.paymentStatus} · {o.fulfillmentStatus}</span></Link>)}</div>{!state.data?.orders.length && <p>No orders yet. <Link to="/shop">Explore the shop.</Link></p>}</>}<Link className="text-link" to="/profile">Back to account</Link></main>
}
function OrderDetails({ order, refunds, reload }) {
  const { user } = useAuth(), { refreshCart, loading: cartLoading } = useCart()
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [reason, setReason] = useState('')
  const cleaned = useRef(false)
  const cancelled = order.fulfillmentStatus === 'cancelled'
  const confirmed = !cancelled && order.inventoryStatus === 'committed' && (order.paymentStatus === 'paid' || order.paymentMethod === 'cod')
  useEffect(() => {
    if (!confirmed || cartLoading || cleaned.current) return
    cleaned.current = true
    api.post(`/orders/${order._id}/cart-cleanup`).then(async ({data}) => { await refreshCart(); if(data.result === 'newer_cart_preserved') setMessage('Your bag changed after checkout, so its newer contents were preserved.') }).catch(() => { cleaned.current = false })
  }, [confirmed, cartLoading, order._id, refreshCart])
  const pending = order.paymentMethod === 'razorpay' && (['pending','authorized'].includes(order.paymentStatus) || order.refundPendingPaise > 0)
  useEffect(() => {
    if (!pending) return
    let active = true, count = 0, timer
    const poll = async () => {
      if (!active || ++count > 8) return
      try { await api.post(`/orders/${order._id}/check`); if(active) reload() } catch { /* Keep the order link and manual refresh available. */ }
      if (active) timer = setTimeout(poll, Math.min(60000, 10000 * count))
    }
    timer = setTimeout(poll,10000)
    return () => { active = false; clearTimeout(timer) }
  }, [order._id, pending, reload])
  async function action(type) {
    if (type === 'cancel' && !window.confirm('Cancel this order? Captured prepaid money will be queued for refund. Uncaptured payments remain under reconciliation.')) return
    setBusy(true); setMessage('')
    try {
      const { data } = await api.post(`/orders/${order._id}/${type}`, type === 'cancel' ? { reason: reason || 'Customer cancellation' } : {})
      if (data.checkout) await openPayment({ ...data, user, onMessage: setMessage })
      if (type === 'cancel') setMessage('Cancellation accepted. Any captured prepaid balance will be refunded through the original payment method.')
      reload()
    } catch(e) { setMessage(e.response?.data?.message || e.message || 'Unable to check the order.') }
    finally { setBusy(false) }
  }
  const resumable = !cancelled && order.paymentMethod === 'razorpay' && order.inventoryStatus === 'reserved' && !confirmed && new Date(order.expiresAt) > new Date(order.serverNow)
  return <section className="order-detail"><div className="order-confirmation">
    <h2>{cancelled ? 'Order cancelled.' : order.inventoryStatus === 'review' ? 'Your order needs review.' : confirmed ? order.paymentMethod === 'cod' && !order.codCollectedPaise ? 'Order placed — payment due on delivery.' : 'Thank you for your order.' : 'Your payment is awaiting confirmation.'}</h2>
    <p>{order.orderNumber}</p><p>Payment: <strong>{order.paymentStatus}</strong> · Delivery: <strong>{order.fulfillmentStatus}</strong></p>
    {order.paymentEnvironment === 'sandbox' && <p>Test-mode order</p>}
    {order.inventoryStatus === 'review' && <p className="form-error">The payment and inventory need review. Contact support with your order number.</p>}
    {order.paymentMethod === 'cod' && <p>{order.codCollectedPaise > 0 ? `COD collected: ${money(order.codCollectedPaise)}` : cancelled ? 'No COD amount is due for this cancelled order.' : order.legacyCollectionUnverified ? 'Historical collection is awaiting verification.' : 'Payment is due on delivery.'}</p>}
    {cancelled && order.paymentMethod === 'razorpay' && ['pending','authorized'].includes(order.paymentStatus) && <p>Cancellation is saved. The payment outcome is still being checked; this order will not be dispatched.</p>}
  </div>
  {order.items.map(i => <p key={i.variant}>{i.name} × {i.quantity}<strong>{money(i.lineTotalPaise)}</strong></p>)}
  <p>Shipping <strong>{money(order.shippingPaise)}</strong></p>{order.codFeePaise > 0 && <p>COD fee <strong>{money(order.codFeePaise)}</strong></p>}
  <p className="summary-total">Total <strong>{money(order.totalPaise)}</strong></p>
  {order.refundPendingPaise > 0 && <p>Refund pending <strong>{money(order.refundPendingPaise)}</strong></p>}
  {order.refundedPaise > 0 && <p>Refund processed <strong>{money(order.refundedPaise)}</strong></p>}
  {refunds.length > 0 && <section><h3>Refund updates</h3>{refunds.map(r => <p key={r._id}>{money(r.amountPaise)} — {r.status}{r.providerRefundId && <small> · {r.providerRefundId}</small>}{['failed','review'].includes(r.status) && <span> · Contact support for recovery.</span>}</p>)}<p>Accepted or pending refunds are still processing. Bank credit timing depends on your payment method.</p></section>}
  <h3>Delivery address</h3><p>{order.deliveryAddress.name}<br />{order.deliveryAddress.line1} {order.deliveryAddress.line2}<br />{order.deliveryAddress.city}, {order.deliveryAddress.state} – {order.deliveryAddress.postalCode}</p>
  {order.trackingNumber && <p>Tracking number: {order.trackingNumber}</p>}
  {order.returnStatus && order.returnStatus !== 'none' && <p>Return: {order.returnStatus.replaceAll('_',' ')}</p>}
  {order.cancellationDeadline && !cancelled && <p>Cancellation deadline: {new Date(order.cancellationDeadline).toLocaleString()}. Dispatch is held until this deadline.</p>}
  <div className="commerce-actions">{resumable && <button className="button button-dark" disabled={busy} onClick={() => action('resume')}>Resume payment</button>}
  {order.paymentMethod === 'razorpay' && <button className="button button-light" disabled={busy} onClick={() => action('check')}>Check payment status</button>}
  {order.cancellation?.eligible && <><label>Cancellation reason<input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} /></label><button className="remove-button" disabled={busy} onClick={() => action('cancel')}>Cancel order</button></>}
  {!cancelled && order.cancellation && !order.cancellation.eligible && <p>{order.cancellation.reason}</p>}</div>
  {message && <p role="status">{message}</p>}<Link className="text-link" to="/orders">All orders</Link></section>
}
