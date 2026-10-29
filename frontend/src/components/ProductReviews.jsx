import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useApi from '../hooks/useApi'
import api from '../services/api'
export default function ProductReviews({ productId }) {
  const { user } = useAuth(); const { data, reload } = useApi(`/content/reviews/${productId}`)
  const [rating, setRating] = useState('5'), [comment, setComment] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e) { e.preventDefault(); setBusy(true); try { const { data } = await api.post(`/content/reviews/${productId}`, { rating: Number(rating), comment }); setMessage(data.message); setComment(''); reload() } catch (e) { setMessage(e.response?.data?.message || 'Unable to save review.') } finally { setBusy(false) } }
  return <section className="customer-reviews"><h2>Customer reviews</h2>{data?.reviews.map(r => <article key={r.id}><p className="review-stars">{'★'.repeat(r.rating)}</p><p>{r.comment}</p><small>{r.name}</small></article>)}{!data?.reviews.length && <p>Be the first to share your experience.</p>}{user ? <form className="checkout-form" onSubmit={submit}><label>Rating<select value={rating} onChange={e => setRating(e.target.value)}>{[5,4,3,2,1].map(n => <option key={n}>{n}</option>)}</select></label><label>Your review<textarea value={comment} onChange={e => setComment(e.target.value)} required minLength={10} maxLength={3000} /></label><button className="button button-dark" disabled={busy}>Submit review</button><p role="status">{message}</p></form> : <Link to="/login">Sign in to leave a review</Link>}</section>
}
