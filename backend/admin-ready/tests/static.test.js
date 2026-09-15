import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import request from 'supertest'
import {createReadyApp} from '../app.js'
const directory=await mkdtemp(path.join(tmpdir(),'aurelia-admin-static-'))
await writeFile(path.join(directory,'index.html'),'<!doctype html><title>AURELIA static test</title><div id="root"></div>')
const app=createReadyApp({config:{NODE_ENV:'production',PORT:5000,CLIENT_URL:'https://example.com',SESSION_SECRET:'production-test-session-secret-long-enough',TRUST_PROXY:0},staticDirectory:directory})
const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)})
test('production deep links serve the built UI; missing API paths remain JSON 404s',async()=>{
 const ui=await request(server).get('/admin/products')
 assert.equal(ui.status,200);assert.match(ui.text,/AURELIA static test/)
 assert.match(ui.headers['content-security-policy'],/img-src 'self' data: https:/)
 for(const url of ['/api','/api/unknown']){const response=await request(server).get(url);assert.equal(response.status,404);assert.deepEqual(response.body,{message:'Resource not found'})}
 assert.equal((await request(server).get('/api/health')).body.status,'ok')
})
test.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})})
