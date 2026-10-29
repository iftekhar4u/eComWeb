import mongoose from 'mongoose'
export function healthRoutes(app, { connection = mongoose.connection, now = Date.now } = {}) {
  let checkedAt = 0, healthy = false, pending
  app.get('/healthz', (_req, res) => res.set('Cache-Control', 'no-store').json({ status: 'ok' }))
  app.get('/readyz', async (_req, res) => {
    if (app.locals.shuttingDown || connection.readyState !== 1) return res.status(503).set('Cache-Control', 'no-store').json({ status: 'unavailable' })
    if (!checkedAt || now() - checkedAt > 2000) {
      pending ||= Promise.resolve().then(() => connection.db.admin().command({ ping: 1 }, { timeoutMS: 2000 }))
        .then(() => { healthy = true }, () => { healthy = false })
        .finally(() => { checkedAt = now(); pending = undefined })
      await pending
    }
    const ready = healthy && !app.locals.shuttingDown && connection.readyState === 1
    res.status(ready ? 200 : 503).set('Cache-Control', 'no-store').json({ status: ready ? 'ready' : 'unavailable' })
  })
}
