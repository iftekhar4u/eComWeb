import { useRef, useState } from 'react'
import { api, money, date, message } from './studioApi'
export default function OrderPaymentActions({ order, details, reload }) {
  const [action,setAction] = useState(order.paymentMethod==='cod'?'collect':'refund'), [attemptId,setAttemptId] = useState(''), [amount,setAmount] = useState(''), [reason,setReason] = useState(''), [reference,setReference] = useState(''), [evidence,setEvidence] = useState(''), [password,setPassword] = useState(''), [status,setStatus] = useState('returning'), [inspected,setInspected] = useState(false), [busy,setBusy] = useState(false), [notice,setNotice] = useState('')
  const operation = useRef(null)
  async function submit(e) {
    e.preventDefault(); if(busy) return
    const body = action==='refund' ? {attemptId,amountPaise:Number(amount),reason} : action==='return' ? {status,inspected,evidence} : {amountPaise:Number(amount),reference,evidence}
    const fingerprint = JSON.stringify({action,...body})
    if(operation.current && operation.current.fingerprint!==fingerprint) {setNotice('This operation has an unresolved response. Refresh the order to review its records before changing parameters.');return}
    operation.current ||= {fingerprint,key:crypto.randomUUID()}
    setBusy(true);setNotice('')
    try {
      const path = action==='refund'?'refunds':action==='return'?'returns':`cod/${action}`
      await api.post(`/admin/orders/${order._id}/${path}`,{...body,operationKey:operation.current.key,currentPassword:password})
      setNotice(action==='refund'?'Refund request saved; provider processing continues in the worker.':'Evidence saved.');setPassword('');operation.current=null;reload()
    } catch(e) {setNotice(message(e))} finally {setBusy(false)}
  }
  return <section className="studio-card"><h2>Payment and refund operations</h2><p>Environment: {order.paymentEnvironment || 'unknown'} · Cancellation deadline: {order.cancellationDeadline?date(order.cancellationDeadline):'legacy order'}</p>
    {order.paymentMethod==='cod'&&<p>Collected: {money(order.codCollectedPaise)} · Remitted: {money(order.codRemittedPaise)} · Reimbursed: {money(order.codReimbursedPaise)}{order.legacyCollectionUnverified?' · Historical collection unverified':''}</p>}
    <p>Refunds pending: {money(order.refundPendingPaise)} · Processed: {money(order.refundedPaise)}</p>
    <h3>Payment attempts</h3>{details.attempts?.length?details.attempts.map(a=><p key={a._id}>{a.providerPaymentId} · {a.status} · {money(a.amountPaise)} · Refunded {money(a.refundedPaise)}</p>):<p>No verified provider attempts recorded.</p>}
    <h3>Refund history</h3>{details.refunds?.map(r=><p key={r._id}>{money(r.amountPaise)} · {r.status} · {r.providerRefundId || 'Provider reference pending'} · {r.reason}</p>)}
    <h3>Collection / return evidence</h3>{details.operations?.filter(o=>o.kind!=='cart_cleanup').map(o=><p key={o._id}>{date(o.createdAt)} · {o.kind} · {money(o.amountPaise)} · {o.reference || o.result} · {o.evidence}</p>)}
    <form className="studio-form" onSubmit={submit}><div className="admin-form-grid"><label>Action<select value={action} disabled={busy} onChange={e=>{setAction(e.target.value);operation.current=null}}>{order.paymentMethod==='razorpay'?<option value="refund">Request full or partial refund</option>:<><option value="collect">Record COD collection</option><option value="remit">Record courier remittance</option><option value="reimburse">Record COD reimbursement</option></>}<option value="return">Record return / failed delivery</option></select></label>
      {action==='refund'&&<><label>Captured payment<select required value={attemptId} onChange={e=>setAttemptId(e.target.value)}><option value="">Select payment</option>{details.attempts?.filter(a=>['captured','refunded'].includes(a.status)).map(a=><option key={a._id} value={a._id}>{a.providerPaymentId} — {money(a.amountPaise)}</option>)}</select></label><label>Refund reason<input required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label></>}
      {action!=='return'&&<label>Amount in paise (100 = ₹1)<input type="number" min="1" max="100000000" step="1" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
      {['collect','remit','reimburse'].includes(action)&&<label>Courier / bank reference<input required minLength={3} maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></label>}
      {action==='return'&&<><label>Return stage<select value={status} onChange={e=>setStatus(e.target.value)}>{['failed_delivery','refused','returning','received'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={inspected} onChange={e=>setInspected(e.target.checked)}/>Goods physically received and inspected</label></>}
      {action!=='refund'&&<label>Evidence / inspection notes<textarea required minLength={5} maxLength={500} value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>}
      <label>Current administrator password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label></div><button className="studio-primary" disabled={busy}>{busy?'Saving…':'Submit operation'}</button>{notice&&<p role="status">{notice}</p>}
      <p>Refund requests may remain pending; accepted creation does not prove bank credit. COD collection requires the full outstanding amount. Returns restore stock only after receipt and inspection.</p>
    </form></section>
}
