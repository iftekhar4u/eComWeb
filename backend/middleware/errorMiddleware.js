export function notFound(_req, res) { res.status(404).json({ message: 'Resource not found' }) }
export function errorHandler(error, _req, res, _next) {
  if (error.name === 'ZodError') return res.status(400).json({ message: error.issues?.map(i => `${i.path.join('.') || 'Request'}: ${i.message}`).join('; ') || 'Invalid request' })
  if (error.code === 11000) return res.status(409).json({ message: 'An entry with those details already exists. Refresh and try again.' })
  if (['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) return res.status(400).json({ message: 'Invalid field value. Check the submitted details.' })
  if (error.name === 'VersionError') return res.status(409).json({ message: 'This record changed. Refresh and try again.' })
  const status = Number.isInteger(error.status) ? error.status : 500
  if (status >= 500) console.error(JSON.stringify({ level: 'error', message: error.message, name: error.name }))
  res.status(status).json({ message: status === 500 ? 'Internal server error' : error.message, ...(/^[a-f0-9]{24}$/i.test(error.orderId || '') && { orderId: error.orderId }) })
}
