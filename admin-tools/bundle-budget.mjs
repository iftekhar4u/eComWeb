import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { root } from './run.mjs'
const dist = path.join(root, 'frontend/dist-admin')
const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'))
const entry = Object.values(manifest).find(value => value.isEntry)
if (!entry) throw new Error('Production entry missing. Run npm run build.')
const assets = new Set()
function visit(chunk) {
  assets.add(chunk.file)
  for (const css of chunk.css || []) assets.add(css)
  for (const name of chunk.imports || []) if (!assets.has(manifest[name].file)) visit(manifest[name])
}
visit(entry)
let initialJsGzip = 0, initialCssGzip = 0
for (const file of assets) {
  const size = gzipSync(await readFile(path.join(dist, file))).length
  if (file.endsWith('.js')) initialJsGzip += size
  if (file.endsWith('.css')) initialCssGzip += size
}
const chunks = await Promise.all((await readdir(path.join(dist, 'assets'))).filter(name => name.endsWith('.js')).map(async name => (await readFile(path.join(dist, 'assets', name))).length))
const result = { initialJsGzip, initialCssGzip, largestJsBytes: Math.max(...chunks), budgets: { initialJsGzip: 125000, initialCssGzip: 15000, largestJsBytes: 500000 } }
console.log(JSON.stringify(result, null, 2))
if (Object.entries(result.budgets).some(([key, max]) => result[key] > max)) { console.error('Bundle budget exceeded. Review new imports before deploying.'); process.exitCode = 1 }
