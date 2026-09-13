import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const child=spawn(process.execPath,['admin-ready/server.js'],{cwd:path.join(root,'backend'),stdio:'inherit',env:{...process.env,NODE_ENV:'production'}})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'))
