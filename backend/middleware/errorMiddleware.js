export function notFound(_req, res) { res.status(404).json({ message: 'Resource not found' }) }
export function errorHandler(error, _req, res, _next) {
  if (error.name === 'ZodError') return res.status(400).json({ message: error.issues?.map(i => `${i.path.join('.') || 'Request'}: ${i.message}`).join('; ') || 'Invalid request' })
  if (error.code === 11000) return res.status(409).json({ message: 'An entry with those details already exists. Refresh and try again.' })
  if (['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) return res.status(400).json({ message: 'Invalid field value. Check the submitted details.' })
  if (error.name === 'VersionError') return res.status(409).json({ message: 'This record changed. Refresh and try again.' })
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500
  const production = _req.app?.locals?.config?.NODE_ENV === 'production'
  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', event: 'request_failed', status, requestId: _req.requestId }))
    if (_req.app?.locals?.config?.NODE_ENV === 'development') {
      console.error('Failed request:', _req.method, _req.path)
      console.error(error.stack)
    }
  }
  const message = status === 500 ? 'Internal server error' : production && status >= 500 ? 'Service temporarily unavailable. Please try again.' : error.message
  res.status(status).json({ message, ...(/^[a-f0-9]{24}$/i.test(error.orderId || '') && { orderId: error.orderId }) })
}
