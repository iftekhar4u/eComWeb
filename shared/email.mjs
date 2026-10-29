// Plain-text templates. Links and order details are added by the server.
export const EMAIL_TEMPLATES = {
  password_reset: { label: 'Password reset', subject: 'Reset your {{brandName}} password', body: 'Hi {{name}},\nUse the secure link below to choose a new password. This link expires in 30 minutes. If you did not request this, you can ignore this email.' },
  email_verification: { label: 'Signup verification', subject: 'Verify your email for {{brandName}}', body: 'Hi {{name}},\nPlease confirm your email address using the link below. The link expires in 24 hours.' },
  welcome: { label: 'Welcome', subject: 'Welcome to {{brandName}}', body: 'Hi {{name}},\nYour email is verified. Welcome to our store, and thank you for joining us.' },
  order_confirmation: { label: 'Order confirmation', subject: 'Order {{orderNumber}} confirmed', body: 'Hi {{name}},\nWe have confirmed your order. Thank you for shopping with {{brandName}}.' },
  shipped: { label: 'Order shipped', subject: 'Your order {{orderNumber}} has shipped', body: 'Hi {{name}},\nYour order is on its way. Tracking number: {{trackingNumber}}.' },
  delivered: { label: 'Order delivered', subject: 'Your order {{orderNumber}} was delivered', body: 'Hi {{name}},\nYour order has been marked as delivered. Contact us if you need any help.' },
  cancelled: { label: 'Order cancelled', subject: 'Order {{orderNumber}} cancelled', body: 'Hi {{name}},\nYour order has been cancelled. Any payment or refund details are shown below.' },
  refund: { label: 'Refund update', subject: 'Refund update for {{orderNumber}}', body: 'Hi {{name}},\nA refund update has been confirmed for your order. Total refunded so far: {{refundAmount}}. Your bank may take additional time to show the credit.' },
  password_changed: { label: 'Password changed alert', subject: 'Your {{brandName}} password was changed', body: 'Hi {{name}},\nYour account password was changed. If this was not you, reset your password and contact our support team immediately.' },
  contact_admin: { label: 'Contact form: team notification', subject: 'New message from {{contactName}}', body: 'A customer has contacted the store.\nName: {{contactName}}\nEmail: {{contactEmail}}\n\n{{contactMessage}}' },
  contact_receipt: { label: 'Contact form: customer receipt', subject: 'We received your message', body: 'Hi {{name}},\nThank you for contacting {{brandName}}. Our team has received your message and will get back to you.' },
  newsletter_confirmation: { label: 'Newsletter confirmation', subject: 'Confirm your {{brandName}} subscription', body: 'Please confirm that you want to receive our newsletter. If you did not subscribe, you can ignore this email. The link expires in 24 hours.' },
  newsletter_welcome: { label: 'Newsletter welcome', subject: 'You are on the {{brandName}} list', body: 'Thank you for confirming your subscription. You can unsubscribe at any time using the link below.' },
}
export const EMAIL_KINDS = [...Object.keys(EMAIL_TEMPLATES), 'newsletter_campaign', 'test']
export const TEMPLATE_VARIABLES = ['name','brandName','orderNumber','trackingNumber','refundAmount','contactName','contactEmail','contactMessage']
