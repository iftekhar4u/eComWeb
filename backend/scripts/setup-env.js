import fs from 'node:fs/promises'
import crypto from 'node:crypto'
const target = new URL('../.env', import.meta.url)
try { await fs.access(target); console.log('backend/.env already exists; no changes made.') }
catch { let template = await fs.readFile(new URL('../.env.example', import.meta.url), 'utf8'); template = template.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`).replace(/^MFA_ENCRYPTION_KEY=.*$/m, `MFA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`); await fs.writeFile(target, template, { flag: 'wx', mode: 0o600 }); console.log('Created backend/.env with private local secrets. Set your MongoDB URI and optional Razorpay keys in that file.') }
