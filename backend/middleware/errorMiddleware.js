export function notFound(_req, res) {
  res.status(404).json({ message: 'Resource not found' })
}

export function errorHandler(error, _req, res, _next) {
  if (error.name === 'ZodError') return res.status(400).json({ message: 'Invalid request' })
  const status = Number.isInteger(error.status) ? error.status : 500
  if (status >= 500) console.error(JSON.stringify({ level: 'error', message: error.message, name: error.name }))
  res.status(status).json({ message: status >= 500 ? 'Internal server error' : error.message })
}
