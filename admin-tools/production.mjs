import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {requestChildShutdown} from './run.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const child=spawn(process.execPath,['admin-ready/server.js'],{cwd:path.join(root,'backend'),stdio:['inherit','inherit','inherit','ipc'],env:{...process.env,NODE_ENV:'production'}})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1;if(process.connected)process.disconnect()})
const stop=signal=>{void requestChildShutdown(child,signal).catch(error=>{console.error(`Unable to request graceful shutdown: ${error.message}`);process.exitCode=1})}
process.on('SIGINT',()=>stop('SIGINT'));process.on('SIGTERM',()=>stop('SIGTERM'))
if(typeof process.send==='function')process.on('message',message=>{if(message?.type==='shutdown')stop('SIGTERM')})
