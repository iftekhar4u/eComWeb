import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useStudio, money, date, message } from './studioApi'

const blankCredentials = { environment: 'sandbox', accountId: '', keyId: '', keySecret: '', webhookSecret: '', retirePreviousApi: false, oldWebhookDays: 7 }
export default function PaymentSettings() {
  const state = useStudio('/admin/payments/settings'), health = useStudio('/admin/payments/health')
  const [environment, setEnvironment] = useState('live'), [page, setPage] = useState(1), [view,setView] = useState('payments')
  const records = useStudio(`/admin/${view}?environment=${environment}&page=${page}`)
  const [notice,setNotice] = useState(''), [error,setError] = useState('')
  return <><header className="studio-heading"><div><h1>Payments</h1><p>Razorpay, cash on delivery and payment recovery</p></div></header>
    {state.error && <p role="alert" className="studio-error">{state.error}</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert" className="studio-error">{error}</p>}
    {state.data && <SettingsForm key={state.data.revision} settings={state.data} onSaved={() => { state.reload(); health.reload() }} onNotice={setNotice} onError={setError} />}
    <section className="studio-card"><h2>Recovery health</h2>{health.error && <p role="alert">{health.error}</p>}{health.data && <>
      <p>{health.data.workerHealthy ? 'Worker heartbeat received' : 'Worker heartbeat missing or overdue'} · {health.data.lastHeartbeatAt ? date(health.data.lastHeartbeatAt) : 'No heartbeat recorded'}</p>
      <p>Pending events: {health.data.events.length}. Failed/review refunds: {health.data.refunds.length}. Failed jobs: {health.data.jobs.length}. Showing up to 50 per category.</p>
      {['events','jobs','refunds'].map(group => <div key={group}><h3>{group}</h3>{health.data[group].map(item => <RecoveryRow key={item._id} item={item} kind={{events:'event',jobs:'job',refunds:'refund'}[group]} reload={health.reload} />)}</div>)}
    </>}<button onClick={health.reload}>Refresh health</button></section>
    <section className="studio-card"><h2>Payment records</h2><div className="studio-filters"><label>Records<select value={view} onChange={e => { setView(e.target.value); setPage(1) }}><option value="payments">Payments</option><option value="refunds">Refunds</option></select></label><label>Environment<select value={environment} onChange={e => { setEnvironment(e.target.value); setPage(1) }}><option value="live">Live</option><option value="sandbox">Test</option></select></label><button onClick={records.reload}>Refresh records</button></div>
      {records.error && <p role="alert">{records.error}</p>}<div className="studio-table-wrap"><table><thead><tr><th>Order</th><th>Amount</th><th>Status</th><th>Provider reference</th></tr></thead><tbody>{records.data?.items.map(item => <tr key={item._id}><td><Link to={`/admin/orders?detail=${item.order}`}>{String(item.order).slice(-8)}</Link></td><td>{money(item.amountPaise)}</td><td>{item.status}</td><td>{item.providerRefundId || item.providerPaymentId || item.providerOrderId || 'Awaiting provider'}</td></tr>)}</tbody></table></div>
      <div className="studio-pager"><button disabled={page <= 1} onClick={() => setPage(p=>p-1)}>Previous</button><span>Page {page} · {records.data?.total || 0} records</span><button disabled={!records.data || page*25 >= records.data.total} onClick={()=>setPage(p=>p+1)}>Next</button></div>
    </section></>
}
function SettingsForm({ settings, onSaved, onNotice, onError }) {
  const [policy,setPolicy] = useState(settings.policy), [credentials,setCredentials] = useState(blankCredentials), [editKeys,setEditKeys] = useState(false), [password,setPassword] = useState(''), [busy,setBusy] = useState(false)
  const update = (key,value) => setPolicy(p=>({...p,[key]:value}))
  async function submit(e) {
    e.preventDefault(); if(busy) return; setBusy(true); onError(''); onNotice('')
    try { await api.put('/admin/payments/settings', { revision: settings.revision, policy, currentPassword: password, ...(editKeys && {credentials}) }); setPassword(''); setCredentials(blankCredentials); onNotice('Payment settings saved. Existing orders retain their original payment context.'); onSaved() }
    catch(e) { onError(message(e)) } finally { setBusy(false) }
  }
  async function validate(profileId) {
    setBusy(true); onError('')
    try { const {data} = await api.post('/admin/payments/settings/validate',{profileId,currentPassword:password}); onNotice(data.message); onSaved() } catch(e) { onError(message(e)) } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="studio-card studio-form"><h2>Checkout and policy</h2>
    <p>Currency INR. Sales summaries show Live revenue. Test money is labelled separately. Razorpay methods also require merchant activation and device support.</p>
    <fieldset disabled={busy}><div className="admin-form-grid">
      <label>Active environment<select value={policy.activeMode} onChange={e=>update('activeMode',e.target.value)}><option value="sandbox">Test</option><option value="live">Live</option></select></label>
      {[['prepaidEnabled','Enable new online payments'],['codEnabled','Enable cash on delivery']].map(([key,label])=><label className="check-label" key={key}><input type="checkbox" checked={policy[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}
      {[['cancellationHours','Cancellation window (hours)',24,168],['reservationMinutes','Payment stock reservation (minutes)',5,120],['codMinPaise','COD minimum (paise)',0,100000000],['codMaxPaise','COD maximum (paise)',0,100000000],['codFeePaise','COD fee (paise)',0,100000000],['codMaxOpenOrders','Maximum open COD orders per customer',1,10],['retryLimit','Attempts before operator review',3,50],['reconcileSeconds','Pending payment check interval (seconds)',30,3600]].map(([key,label,min,max])=><label key={key}>{label}<input type="number" required min={min} max={max} step="1" value={policy[key]} onChange={e=>update(key,Number(e.target.value))}/></label>)}
    </div><p>100 paise = ₹1. The cancellation window is snapshotted for each order; dispatch is held until its deadline. Eligible pre-dispatch cancellation includes shipping and COD fees in the refund obligation.</p>
    <label>Eligible COD PIN codes (comma separated; blank allows all)<textarea value={policy.codPincodes.join(',')} onChange={e=>update('codPincodes',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}/></label>
    <label>Excluded COD SKUs (comma separated)<textarea value={policy.codExcludedSkus.join(',')} onChange={e=>update('codExcludedSkus',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}/></label>
    <h3>Checkout appearance</h3><div className="admin-form-grid">{[['storeName','Store name'],['logoUrl','HTTPS logo URL'],['supportEmail','Support email'],['supportPhone','Support phone']].map(([key,label])=><label key={key}>{label}<input value={policy[key]} onChange={e=>update(key,e.target.value)} maxLength={key==='logoUrl'?2048:254}/></label>)}<label>Accent colour<input type="color" value={policy.color} onChange={e=>update('color',e.target.value)}/></label></div>
    <div className="admin-form-grid">{Object.keys(policy.methods).map(method=><label className="check-label" key={method}><input type="checkbox" checked={policy.methods[method]} onChange={e=>update('methods',{...policy.methods,[method]:e.target.checked})}/>{method}</label>)}</div><p>These are Checkout display preferences. Enabled methods are ultimately controlled by Razorpay. UPI uses supported Intent/QR flows.</p>
    <h3>Credentials</h3>{!settings.encryptionReady && <p className="studio-error">Set PAYMENT_ENCRYPTION_KEY on the backend before saving credentials.</p>}
    <label className="check-label"><input type="checkbox" checked={editKeys} onChange={e=>setEditKeys(e.target.checked)}/>Add or rotate a credential profile</label>
    {editKeys && <div className="admin-form-grid"><label>Profile environment<select value={credentials.environment} onChange={e=>setCredentials({...credentials,environment:e.target.value})}><option value="sandbox">Test</option><option value="live">Live</option></select></label>
      {[['accountId','Merchant account ID (acc_…)'],['keyId','Key ID'],['keySecret','Key Secret'],['webhookSecret','Webhook Secret']].map(([key,label])=><label key={key}>{label}<input autoComplete="off" type={key.endsWith('Secret')?'password':'text'} required={!key.endsWith('Secret')} value={credentials[key]} onChange={e=>setCredentials({...credentials,[key]:e.target.value})} /></label>)}
      <label>Old webhook retry period (days)<input type="number" min="1" max="30" value={credentials.oldWebhookDays} onChange={e=>setCredentials({...credentials,oldWebhookDays:Number(e.target.value)})}/></label>
      <label className="check-label"><input type="checkbox" checked={credentials.retirePreviousApi} onChange={e=>setCredentials({...credentials,retirePreviousApi:e.target.checked})}/>Stop using the previous profile for API requests</label><p>Blank secrets retain the matching previous profile's value. Enter new secrets when changing a key/account. Retiring API use retains signature evidence for existing orders.</p></div>}
    <label>Current administrator password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <button className="studio-primary" disabled={busy}>{busy?'Saving…':'Save payment settings'}</button>
    </fieldset><h3>Webhook configuration</h3><p>Default endpoint: <code>{settings.webhookUrl}</code></p><p>Subscribe to: {settings.webhookEvents.join(', ')}.</p><p>Configure automatic capture in Razorpay. API credential validation makes a read-only request and does not charge a payment.</p>
    {settings.profiles.map(p=><section key={p.profileId} className="studio-notice"><strong>{p.environment==='sandbox'?'Test':'Live'} · {p.keyIdMasked} {p.active?'· active':''}</strong><p>Account: {p.accountId} · API access: {p.apiUsable?'enabled':'retired'}</p><p><code>{p.webhookUrl}</code></p><p>{p.validationResult || 'Not validated'} · Last webhook: {p.lastWebhookAt?date(p.lastWebhookAt):'not received'}</p><button type="button" disabled={busy||!password} onClick={()=>validate(p.profileId)}>Validate saved credentials</button></section>)}
  </form>
}
function RecoveryRow({ item, kind, reload }) {
  const [password,setPassword] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false)
  async function retry() { setBusy(true); try { const {data} = await api.post(`/admin/payments/jobs/${item._id}/retry`,{kind,currentPassword:password}); setNotice(data.message); setPassword(''); reload() } catch(e) { setNotice(message(e)) } finally { setBusy(false) } }
  return <div className="studio-notice"><p>{item.eventKind || item.notificationKind || item.kind || item.providerPaymentId} · {item.state || item.status} · {item.failureCode || 'Awaiting processing'}</p>{(item.state==='review'||item.status==='review')&&<><label>Administrator password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy||!password} onClick={retry}>Retry reconciliation</button></>}{item.status==='failed'&&<p>Open the order to create a new refund operation after reviewing the failed request.</p>}{notice&&<p role="status">{notice}</p>}</div>
}
