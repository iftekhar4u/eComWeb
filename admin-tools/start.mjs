import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {readFileSync} from 'node:fs'
import dotenv from '../backend/node_modules/dotenv/lib/main.js'
import {requestChildShutdown} from './run.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const settings=dotenv.parse(readFileSync(path.join(root,'backend/.env')))
const backendPort=process.env.PORT||settings.PORT||'5000'
const children=[
 spawn(process.execPath,['--watch','server.js'],{cwd:path.join(root,'backend'),stdio:['inherit','inherit','inherit','ipc'],env:process.env}),
 spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','vite.admin.config.mjs'],{cwd:path.join(root,'frontend'),stdio:'inherit',env:{...process.env,VITE_BACKEND_URL:process.env.VITE_BACKEND_URL||`http://127.0.0.1:${backendPort}`}})
]
let stopping=false
const stop=()=>{if(stopping)return;stopping=true;void requestChildShutdown(children[0]).catch(error=>{console.error(`Unable to request graceful backend shutdown: ${error.message}`);process.exitCode=1});children[1].kill('SIGTERM')}
for(const child of children){child.on('error',e=>{console.error(e.message);process.exitCode=1;stop()});child.on('exit',code=>{if(!stopping){process.exitCode=code||1;stop()}})}
process.on('SIGINT',stop);process.on('SIGTERM',stop)
