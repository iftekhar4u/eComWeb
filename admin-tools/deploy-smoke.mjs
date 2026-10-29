const origin = new URL(process.argv[2] || 'http://127.0.0.1:5000')
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Supply an origin, e.g. https://shop.example.com')
for (const [path, expected] of [['/healthz', 200], ['/readyz', 200], ['/api/health', 200], ['/api/does-not-exist', 404], ['/', 200], ['/admin', 200]]) {
  const response = await fetch(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}`)
  if (!response.headers.get('x-content-type-options')) throw new Error(`${path}: security headers missing`)
  if (path.startsWith('/api') && !response.headers.get('content-type')?.includes('application/json')) throw new Error(`${path}: JSON expected`)
  console.log(`PASS ${path} (${response.status})`)
}
console.log('Read-only smoke passed. Complete the provider/account checks in docs/DEPLOYMENT.md before accepting real orders.')
