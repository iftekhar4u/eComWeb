import '../auth-overrides.css'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function ForgotPassword() {
  const location=useLocation()
  const token=new URLSearchParams(location.hash.slice(1)).get('reset') || ''
  return <PasswordForm key={token || 'request'} token={token}/>
}
function PasswordForm({token}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[available,setAvailable]=useState(Boolean(token))
  const navigate=useNavigate(),{setUser,setMfaRequired}=useAuth()
  useEffect(()=>{if(token)return;const controller=new AbortController();api.get('/email/status',{signal:controller.signal}).then(({data})=>{setAvailable(data.passwordReset);if(!data.passwordReset)setNotice('Email password reset is currently unavailable. Please contact the store for help.')}).catch(e=>{if(e.code!=='ERR_CANCELED')setError('Unable to check email availability. Refresh the page to try again.')});return()=>controller.abort()},[token])
  async function submit(event){event.preventDefault();if(busy)return;setError('');if(token&&password!==confirm){setError('Passwords do not match.');return}setBusy(true);try{const {data}=await api.post(token?'/email/password/reset':'/email/password/request',token?{token,password}:{email});if(token){setUser(null);setMfaRequired(false);navigate('/login?passwordChanged=1',{replace:true})}else setNotice(data.message)}catch(e){setError(e.response?.data?.message || 'Unable to complete this request. Please try again.')}finally{setBusy(false)}}
  return <main className="auth-page"><section className="auth-panel auth-panel-centered"><Link className="wordmark" to="/">AURELIA<span>BOTANICAL BEAUTY</span></Link><p className="eyebrow">Account care</p><h1>{token?'Choose a new password.':'Reset your password.'}</h1><p className="auth-subtitle">{token?'Use at least 12 characters. Your existing sessions will be signed out.':'Enter your account email and we will send a secure reset link.'}</p><form className="auth-form" onSubmit={submit}>{token?<><label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} required/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label></>:<label>Email<input type="email" autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} required/></label>}{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<button className="button button-dark auth-submit" disabled={busy||!available}>{busy?'Please wait…':token?'Save new password':'Send reset link'}</button>{token&&<Link to="/forgot-password">Request a new reset link</Link>}<Link to="/contact">Contact the store</Link><p className="auth-switch"><Link to="/login">Back to sign in</Link></p></form></section></main>
}
