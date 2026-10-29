import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const windows=process.platform==='win32'
const npm=windows?'cmd.exe':'npm'
const args=windows?['/d','/s','/c','npm ci --include=dev']:['ci','--include=dev']
for(const directory of ['.','backend','frontend']) {
  console.log(`Installing ${directory} dependencies from the existing lockfile…`)
  const result=spawnSync(npm,args,{cwd:path.join(root,directory),stdio:'inherit',env:{...process.env,MONGOMS_DISABLE_POSTINSTALL:'1'}})
  if(result.error)throw result.error
  if(result.status!==0)process.exit(result.status||1)
}
console.log('Dependencies ready. Preserve existing backend/.env and private settings. New local setup: npm run setup. Production: docs/DEPLOYMENT.md.')
