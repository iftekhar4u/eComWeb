import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),target=path.join(root,'backend/.env')
try{
  await fs.access(target)
  console.log('Existing backend/.env preserved. Keep its SESSION_SECRET, MFA_ENCRYPTION_KEY and database URI. Add optional ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD only if you need a NEW admin account.')
}catch(e){
  if(e.code!=='ENOENT')throw e
  let template=await fs.readFile(path.join(root,'backend/.env.example'),'utf8')
  template=template.replace(/^SESSION_SECRET=.*$/m,`SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`).replace(/^MFA_ENCRYPTION_KEY=.*$/m,`MFA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`)
  template+='\n# Optional: only creates a NEW administrator; existing passwords/accounts are preserved.\nADMIN_NAME=\nADMIN_EMAIL=\nADMIN_PASSWORD=\n'
  await fs.writeFile(target,template,{flag:'wx',mode:0o600})
  console.log('backend/.env is ready with unique local secrets. Fill your MongoDB URI and optional new-admin details. Do not commit this file.')
}
