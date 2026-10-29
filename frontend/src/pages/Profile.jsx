import '../profile.css'
import { VerificationNotice } from '../email/EmailActions'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FiAlertCircle, FiCheck, FiChevronRight, FiEdit3, FiHeart, FiLock, FiLogOut, FiRefreshCw, FiUser } from 'react-icons/fi'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const previewUser = { id: 'preview-user', name: 'Mira Kapoor', email: 'mira.kapoor@example.com', status: 'active', mfaEnabled: false }
const unavailableItems = new Set()

export default function Profile() {
  const { user, loading, authCheckError, retryAuthCheck } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !authCheckError && !user) {
      const returnTo = `${location.pathname}${location.search}`
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
    }
  }, [authCheckError, loading, location.pathname, location.search, navigate, user])

  if (loading) return <ProfileStatus icon={<FiRefreshCw />} label="Checking your account..." />
  if (authCheckError) return <ProfileStatus icon={<FiAlertCircle />} label={authCheckError} action={<button className="button button-dark" type="button" onClick={retryAuthCheck}>Try again</button>} />
  if (!user) return null
  return <ProfileView user={user} />
}

export function ProfilePreview() {
  return <ProfileView user={previewUser} preview />
}

function ProfileStatus({ icon, label, action }) {
  return <main className="profile-page profile-status"><div className="profile-status-icon" aria-hidden="true">{icon}</div><p className="eyebrow">MY AURELIA</p><h1>{label}</h1>{action}</main>
}

function ProfileView({ user, preview = false }) {
  const { logout, setUser } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', phone: user.phone || '' })

  useEffect(() => {
    setForm({ name: user.name || '', email: user.email || '', phone: user.phone || '' })
  }, [user.email, user.name, user.phone])

  const initials = getInitials(user.name)
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const cancelEditing = () => {
    setForm({ name: user.name || '', email: user.email || '', phone: user.phone || '' })
    setFormError('')
    setEditing(false)
  }
  const handleSubmit = async (event) => {
    event.preventDefault()
    if (form.name.trim().length < 2) {
      setFormError('Please enter your full name.')
      return
    }
    if (preview) { setFormError('Preview edits are temporary.'); return }
    try { const { data } = await api.patch('/auth/me', { name: form.name.trim(), phone: form.phone }); setUser(data.user); setEditing(false); setFormError('') } catch(e) { setFormError(e.response?.data?.message || 'Unable to update profile.') }
  }
  const handleSignOut = async () => {
    if (preview) return
    setSigningOut(true)
    try {
      await logout()
      navigate('/login')
    } catch (error) { setFormError(error.response?.data?.message || 'Unable to sign out. Please try again.') } finally {
      setSigningOut(false)
    }
  }

  return <>
    
    <main className="profile-page">
      <div className="profile-wrap">
        <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><FiChevronRight aria-hidden="true" /><span>My Account</span></nav>
        <section className="profile-welcome" aria-labelledby="profile-title">
          <div><p className="eyebrow">MY AURELIA</p><h1 id="profile-title">Your personal beauty space.</h1><p>Manage your details and explore your favourites.</p></div>
          {preview && <div className="preview-badge"><FiAlertCircle /> Development preview</div>}
        </section>
        {preview && <div className="preview-notice" role="note"><FiAlertCircle /><span><strong>Preview mode.</strong> This is synthetic customer data. Changes are temporary and are not saved to an account.</span></div>}
        <div className="profile-layout">
          <AccountNavigation admin={user.role === 'admin'} preview={preview} signingOut={signingOut} onSignOut={handleSignOut} />
          <div className="profile-content">
            {!preview && <VerificationNotice user={user}/>}
            <section className="profile-summary" aria-labelledby="summary-title">
              <div className="profile-avatar" aria-hidden="true">{initials}</div>
              <div><p className="eyebrow">Your account</p><h2 id="summary-title">{user.name}</h2><p>{user.email}</p><span className="account-status"><FiCheck /> Account active</span></div>
            </section>
            <section className="profile-section" aria-labelledby="personal-title">
              <div className="profile-section-heading"><div><p className="eyebrow">Your details</p><h2 id="personal-title">Personal information</h2></div>{!editing && <button className="profile-text-button" type="button" onClick={() => { setEditing(true); setFormError('') }}><FiEdit3 /> Edit</button>}</div>
              <form className="profile-form" onSubmit={handleSubmit} noValidate>
                <label htmlFor="profile-name">Full name<input id="profile-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} readOnly={!editing} aria-invalid={Boolean(formError && form.name.trim().length < 2)} /></label>
                <label htmlFor="profile-email">Email address<input id="profile-email" type="email" value={form.email} readOnly aria-describedby="email-note" /><small id="email-note">Email changes require a secure verification flow.</small></label>
                <label htmlFor="profile-phone">Phone number <span>(optional)</span><input id="profile-phone" type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} readOnly={!editing} /></label>
                {formError && <p className="profile-feedback profile-feedback-error" role="alert"><FiAlertCircle />{formError}</p>}
                {editing && <div className="profile-form-actions"><button className="button button-dark" type="submit">{preview ? 'Save changes' : 'Save changes'}</button><button className="button button-light" type="button" onClick={cancelEditing}>Cancel</button></div>}
                {!editing && <p className="profile-save-note">Your account details are saved securely. Select Edit to update your name or phone number.</p>}
              </form>
            </section>
            <section id="security" className="profile-section security-section" aria-labelledby="security-title">
              <div className="profile-section-heading"><div><p className="eyebrow">Keep it secure</p><h2 id="security-title">Account &amp; security</h2></div><FiLock aria-hidden="true" /></div>
              <div className="security-links"><a href="#password-change"><span><strong>Password</strong><small>Change your account password</small></span><FiChevronRight /></a><div><span><strong>Google account</strong><small>{user.googleLinked ? "Connected" : "Not connected"}</small></span></div></div>
            </section>
            {!preview && <><SavedAddresses /><PasswordChange /></>}
          </div>
        </div>
      </div>
    </main>
  </>
}

