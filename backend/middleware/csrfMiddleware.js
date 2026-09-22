import crypto from 'node:crypto'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function issueCsrfToken(req, res) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex')
  res.json({ csrfToken: req.session.csrfToken })
}

export function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next()
  const supplied = req.get('x-csrf-token')
  const expected = req.session?.csrfToken
  const suppliedBytes = Buffer.from(supplied || ''), expectedBytes = Buffer.from(expected || '')
  if (!supplied || !expected || suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) {
    return res.status(403).json({ message: 'Invalid CSRF token' })
  }
  next()
}
