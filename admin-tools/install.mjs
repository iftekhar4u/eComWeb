import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const windows=process.platform==='win32'
const npm=windows?'cmd.exe':'npm'
const args=windows?['/d','/s','/c','npm ci']:['ci']
for(const directory of ['backend','frontend']) {
  console.log(`Installing ${directory} dependencies from the existing lockfile…`)
  const result=spawnSync(npm,args,{cwd:path.join(root,directory),stdio:'inherit'})
  if(result.error)throw result.error
  if(result.status!==0)process.exit(result.status||1)
}
console.log('Dependencies ready. Next: node admin-tools/setup.mjs')