function AccountNavigation({ admin, preview, signingOut, onSignOut }) {
  const items = [{ id: 'profile', label: 'Profile Details', icon: FiUser }, { id: 'orders', label: 'My Orders', to: '/orders' }, { id: 'addresses', label: 'Saved Addresses', to: '/profile#addresses' }, { id: 'wishlist', label: 'Wishlist', icon: FiHeart, to: '/wishlist' }, { id: 'security', label: 'Account & Security', to: '/profile#security' }]
  return <aside className="account-nav" aria-label="Account navigation"><p className="eyebrow">My account</p>{items.map(({ id, label, icon: Icon, to }) => unavailableItems.has(id) ? <span className="account-nav-link is-disabled" aria-disabled="true" key={id}>{Icon && <Icon />}{label}<small>Unavailable</small></span> : <Link className={`account-nav-link${id === 'profile' ? ' is-active' : ''}`} to={to || '/profile'} key={id}>{Icon && <Icon />}{label}{id === 'profile' && <FiChevronRight />}</Link>)}{admin && <Link className="account-nav-link" to="/admin">Store administration</Link>}<button className="account-nav-link account-signout" type="button" onClick={onSignOut} disabled={preview || signingOut}><FiLogOut />{preview ? 'Sign out unavailable' : signingOut ? 'Signing out...' : 'Sign out'}</button></aside>
}

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AU'
}

function SavedAddresses() {
  const empty = { name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'IN' }
  const [addresses, setAddresses] = useState([]), [form, setForm] = useState(empty), [adding, setAdding] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { let active = true; api.get('/auth/addresses').then(({data}) => { if (active) setAddresses(data.addresses) }).catch(() => { if (active) setMessage('Unable to load saved addresses.') }); return () => { active = false } }, [])
  async function save(e) { e.preventDefault(); setBusy(true); setMessage(''); try { const {data} = await api.post('/auth/addresses',form); setAddresses(data.addresses); setForm(empty); setAdding(false) } catch(e) { setMessage(e.response?.data?.message || 'Unable to save address.') } finally { setBusy(false) } }
  async function remove(id) { setBusy(true); setMessage(''); try { const {data} = await api.delete(`/auth/addresses/${id}`); setAddresses(data.addresses) } catch(e) { setMessage(e.response?.data?.message || 'Unable to remove address.') } finally { setBusy(false) } }
  return <section className="profile-section" id="addresses"><div className="profile-section-heading"><h2>Saved addresses</h2><button className="profile-text-button" disabled={busy} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add address'}</button></div>{addresses.map(a => <div className="saved-address" key={a._id}><strong>{a.name}</strong><p>{a.line1} {a.line2}<br />{a.city}, {a.state} – {a.postalCode}<br />{a.phone}</p><button className="remove-button" disabled={busy} onClick={() => remove(a._id)}>Remove</button></div>)}{!addresses.length && !adding && <p>No saved addresses yet.</p>}{adding && <form className="profile-form" onSubmit={save}>{[['name','Full name'],['phone','Mobile number'],['line1','Address'],['line2','Apartment / landmark (optional)'],['city','City'],['state','State'],['postalCode','PIN code']].map(([key,label]) => <label key={key}>{label}<input value={form[key]} onChange={e => setForm({...form,[key]:e.target.value})} required={key !== 'line2'} maxLength={key === 'postalCode' ? 6 : 200} pattern={key === 'postalCode' ? '[1-9][0-9]{5}' : key === 'phone' ? '([+]91)?[6-9][0-9]{9}' : undefined} /></label>)}<button className="button button-dark" disabled={busy}>Save address</button></form>}<p role="status">{message}</p></section>
}
function PasswordChange() {
  const { setUser } = useAuth(), navigate = useNavigate()
  const [currentPassword,setCurrent] = useState(''), [newPassword,setNew] = useState(''), [message,setMessage] = useState(''), [busy,setBusy] = useState(false)
  async function submit(e) { e.preventDefault(); setBusy(true); setMessage(''); try { await api.post('/auth/password',{currentPassword,newPassword}); setUser(null); navigate('/login?passwordChanged=1') } catch(e) { setMessage(e.response?.data?.message || 'Unable to change password.') } finally { setBusy(false) } }
  return <section className="profile-section" id="password-change"><h2>Change password</h2><form className="profile-form" onSubmit={submit}><label>Current password<input type="password" value={currentPassword} onChange={e=>setCurrent(e.target.value)} autoComplete="current-password" required maxLength={128}/></label><label>New password<input type="password" value={newPassword} onChange={e=>setNew(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={128}/></label><button className="button button-dark" disabled={busy}>Change password</button></form><p role="status">{message}</p><small>Other sessions will be signed out. Google-only accounts manage passwords through Google.</small></section>
}
