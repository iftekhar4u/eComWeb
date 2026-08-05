import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FiAlertCircle, FiCheck, FiChevronRight, FiEdit3, FiHeart, FiLock, FiLogOut, FiRefreshCw, FiUser } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'

const previewUser = { id: 'preview-user', name: 'Mira Kapoor', email: 'mira.kapoor@example.com', status: 'active', mfaEnabled: false }
const unavailableItems = new Set(['orders', 'addresses', 'security'])

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
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', phone: '' })

  useEffect(() => {
    setForm({ name: user.name || '', email: user.email || '', phone: '' })
  }, [user.email, user.name])

  const initials = getInitials(user.name)
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const cancelEditing = () => {
    setForm({ name: user.name || '', email: user.email || '', phone: '' })
    setFormError('')
    setEditing(false)
  }
  const handleSubmit = (event) => {
    event.preventDefault()
    if (form.name.trim().length < 2) {
      setFormError('Please enter your full name.')
      return
    }
    setFormError(preview ? 'Preview edits are temporary and are not saved to an account.' : 'Profile saving is unavailable until a secure profile update endpoint is added.')
  }
  const handleSignOut = async () => {
    if (preview) return
    setSigningOut(true)
    try {
      await logout()
      navigate('/login')
    } finally {
      setSigningOut(false)
    }
  }

  return <>
    <Helmet><title>My account | AURELIA</title><meta name="description" content="Manage your Aurelia account details and beauty favourites." /></Helmet>
    <main className="profile-page">
      <div className="profile-wrap">
        <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><FiChevronRight aria-hidden="true" /><span>My Account</span></nav>
        <section className="profile-welcome" aria-labelledby="profile-title">
          <div><p className="eyebrow">MY AURELIA</p><h1 id="profile-title">Your personal beauty space.</h1><p>Manage your details and explore your favourites.</p></div>
          {preview && <div className="preview-badge"><FiAlertCircle /> Development preview</div>}
        </section>
        {preview && <div className="preview-notice" role="note"><FiAlertCircle /><span><strong>Preview mode.</strong> This is synthetic customer data. Changes are temporary and are not saved to an account.</span></div>}
        <div className="profile-layout">
          <AccountNavigation preview={preview} signingOut={signingOut} onSignOut={handleSignOut} />
          <div className="profile-content">
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
                {editing && <div className="profile-form-actions"><button className="button button-dark" type="submit" disabled>{preview ? 'Save changes' : 'Save changes'}</button><button className="button button-light" type="button" onClick={cancelEditing}>Cancel</button></div>}
                {!editing && <p className="profile-save-note">Profile saving is currently unavailable. Your account data remains read-only until the secure update flow is available.</p>}
              </form>
            </section>
            <section className="profile-section security-section" aria-labelledby="security-title">
              <div className="profile-section-heading"><div><p className="eyebrow">Keep it secure</p><h2 id="security-title">Account &amp; security</h2></div><FiLock aria-hidden="true" /></div>
              <div className="security-links"><Link to="/forgot-password"><span><strong>Password</strong><small>Reset your password securely</small></span><FiChevronRight /></Link><button type="button" disabled title="Google connection status is not available in the current account response"><span><strong>Google account</strong><small>Connection status unavailable</small></span><FiChevronRight /></button></div>
            </section>
          </div>
        </div>
      </div>
    </main>
  </>
}

function AccountNavigation({ preview, signingOut, onSignOut }) {
  const items = [{ id: 'profile', label: 'Profile Details', icon: FiUser }, { id: 'orders', label: 'My Orders' }, { id: 'addresses', label: 'Saved Addresses' }, { id: 'wishlist', label: 'Wishlist', icon: FiHeart, to: '/wishlist' }, { id: 'security', label: 'Account & Security' }]
  return <aside className="account-nav" aria-label="Account navigation"><p className="eyebrow">My account</p>{items.map(({ id, label, icon: Icon, to }) => unavailableItems.has(id) ? <span className="account-nav-link is-disabled" aria-disabled="true" key={id}>{Icon && <Icon />}{label}<small>Unavailable</small></span> : <Link className={`account-nav-link${id === 'profile' ? ' is-active' : ''}`} to={to || '/profile'} key={id}>{Icon && <Icon />}{label}{id === 'profile' && <FiChevronRight />}</Link>)}<button className="account-nav-link account-signout" type="button" onClick={onSignOut} disabled={preview || signingOut}><FiLogOut />{preview ? 'Sign out unavailable' : signingOut ? 'Signing out...' : 'Sign out'}</button></aside>
}

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AU'
}
