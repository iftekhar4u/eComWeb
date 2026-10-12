import { ensureEmailDatabase } from '../email/database.js'
import { createEmailService } from '../email/service.js'
import { bindEmailEvents } from '../email/events.js'
import mongoose from 'mongoose'
import {fileURLToPath} from 'node:url'
import {access} from 'node:fs/promises'
import argon2 from 'argon2'
import User from '../models/User.js'
import { getConfig } from '../config/env.js'
import { createReadyApp, connectDatabase } from './app.js'
import { createRazorpay } from '../services/razorpay.js'
import { reconcileExpired } from '../services/commerce.js'
import {prepareDatabase} from './database.js'
import {ensureSeoDatabase} from '../seo/database.js'
const config=getConfig()
if(!config.SESSION_SECRET||!config.MFA_ENCRYPTION_KEY)throw new Error('Fill backend/.env first: SESSION_SECRET and MFA_ENCRYPTION_KEY are required. Run node admin-tools/setup.mjs from the project root.')
await connectDatabase(config)
const database=await prepareDatabase(mongoose.connection.db)
await ensureSeoDatabase(mongoose.connection.db)
await ensureEmailDatabase(mongoose.connection.db)
const emailService=createEmailService(config)
bindEmailEvents(emailService.event)
console.log(database.initialized?'Empty application database initialized; no sample business data added.':'Existing database records and configuration preserved.')
const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),password=process.env.ADMIN_PASSWORD||'',name=(process.env.ADMIN_NAME||'').trim()
if(email){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('ADMIN_EMAIL is invalid')
  const exists=await User.findOne({email}).select('role status').lean()
  if(exists){
    if(exists.role!=='admin')throw new Error('ADMIN_EMAIL belongs to a customer. Choose a new admin email; customer accounts are never promoted automatically.')
    console.log('Existing admin account preserved. Use its current password and authenticator.')
  }else{
    if(name.length<2||password.length<12||password.length>128)throw new Error('For a NEW admin, set ADMIN_NAME and an ADMIN_PASSWORD of 12–128 characters in backend/.env.')
    await User.create({name,email,password:await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1}),role:'admin',status:'active'})
    console.log('Admin account created. Complete authenticator setup on first sign-in.')
  }
}
const gateway=createRazorpay(config)
let checking=false
const check=async()=>{if(checking||!gateway.enabled)return;checking=true;try{await reconcileExpired(gateway)}catch(e){console.error('Payment reconciliation failed:',e.message)}finally{checking=false}}
const timer=setInterval(check,60000);timer.unref();void check()
const staticDirectory=config.NODE_ENV==='production'?fileURLToPath(new URL('../../frontend/dist-admin/',import.meta.url)):undefined
if(staticDirectory) await access(`${staticDirectory}/index.html`).catch(()=>{throw new Error('Build the admin frontend first: node admin-tools/build.mjs')})
const app=createReadyApp({config,gateway,staticDirectory,emailService})
const stopEmail=emailService.start()
const server=app.listen(config.PORT,()=>console.log(`AURELIA ready API: http://localhost:${config.PORT}; admin: ${config.CLIENT_URL}/admin`))
const shutdown=()=>{clearInterval(timer);server.close(async()=>{await stopEmail();await mongoose.disconnect();process.exit(0)})}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
