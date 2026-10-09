import { EMAIL_TEMPLATES } from '../../shared/email.mjs'
export const escapeHtml=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format((value || 0)/100)
const interpolate=(text,data)=>String(text).replace(/{{\s*([a-zA-Z]+)\s*}}/g,(_match,key)=>String(data[key] ?? ''))
export function renderEmail(kind,data,settings) {
  const template=kind==='newsletter_campaign' ? {subject:data.subject,body:data.body} : kind==='test' ? {subject:'AURELIA email test',body:'Your email configuration is working.'} : {...EMAIL_TEMPLATES[kind],...settings.templates?.[kind]}
  if(!template?.subject)throw new Error('Unknown email template')
  const values={...data,brandName:settings.fromName || 'AURELIA',trackingNumber:data.trackingNumber || 'Not provided',refundAmount:money(data.refundedPaise)}
  const subject=interpolate(template.subject,values).replace(/[\r\n]/g,' ').slice(0,200)
  let text=interpolate(template.body,values), blocks=[]
  blocks.push(`<p>${escapeHtml(text).replace(/\n/g,'<br>')}</p>`)
  if(kind==='contact_receipt' && data.contactMessage) {
    const details=`A copy of your message\nName: ${data.contactName || data.name || ''}\nEmail: ${data.contactEmail || ''}\n\n${data.contactMessage}`
    text+='\n\n'+details
    blocks.push(`<p>${escapeHtml(details).replace(/\n/g,'<br>')}</p>`)
  }
  if(data.orderNumber) {
    const rows=(data.items || []).map(item=>`${item.name} × ${item.quantity}: ${money(item.lineTotalPaise)}`)
    const payment=data.paymentMethod==='cod' && !['paid','refunded'].includes(data.paymentStatus) ? data.fulfillmentStatus==='cancelled' ? 'Cash on delivery — payment not collected' : 'Cash on delivery — payment due on delivery' : data.paymentStatus==='refunded' ? 'Refunded' : data.paymentStatus==='paid' ? 'Payment received' : 'Payment not completed'
    const details=[`Order: ${data.orderNumber}`,...rows,`Total: ${money(data.totalPaise)}`,payment,...(data.refundedPaise ? [`Refunded so far: ${money(data.refundedPaise)}`]:[])]
    text+='\n\n'+details.join('\n');blocks.push(`<p>${details.map(escapeHtml).join('<br>')}</p>`)
  }
  if(data.actionUrl) {
    const label=({password_reset:'Reset password',email_verification:'Verify email',newsletter_confirmation:'Confirm subscription',password_changed:'Secure your account'})[kind] || (data.orderNumber?'View order':'Visit store')
    text+=`\n\n${label}: ${data.actionUrl}`
    blocks.push(`<p><a href="${escapeHtml(data.actionUrl)}" style="display:inline-block;background:#20252d;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:4px">${label}</a></p><p style="font-size:12px">${escapeHtml(data.actionUrl)}</p>`)
  }
  if(settings.supportEmail){text+=`\n\nSupport: ${settings.supportEmail}`;blocks.push(`<p>Need help? ${escapeHtml(settings.supportEmail)}</p>`)}
  if(data.unsubscribeUrl){text+=`\n\nUnsubscribe: ${data.unsubscribeUrl}`;blocks.push(`<p><a href="${escapeHtml(data.unsubscribeUrl)}">Unsubscribe from our newsletter</a></p>`)}
  return {subject,text,html:`<!doctype html><html lang="en"><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#20252d"><main style="max-width:600px;margin:24px auto;padding:32px;background:#fff"><h1 style="font-size:22px;letter-spacing:3px">${escapeHtml(settings.fromName || 'AURELIA')}</h1>${blocks.join('')}</main></body></html>`}
}
