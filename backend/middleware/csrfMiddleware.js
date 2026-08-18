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
  if (!supplied || !expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ message: 'Invalid CSRF token' })
  }
  next()
}
