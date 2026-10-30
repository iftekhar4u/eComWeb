import { useState } from 'react'
import { api, useStudio, message } from './studioApi'

const base = '/admin-ready/integrations'
function Feedback({ error, notice }) { return <>{error && <p role="alert" className="studio-error">{error}</p>}{notice && <p role="status">{notice}</p>}</> }
function Password({ value, onChange }) { return <label>Current administrator password<input type="password" required autoComplete="current-password" maxLength={128} value={value} onChange={e => onChange(e.target.value)} /></label> }

export default function IntegrationSettings() {
  const state = useStudio(base)
  const [savedSettings, setSettings] = useState(null)
  const settings = savedSettings || state.data
  if (state.error) return <section className="studio-card"><h2>Integrations</h2><p role="alert" className="studio-error">{state.error}</p><button onClick={state.reload}>Reload integrations</button></section>
  if (!settings) return <section className="studio-card"><h2>Integrations</h2><p role="status">Loading integrations…</p></section>
  return <div className="ready-integrations"><WhatsAppSettings settings={settings} onSaved={setSettings} /><CloudSettings settings={settings} onSaved={setSettings} /><AtlasSettings settings={settings} onSaved={setSettings} /><p className="studio-caption">API keys, API secrets, and database credentials are never returned by these forms. Blank secret fields keep their saved values. If settings were changed elsewhere, reload this page before saving.</p></div>
}

function WhatsAppSettings({ settings, onSaved }) {
  const [form, setForm] = useState(settings.whatsapp)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { const { data } = await api.put(`${base}/whatsapp`, { ...form, revision: settings.revision }); onSaved(data.settings); setForm(data.settings.whatsapp); setNotice(data.message) }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <form className="studio-card studio-form" onSubmit={save}><h2>WhatsApp enquiries</h2><p>Visitors open a chat with your WhatsApp number and send their own enquiry. Click-to-chat does not need an API key.</p><label className="check-label"><input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />Show the WhatsApp button</label><div className="admin-form-grid"><label>WhatsApp number with country code<input type="tel" required={form.enabled} maxLength={30} placeholder="91 followed by your 10-digit number" value={form.phone} onChange={e => set('phone', e.target.value)} /></label><label>Button label<input required maxLength={80} value={form.label} onChange={e => set('label', e.target.value)} /></label></div><label>Pre-filled message<textarea rows={3} maxLength={1000} value={form.message} onChange={e => set('message', e.target.value)} /></label><label className="check-label"><input type="checkbox" checked={form.includePage} onChange={e => set('includePage', e.target.checked)} />Include the public product or catalog page link</label><Feedback error={error} notice={notice} /><button className="studio-primary" disabled={busy}>{busy ? 'Saving…' : 'Save WhatsApp settings'}</button></form>
}

function CloudSettings({ settings, onSaved }) {
  const saved = settings.cloudinary
  const credentialPlaceholder = saved.source === 'environment' ? 'Configured in backend environment — leave blank to keep' : 'Saved — leave blank to keep'
  const [form, setForm] = useState({ enabled: saved.enabled, cloudName: saved.cloudName, folder: saved.folder, apiKey: '', apiSecret: '' })
  const [currentPassword, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  async function run(test = false) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data } = await api[test ? 'post' : 'put'](`${base}/cloudinary${test ? '/test' : ''}`, { ...form, currentPassword, revision: settings.revision })
      if (data.settings) { onSaved(data.settings); setForm(f => ({ ...f, apiKey: '', apiSecret: '' })); setPassword('') }
      setNotice(data.message)
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <form className="studio-card studio-form" onSubmit={e => { e.preventDefault(); run() }}><h2>cloudinary images</h2><p>Upload product, gallery, category, article and homepage images from their existing editors.</p><label className="check-label"><input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />Enable cloudinary uploads</label><div className="admin-form-grid"><label>Cloud name<input required={form.enabled} maxLength={100} pattern="[A-Za-z0-9_-]+" value={form.cloudName} onChange={e => set('cloudName', e.target.value)} /></label><label>Upload folder<input required maxLength={100} value={form.folder} onChange={e => set('folder', e.target.value)} /></label><label>API key<input type="password" autoComplete="new-password" maxLength={4096} placeholder={saved.apiKeySaved ? credentialPlaceholder : 'Paste your API key'} value={form.apiKey} onChange={e => set('apiKey', e.target.value)} /></label><label>API secret<input type="password" autoComplete="new-password" maxLength={4096} placeholder={saved.apiSecretSaved ? credentialPlaceholder : 'Paste your API secret'} value={form.apiSecret} onChange={e => set('apiSecret', e.target.value)} /></label></div><Password value={currentPassword} onChange={setPassword} /><Feedback error={error} notice={notice} /><div className="admin-actions"><button type="button" disabled={busy || !currentPassword} onClick={() => run(true)}>Test cloudinary connection</button><button className="studio-primary" disabled={busy}>{busy ? 'Checking…' : 'Save cloudinary settings'}</button></div></form>
}

