import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.admin.config.mjs'],{cwd:path.join(root,'frontend'),stdio:'inherit',env:process.env})
if(result.error)throw result.error
process.exit(result.status??1)
