import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

export function emailAction(hash) {
  const params=new URLSearchParams(hash.replace(/^#/,''))
  for(const kind of ['verify','newsletter-confirm','unsubscribe'])if(params.has(kind))return {kind,token:params.get(kind)}
  return hash==='#resend'?{kind:'resend',token:''}:null
}
export function EmailAction({kind,token}) {
  const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[email,setEmail]=useState('')
  const {retryAuthCheck}=useAuth()
  const labels={verify:['Verify your email.','Confirm that this email address belongs to you.','Verify email'],resend:['Verify your email.','Enter your account email to request a fresh verification link.','Send verification link'],'newsletter-confirm':['Confirm your subscription.','Confirm that you want to receive AURELIA newsletters.','Confirm subscription'],unsubscribe:['Unsubscribe from newsletters.','You will stop receiving marketing emails. Order and account emails will continue.','Unsubscribe']}
  const [title,description,label]=labels[kind]
  async function submit(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const path={verify:'/verification/confirm',resend:'/verification/request','newsletter-confirm':'/newsletter/confirm',unsubscribe:'/newsletter/unsubscribe'}[kind];const {data}=await api.post('/email'+path,kind==='resend'?{email}:{token});setNotice(data.message);setDone(true);if(kind==='verify')void retryAuthCheck()}catch(e){setError(e.response?.data?.message || 'Unable to complete this request. Please try again.')}finally{setBusy(false)}}
  return <main className="auth-page"><section className="auth-panel auth-panel-centered"><Link className="wordmark" to="/">AURELIA<span>BOTANICAL BEAUTY</span></Link><p className="eyebrow">Account care</p><h1>{title}</h1><p className="auth-subtitle">{description}</p><form className="auth-form" onSubmit={submit}>{kind==='resend'&&<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={254} required/></label>}{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<button className="button button-dark auth-submit" disabled={busy||done}>{busy?'Please wait…':done?'Completed':label}</button>{kind==='verify'&&!done&&<Link to="/signup#resend">Request a new verification link</Link>}<Link to="/shop">Continue to the store</Link></form></section></main>
}
export function VerificationNotice({user}) {
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('')
  if(user.emailVerified)return null
  async function send(){setBusy(true);try{setNotice((await api.post('/email/verification/request',{email:user.email})).data.message)}catch(e){setNotice(e.response?.data?.message || 'Unable to request verification.')}finally{setBusy(false)}}
  return <section className="profile-summary"><div><h2>Email verification</h2><p>Confirm your email address to complete your account details.</p><button className="button button-dark" type="button" disabled={busy} onClick={send}>{busy?'Sending…':'Send verification email'}</button>{notice&&<p role="status">{notice}</p>}</div></section>
}
