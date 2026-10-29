export function configureHttpServer(server) {
  server.requestTimeout = 60000
  server.headersTimeout = 15000
  server.keepAliveTimeout = 65000
  server.maxRequestsPerSocket = 1000
}
export function installShutdown({ server, app, stopWorkers, disconnect, timeoutMs = 25000 }) {
  let closing
  const shutdown = (exitCode = 0) => {
    if (closing) return closing
    app.locals.shuttingDown = true
    const deadline = setTimeout(() => {
      console.error(JSON.stringify({ level: 'error', event: 'shutdown_timeout' }))
      server.closeAllConnections()
      process.exit(1)
    }, timeoutMs)
    deadline.unref()
    closing = (async () => {
      const drained = new Promise(resolve => server.close(resolve))
      server.closeIdleConnections()
      await Promise.all([drained, ...stopWorkers.map(stop => stop())])
      await app.locals.sessionStore?.close?.()
      await disconnect()
      clearTimeout(deadline)
      process.exitCode = exitCode
    })().catch(() => {
      console.error(JSON.stringify({ level: 'error', event: 'shutdown_failed' }))
      process.exitCode = 1
    })
    return closing
  }
  const shutdownAndDisconnect = () => {
    const operation = shutdown()
    if (typeof process.send === 'function') {
      void operation.finally(() => {
        if (process.connected) process.disconnect()
      })
    }
  }
  process.once('SIGTERM', shutdownAndDisconnect)
  process.once('SIGINT', shutdownAndDisconnect)
  if (typeof process.send === 'function') {
    process.on('message', message => {
      if (message?.type === 'shutdown') shutdownAndDisconnect()
    })
  }
  return shutdown
}
