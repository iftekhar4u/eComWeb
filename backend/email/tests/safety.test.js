import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import {configureEmailCrypto,seal,unseal,unsubscribeToken,unsubscribeId} from '../crypto.js'
import {settingsInput,defaults,websiteUrl,smtpOptions,makeTransport} from '../settings.js'
import {renderEmail} from '../templates.js'
import {ensureEmailDatabase,extendSubscriberValidator} from '../database.js'
import {config} from './fixture.js'

configureEmailCrypto(config)
test('credentials use authenticated encryption; wrong keys and modified ciphertext are rejected',()=>{
 const encrypted=seal('private-smtp-password');assert.equal(unseal(encrypted),'private-smtp-password');assert.notEqual(seal('private-smtp-password'),encrypted)
 const parts=encrypted.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);assert.throws(()=>unseal(parts.join('.')),/encryption key/)
 configureEmailCrypto({...config,EMAIL_ENCRYPTION_KEY:'a-different-key-of-at-least-32-characters'});assert.throws(()=>unseal(encrypted),/encryption key/);configureEmailCrypto(config)
 const signed=unsubscribeToken({_id:'111111111111111111111111'});assert.equal(unsubscribeId(signed),'111111111111111111111111');assert.equal(unsubscribeId(signed.replace(/^1/,'2')),null)
})
test('settings reject header injection, unknown template fields, unsafe URLs and contradictory credentials',()=>{
 const input=defaults(config)
 assert.ok(settingsInput.safeParse(input).success)
 for(const patch of [{fromEmail:'a@example.com\r\nBcc: other@example.com'},{publicUrl:'javascript:alert(1)'},{publicUrl:'https://user:pass@example.com'},{publicUrl:'https://example.com/path'},{templates:{password_reset:{enabled:true,subject:'hello\r\nBcc: other@example.com',body:'hi'}}},{templates:{password_reset:{enabled:true,subject:'{{secret}}',body:'hi'}}},{password:'secret',clearPassword:true}])assert.equal(settingsInput.safeParse({...input,...patch}).success,false)
 assert.throws(()=>websiteUrl({...input,publicUrl:'http://example.com'},{NODE_ENV:'production'}),/HTTPS/)
 const tls=smtpOptions({...input,password:'secret'},{NODE_ENV:'production'});assert.equal(tls.requireTLS,true);assert.equal(tls.disableFileAccess,true);assert.equal(tls.disableUrlAccess,true);assert.equal(tls.debug,false)
})
test('email rendering escapes customer content and preserves required links and accurate COD/refund totals',()=>{
 const settings=defaults(config),data={name:'<img src=x onerror=alert(1)>',actionUrl:'https://example.com/forgot-password#reset=abc'}
 const rendered=renderEmail('password_reset',data,settings)
 assert.ok(!rendered.html.includes('<img'));assert.match(rendered.html,/&lt;img/);assert.ok(rendered.html.includes(data.actionUrl));assert.ok(rendered.text.includes(data.actionUrl))
 const order={...data,orderNumber:'AUR-123',items:[{name:'<b>Product</b>',quantity:1,lineTotalPaise:12500}],totalPaise:12500,paymentMethod:'cod',paymentStatus:'pending',fulfillmentStatus:'cancelled'}
 const cancelled=renderEmail('cancelled',order,settings);assert.match(cancelled.text,/payment not collected/);assert.doesNotMatch(cancelled.text,/payment due/);assert.match(cancelled.text,/125\.00/)
 const refund=renderEmail('refund',{...order,paymentMethod:'razorpay',paymentStatus:'refunded',refundedPaise:2500},settings);assert.match(refund.text,/25\.00/)
})
test('database provisioning is additive and repeatable, preserving existing validators and records',async()=>{
 const validator={$jsonSchema:{bsonType:'object',additionalProperties:false,required:['email'],properties:{email:{bsonType:'string'}}}}
 const nested={$and:[validator,{email:{$exists:true}}]},extended=extendSubscriberValidator(nested)
 assert.deepEqual(nested.$and[0].$jsonSchema.properties,{email:{bsonType:'string'}});assert.deepEqual(extended.$and[1],nested.$and[1]);assert.ok(extended.$and[0].$jsonSchema.properties.subscriptionStatus)
 const collections=[{name:'subscribers',options:{validator}},{name:'auth_tokens',options:{validator:{$jsonSchema:{properties:{tokenHash:{bsonType:'string'}},additionalProperties:false}}}},{name:'products',options:{validator:{untouched:true}}}],indexes=new Map(),commands=[],created=[]
 const db={listCollections:()=>({toArray:async()=>collections}),createCollection:async(name,options)=>{created.push(name);collections.push({name,options});indexes.set(name,[])},collection:name=>({listIndexes:()=>({toArray:async()=>indexes.get(name)||[]}),createIndex:async(key,options)=>indexes.get(name).push({key,...options})}),command:async command=>{commands.push(command);collections.find(c=>c.name===command.collMod).options.validator=command.validator}}
 await ensureEmailDatabase(db);assert.deepEqual(created,['email_settings','email_jobs','email_campaigns']);assert.deepEqual(commands.map(c=>c.collMod),['subscribers','auth_tokens']);assert.deepEqual(collections[2].options.validator,{untouched:true})
 await ensureEmailDatabase(db);assert.equal(created.length,3);assert.equal(commands.length,2)
 assert.equal(indexes.get('email_jobs').find(i=>i.name==='uq_email_jobs_event').unique,true)
})
test('real Nodemailer SMTP handshake and MIME delivery use a local sink, without an external mailbox',async()=>{
 const received=[],sockets=new Set()
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 local.test ESMTP\r\n')
  let buffer='',readingData=false,body=[]
  socket.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2)
   if(readingData){if(line==='.'){received.push(body.join('\r\n'));readingData=false;body=[];socket.write('250 accepted\r\n')}else body.push(line);continue}
   if(/^EHLO|^HELO/.test(line))socket.write('250-local.test\r\n250 8BITMIME\r\n')
   else if(/^MAIL FROM:|^RCPT TO:/.test(line))socket.write('250 OK\r\n')
   else if(line==='DATA'){readingData=true;socket.write('354 send data\r\n')}
   else if(line==='QUIT'){socket.end('221 bye\r\n')}
   else socket.write('250 OK\r\n')
  }})
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const settings={...defaults(config),host:'127.0.0.1',port:server.address().port,username:'',secure:false},transport=makeTransport(settings,config)
 try{assert.equal(await transport.verify(),true);const info=await transport.sendMail({from:'store@example.com',to:'sink@example.com',...renderEmail('test',{},settings)});assert.deepEqual(info.accepted,['sink@example.com']);assert.equal(received.length,1);assert.match(received[0],/Content-Type: multipart\/alternative/);assert.match(received[0],/Your email configuration is working/)}finally{transport.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve))}
})
