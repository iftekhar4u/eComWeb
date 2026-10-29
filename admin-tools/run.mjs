import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
export const root = fileURLToPath(new URL('../', import.meta.url))
export function requestChildShutdown(child, signal = 'SIGTERM') {
  if (process.platform !== 'win32' || !child.connected) return Promise.resolve(child.kill(signal))
  return new Promise((resolve, reject) => {
    child.send({ type: 'shutdown' }, error => error ? reject(error) : resolve(true))
  })
}
export function runNode(args, { directory = '', env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: path.join(root, directory), stdio: 'inherit', env: { ...process.env, ...env } })
    const stop = () => child.kill('SIGTERM')
    process.once('SIGINT', stop); process.once('SIGTERM', stop)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
      code === 0 ? resolve() : reject(new Error(`Command failed (${signal || code}): node ${args.join(' ')}`))
    })
  })
}