function DatabaseStatus() {
  const state = useStudio(`${base}/mongodb/status`)
  const data = state.data
  return <fieldset>
    <legend>Running database</legend>
    {state.loading && <p role="status">Reading the database used by this backend…</p>}
    {state.error && <p role="alert" className="studio-error">{state.error}</p>}
    {data && <>
      <p role="status"><strong>{data.connected ? (data.atlas ? 'Connected to Atlas' : 'Connected to MongoDB') : 'Database disconnected'}</strong></p>
      <p><strong>Host:</strong> <code>{data.host || 'Unavailable'}</code><br /><strong>Database:</strong> <code>{data.database || 'Unavailable'}</code></p>
      {data.connected ? <>
        <p><strong>Products saved:</strong> {data.productCount}</p>
        {data.latestProduct ? <>
          <p><strong>Most recently updated product:</strong> {data.latestProduct.name}<br /><strong>Slug:</strong> <code>{data.latestProduct.slug}</code><br /><strong>Document ID:</strong> <code>{data.latestProduct.id}</code>{data.latestProduct.updatedAt && <><br /><strong>Updated:</strong> {new Date(data.latestProduct.updatedAt).toLocaleString()}</>}</p>
          <p>After saving a product, refresh this status. To confirm it in Atlas, open this database's <code>products</code> collection and search for the same slug.</p>
        </> : <p>No products were found in this database.</p>}
      </> : <p className="studio-error">{data.message}</p>}
      <small>Checked: {new Date(data.checkedAt).toLocaleString()}</small>
    </>}
    <div className="admin-actions"><button type="button" disabled={state.loading} onClick={state.reload}>Refresh database status</button></div>
  </fieldset>
}

function AtlasSettings({ settings, onSaved }) {
  const saved = settings.mongodb
  const [uri, setUri] = useState(''), [currentPassword, setPassword] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  async function run(action) {
    if (busy) return
    if (action === 'use-environment' && !window.confirm('Select the original backend .env database for the next restart? Any writes made to Atlas must be reconciled before switching back.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = { revision: settings.revision, currentPassword, ...(['save', 'test'].includes(action) ? { uri } : { confirmMigration: confirmed }) }
      const { data } = await api[action === 'save' ? 'put' : 'post'](`${base}/mongodb${action === 'save' ? '' : `/${action}`}`, payload)
      if (data.settings) { onSaved(data.settings); setUri(''); setPassword(''); setConfirmed(false) }
      setNotice(data.message)
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <form className="studio-card studio-form" onSubmit={e => { e.preventDefault(); run('save') }}><h2>MongoDB Atlas</h2><p>Once Atlas is connected, successful admin saves go directly to it. Copying existing local data is a separate, one-time step.</p><DatabaseStatus /><p><strong>Next restart:</strong> {saved.atlasSelected && !saved.recoveryOverride ? 'Selected Atlas connection' : 'Backend .env database'}</p>{saved.restartRequired && <p className="studio-notice" role="status">A database change is pending. Restart the backend to apply it.</p>}{saved.recoveryOverride && <p className="studio-notice">Database recovery override is enabled. Remove it from the backend environment and restart before selecting Atlas.</p>}<label>Atlas connection URI<input type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} placeholder={saved.uriSaved ? 'Saved — leave blank to keep' : 'mongodb+srv://username:password@cluster.mongodb.net/aurelia'} value={uri} onChange={e => setUri(e.target.value)} /></label><small>Include your application database name. Percent-encode special characters in the username/password. The saved URI remains hidden.</small><Password value={currentPassword} onChange={setPassword} /><div className="admin-actions"><button type="button" disabled={busy || !currentPassword} onClick={() => run('test')}>Test Atlas connection</button><button className="studio-primary" disabled={busy}>{busy ? 'Checking…' : 'Save Atlas credentials'}</button></div><p>Saving credentials does not copy data. Follow README_INTEGRATIONS.md for the backup, copy, and verification commands before switching. The current administrator must already exist in Atlas.</p><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />My backup and data copy are verified, and customer access is closed for the switch.</label><div className="admin-actions"><button type="button" disabled={busy || !saved.uriSaved || !confirmed || !currentPassword || Boolean(uri) || saved.recoveryOverride} onClick={() => run('activate')}>Select saved Atlas for next restart</button><button type="button" disabled={busy || !currentPassword || !saved.atlasSelected} onClick={() => run('use-environment')}>Use .env database on next restart</button></div>{uri && <small>Save this URI before selecting it for the next restart.</small>}<Feedback error={error} notice={notice} /></form>
}
