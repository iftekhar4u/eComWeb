import { useState } from 'react'
import { EmailAction, emailAction } from '../email/EmailActions'
import { Link, useParams, useLocation } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import useApi from '../hooks/useApi'
import api from '../services/api'
import { toProduct } from '../services/format'
import ProductCard from '../components/ProductCard'
export function ContentPage() {
  const { slug } = useParams(), { data, loading, error } = useApi(`/content/pages/${encodeURIComponent(slug)}`)
  return <main className="page-shell content-page"><p className="eyebrow">AURELIA care</p><h1>{data?.title || 'Our care guide.'}</h1>{loading && <p>Loading...</p>}{error && <p className="form-error">{error}</p>}<div className="content-prose">{data?.content}</div></main>
}
export function Contact() {
  const location = useLocation(), action = emailAction(location.hash)
  const { settings } = useStore(), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e) { e.preventDefault(); const form = e.currentTarget; setBusy(true); try { const { data } = await api.post('/content/contact', Object.fromEntries(new FormData(form))); setMessage(data.message); form.reset() } catch(e) { setMessage(e.response?.data?.message || 'Unable to send message.') } finally { setBusy(false) } }
  if (action && ['newsletter-confirm','unsubscribe'].includes(action.kind)) return <EmailAction key={location.hash} {...action}/>
  return <main className="page-shell"><p className="eyebrow">We are here to help</p><h1>Contact us.</h1>{settings.contactEmail && <p>Email: <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></p>}<form className="checkout-form" onSubmit={submit}><label>Name<input name="name" required minLength={2} maxLength={100} /></label><label>Email<input type="email" name="email" required maxLength={254} /></label><label>Your message<textarea name="message" required minLength={10} maxLength={3000} /></label><button className="button button-dark" disabled={busy}>Send message</button><p role="status">{message}</p></form></main>
}
export function Collections() { const { collections } = useStore(); return <main className="page-shell"><p className="eyebrow">The AURELIA edit</p><h1>Our collections.</h1><div className="collection-grid">{collections.map(c => <Link className="collection-card" key={c.slug} to={`/collections/${c.slug}`}><h2>{c.name}</h2><p>{c.description}</p><span>Explore collection →</span></Link>)}</div>{!collections.length && <Link to="/shop">Explore all products →</Link>}</main> }
export function Collection() { const { slug } = useParams(), { data, loading, error } = useApi(`/content/collections/${encodeURIComponent(slug)}`); return <main className="page-shell"><p className="eyebrow">The AURELIA edit</p><h1>{data?.collection.name || 'Collection.'}</h1><p>{data?.collection.description}</p>{loading && <p>Loading collection...</p>}{error && <p className="form-error">{error}</p>}<div className="product-grid">{data?.products.map(p => <ProductCard key={p._id} product={toProduct(p)} />)}</div></main> }
