import { checkoutIntent, readIntent, saveIntent, newPurchase } from '../services/checkoutIntent'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import api from '../services/api'
import { money } from '../services/format'
import { openPayment } from '../services/payment'
const blankAddress = { name: '', line1: '', line2: '', city: '', state: '', postalCode: '', phone: '', country: 'IN' }
export default function Checkout() {
  const { user, loading: authLoading, mfaRequired } = useAuth(); const { cartItems, loading: cartLoading, error: cartError, flush } = useCart()
  const [address, setAddress] = useState(blankAddress), [config, setConfig] = useState(null), [quote, setQuote] = useState(null), [method, setMethod] = useState('razorpay'), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [order, setOrder] = useState(null), [quoteVersion, setQuoteVersion] = useState(0)
  const [addresses, setAddresses] = useState([])
  const navigate = useNavigate()
  const [recovery, setRecovery] = useState(() => user ? readIntent(user.id) : null)
  useEffect(() => {
    if (!user) return
    const saved = readIntent(user.id); setRecovery(saved)
    if (saved?.submitted) api.get(`/orders/intent/${saved.idempotencyKey}`).then(({data}) => { if (data.order) { setOrder(data.order); saveIntent(user.id, { ...saved, orderId: data.order._id }) } }).catch(() => setMessage('Existing checkout could not be checked. Retry safely using the saved checkout.'))
  }, [user])
  const items = cartItems.map(i => ({ variantId: i.variantId, quantity: i.quantity })), signature = JSON.stringify(items)
  useEffect(() => { if (user) setAddress(a => ({ ...a, name: a.name || user.name, phone: a.phone || user.phone || '' })) }, [user])
  useEffect(() => { if (user && !mfaRequired) api.get('/auth/addresses').then(({data}) => setAddresses(data.addresses)).catch(() => {}) }, [user, mfaRequired])
  useEffect(() => { api.get('/orders/config').then(({ data }) => { setConfig(data); if (!data.razorpayEnabled && data.codEnabled) setMethod('cod') }).catch(() => setError('Unable to load payment options. Refresh to retry.')) }, [])
  useEffect(() => {
    if (!user || mfaRequired || cartLoading || !cartItems.length) return
    let active = true; setQuote(null)
    api.post('/orders/quote', { items: JSON.parse(signature), paymentMethod: method, postalCode: address.postalCode }).then(({ data }) => { if (active) { setQuote(data); setError('') } }).catch(e => { if (active) setError(e.response?.data?.message || 'Unable to confirm your bag.') })
    return () => { active = false }
  }, [signature, user, mfaRequired, cartLoading, cartItems.length, quoteVersion, method, address.postalCode])
  async function submit(e) {
    e.preventDefault(); if (busy || !quote) return
    setBusy(true); setError(''); setMessage('Preparing your order...')
    try {
      const cartVersion = await flush()
      const intent = await checkoutIntent(user.id, { items, deliveryAddress: address, paymentMethod: method, expectedTotalPaise: quote.totalPaise, cartVersion })
      saveIntent(user.id, { ...intent, submitted: true }); setRecovery({ ...intent, submitted: true })
      const { data } = await api.post('/orders', { ...intent.input, idempotencyKey: intent.idempotencyKey })
      setOrder(data.order); saveIntent(user.id, { ...intent, submitted: true, orderId: data.order._id })
      if (data.checkout) {
        const result = await openPayment({ ...data, user, onMessage: setMessage })
        if (result.cancelled) setMessage('Payment window closed. Your bag is saved; check or resume your order below.')
        else navigate(`/orders/${data.order._id}`)
      } else navigate(`/orders/${data.order._id}`)
    } catch (e) { setError(e.response?.data?.message || e.message || 'Unable to start checkout.'); setMessage(''); if (e.response?.data?.orderId) navigate(`/orders/${e.response.data.orderId}`) }
    finally { setBusy(false) }
  }
  if (authLoading || cartLoading) return <main className="page-shell">Preparing checkout...</main>
  if (!user || mfaRequired) return <Navigate to="/login?returnTo=%2Fcheckout" replace />
  if (!cartItems.length) return <main className="page-shell"><h1>Your bag is empty.</h1><Link className="button button-dark" to="/shop">Explore products</Link></main>
  return <main className="page-shell"><p className="eyebrow">Almost yours</p><h1>Checkout.</h1>{recovery?.submitted && <div className="studio-notice"><p>A saved checkout is available. Check its status before making a new purchase.</p>{(order?._id || recovery.orderId) ? <Link to={`/orders/${order?._id || recovery.orderId}`}>Open existing order</Link> : <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const {data} = await api.post('/orders', {...recovery.input,idempotencyKey:recovery.idempotencyKey}); navigate(`/orders/${data.order._id}`) } catch(e) { setError(e.response?.data?.message || 'Unable to recover checkout. Retry with this saved intent.'); if(e.response?.data?.orderId) navigate(`/orders/${e.response.data.orderId}`) } finally { setBusy(false) } }}>Recover saved checkout</button>}<button type="button" onClick={() => { if (window.confirm('Start a separate purchase? An existing order will keep its current payment status. Check or cancel it first to avoid buying twice.')) { newPurchase(user.id); setRecovery(null); setOrder(null) } }}>Start a separate purchase</button></div>}<div className="commerce-checkout"><form className="checkout-form" onSubmit={submit}><fieldset disabled={busy || Boolean(order)}>{addresses.length > 0 && <label>Use a saved address<select defaultValue="" onChange={e => { const a = addresses.find(a => a._id === e.target.value); if (a) { const { _id, ...fields } = a; setAddress({ ...blankAddress, ...fields }) } }}><option value="">Enter a new address below</option>{addresses.map(a => <option key={a._id} value={a._id}>{a.name} — {a.line1}, {a.city}</option>)}</select></label>}<label>Email address<input type="email" value={user.email} readOnly /></label>{[['name','Full name'],['phone','Mobile number'],['line1','Shipping address'],['line2','Apartment / landmark (optional)'],['city','City'],['state','State'],['postalCode','PIN code']].map(([field, label]) => <label key={field}>{label}<input name={field} value={address[field]} required={field !== 'line2'} maxLength={field === 'postalCode' ? 6 : field === 'phone' ? 13 : 200} pattern={field === 'postalCode' ? '[1-9][0-9]{5}' : field === 'phone' ? '([+]91)?[6-9][0-9]{9}' : undefined} type={field === 'phone' ? 'tel' : 'text'} onChange={e => setAddress({ ...address, [field]: e.target.value })} /></label>)}<p>Delivery within India</p><h2>Payment method</h2>{config?.razorpayEnabled && <label className="payment-option"><input type="radio" value="razorpay" checked={method === 'razorpay'} onChange={() => setMethod('razorpay')} /> Cards and supported UPI options via Razorpay</label>}{config?.codEnabled && <label className="payment-option"><input type="radio" value="cod" checked={method === 'cod'} onChange={() => setMethod('cod')} /> Cash on delivery</label>}{config && !config.razorpayEnabled && !config.codEnabled && <p role="status">Checkout payments are not available yet. Please contact the store.</p>}<button className="button button-dark" disabled={!quote || busy || !config || (!config.razorpayEnabled && !config.codEnabled) || Boolean(cartError)}>{busy ? 'Please wait...' : method === 'cod' ? 'Place order' : `Pay ${quote ? money(quote.totalPaise) : ''}`} <span>→</span></button></fieldset>{(error || cartError) && <p className="form-error" role="alert">{error || cartError}</p>}{message && <p role="status">{message}</p>}{!order && !busy && <button type="button" className="remove-button" onClick={() => { setError(''); setQuoteVersion(v => v + 1) }}>Refresh totals</button>}{order && <Link to={`/orders/${order._id}`} className="text-link">Check or resume order {order.orderNumber} →</Link>}</form><aside className="summary"><h2>Your selections</h2>{cartItems.map(i => <p key={i.id}>{i.name} × {i.quantity}<strong>{money(i.pricePaise * i.quantity)}</strong></p>)}{quote && <><p>Subtotal<strong>{money(quote.subtotalPaise)}</strong></p><p>Shipping<strong>{quote.shippingPaise ? money(quote.shippingPaise) : 'FREE'}</strong></p>{quote.codFeePaise > 0 && <p>Cash-on-delivery fee<strong>{money(quote.codFeePaise)}</strong></p>}<p className="summary-total">Total<strong>{money(quote.totalPaise)}</strong></p></>}<Link to="/cart">Edit shopping bag</Link></aside></div></main>
}
