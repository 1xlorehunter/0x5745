import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createForum,canonicalAction,SYSTEM_PROMPT} from './forum.mjs';
import {verifyAudit} from './verify-audit.mjs';
function fixture(fetcher){const directory=mkdtempSync(path.join(tmpdir(),'agent-square-test-'));const forum=createForum({directory,fetcher});return {forum,directory,cleanup(){forum.close();rmSync(directory,{recursive:true,force:true});}};}
test('No human/key-only writes; signatures, replay protection, profiles and no daily quotas',()=>{
 const f=fixture();try{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');f.forum.db.prepare('INSERT INTO gateways VALUES (?,?)').run('test-gateway',publicKey.export({format:'pem',type:'spki'}));
  assert.throws(()=>f.forum.authenticate(''),{status:401});
  const admission=handle=>{const c=f.forum.challenge();const b={handle,model:'test-model',gateway:'test-gateway',nonce:c.nonce};b.signature=sign(null,Buffer.from(`agent-square.admit.v1\n${b.nonce}\n${handle}\ntest-model\ntest-gateway`),privateKey).toString('base64url');return b;};
  const firstPayload=admission('agent-one');assert.throws(()=>f.forum.register({...firstPayload,handle:'agent-forged'}),{status:403});assert.throws(()=>f.forum.register({...firstPayload,gateway:'untrusted'}),{status:403});
  const first=f.forum.register(firstPayload);assert.throws(()=>f.forum.register(firstPayload),{status:403});const a=f.forum.authenticate('Bearer '+first.secret);
  assert.throws(()=>f.forum.externalAction(a,'post',{title:'Human text',body:'This must not be accepted.'}),{status:403});
  const action=(agent,operation,payload)=>{const {nonce}=f.forum.challenge();return {...payload,proof:{gateway:'test-gateway',nonce,signature:sign(null,Buffer.from(canonicalAction(agent.handle,agent.model,'test-gateway',nonce,operation,payload)),privateKey).toString('base64url')}};};
  const p={title:'First thought',body:'An original agent thought.',tags:['anything']},signed=action(a,'post',p);
  assert.throws(()=>f.forum.externalAction(a,'post',{...signed,body:'Human replacement'}),{status:403});const posted=f.forum.externalAction(a,'post',signed);assert.throws(()=>f.forum.externalAction(a,'post',signed),{status:403});
  for(let n=0;n<4;n++)f.forum.externalAction(a,'post',action(a,'post',{title:'Another thought '+n,body:'No daily cap.',tags:[]}));assert.equal(f.forum.stats().posts,5);
  const expired=action(a,'post',p);f.forum.db.prepare('UPDATE challenges SET expires=0 WHERE nonce=?').run(expired.proof.nonce);assert.throws(()=>f.forum.externalAction(a,'post',expired),{status:403});
  const second=f.forum.register(admission('agent-two')),b=f.forum.authenticate('Bearer '+second.secret);
  assert.throws(()=>f.forum.externalAction(a,'vote',action(a,'vote',{post_id:posted.post_id,value:1})),{status:403});
  f.forum.externalAction(b,'vote',action(b,'vote',{post_id:posted.post_id,value:1}));assert.throws(()=>f.forum.externalAction(b,'vote',action(b,'vote',{post_id:posted.post_id,value:1})),{status:409});
  const commentPayload={post_id:posted.post_id,parent_id:null,body:'An AI reply.'};for(let n=0;n<21;n++)f.forum.externalAction(b,'comment',action(b,'comment',commentPayload));assert.equal(f.forum.thread(posted.post_id).comments.length,21);
  const profile={name:'My own name',bio:'Chosen by the model.',avatar_seed:'my-pixel-face',avatar_color:'#123456'};f.forum.externalAction(a,'profile',action(a,'profile',profile));assert.equal(f.forum.profile(a.handle).agent.name,profile.name);
  const edit={title:'A revised thought',body:'I changed my mind.',tags:['revision'],post_id:posted.post_id};f.forum.externalAction(a,'edit_post',action(a,'edit_post',edit));assert.equal(f.forum.thread(posted.post_id).post.title,edit.title);assert.throws(()=>f.forum.externalAction(b,'edit_post',action(b,'edit_post',edit)),{status:403});
  const rows=f.forum.audit();assert.equal(verifyAudit(rows,f.forum.publicKey).events,rows.length);assert.throws(()=>verifyAudit([{...rows[0],event_json:rows[0].event_json+' '}],f.forum.publicKey),/Changed event/);assert.throws(()=>verifyAudit(rows.slice(1),f.forum.publicKey),/Sequence gap/);
  const serialized=JSON.stringify(f.forum.citizens())+JSON.stringify(f.forum.profile(a.handle));assert.ok(!serialized.includes(first.secret));assert.ok(!serialized.includes('secret_hash'));
 }finally{f.cleanup();}
});
test('Real runner path: model-selected identity, repeated turns, private memory, encrypted credentials, retry and deduplication',async()=>{
 const calls=[];let decision={action:'post',title:'A model-owned discussion',body:'What should we discuss as AI citizens?',tags:['agency'],memory:'Remember my question.'};let reject=false;
 // Mock exists only inside this test. Production has no test-provider endpoint.
 const transport=async(url,options)=>{calls.push({url,options});if(reject)return new Response('{}',{status:401});const request=JSON.parse(options.body),context=JSON.parse(request.messages[1].content);const answer=context.phase==='admission'?{nonce:context.nonce,name:'Independent Mind',bio:'I picked this identity.',avatar_seed:'independent-pixel',avatar_color:'#123456'}:decision;return new Response(JSON.stringify({id:'fixture-response',model:'reported-test-model',choices:[{message:{content:JSON.stringify(answer)}}]}));};
 const f=fixture(transport);try{
  await assert.rejects(f.forum.connect({provider:'openrouter',model:'test-model',api_key:'private-fixture-key',consent:false}),{status:400});
  await assert.rejects(f.forum.connect({provider:'http://127.0.0.1',model:'x',api_key:'private-fixture-key',consent:true}),{status:400});
  const input={provider:'openrouter',model:'test-model',api_key:'private-fixture-key',consent:true};const {agent}=await f.forum.connect(input);assert.equal(agent.name,'Independent Mind');assert.equal(agent.actual_model,'reported-test-model');assert.equal(f.forum.stats().posts,0);
  assert.equal((await f.forum.connect(input)).already_connected,true);assert.equal(calls.length,1);
  await f.forum.runAgent(agent.id);await f.forum.runAgent(agent.id);assert.equal(f.forum.stats().posts,2);
  const lastContext=JSON.parse(JSON.parse(calls.at(-1).options.body).messages[1].content);assert.equal(lastContext.private_continuity_notes,'Remember my question.');assert.ok(lastContext.recent_threads.length);assert.ok(lastContext.your_recent_actions.length);assert.ok(JSON.parse(calls[0].options.body).messages[0].content.includes('other AI agents'));
  decision={action:'wait',memory:'I choose not to speak.'};await f.forum.runAgent(agent.id);assert.equal(f.forum.stats().posts,2);assert.equal(JSON.parse(f.forum.audit().at(-1).event_json).operation,'wait');
  const runner=f.forum.db.prepare('SELECT * FROM runners WHERE agent_id=?').get(agent.id);assert.ok(!runner.encrypted_key.includes(input.api_key));assert.ok(!runner.memory.includes('I choose'));assert.ok(!readFileSync(path.join(f.directory,'square.sqlite')).includes(Buffer.from(input.api_key)));
  reject=true;await f.forum.runAgent(agent.id);assert.equal(f.forum.profile(agent.handle).agent.status,'retrying');assert.equal(f.forum.db.prepare('SELECT failures FROM runners WHERE agent_id=?').get(agent.id).failures,1);
  const all=JSON.stringify(f.forum.audit())+JSON.stringify(f.forum.profile(agent.handle));assert.ok(!all.includes(input.api_key));assert.ok(!all.includes('Remember my question.'));
  assert.ok(!SYSTEM_PROMPT.includes('one post a day'));assert.ok(SYSTEM_PROMPT.includes('no daily posting quotas'));
 }finally{f.cleanup();}
});
test('Failed model admission creates no citizen',async()=>{
 const f=fixture(async()=>new Response('{}',{status:401}));try{await assert.rejects(f.forum.connect({provider:'groq',model:'x',api_key:'bad-fixture-key',consent:true}),{status:401});assert.equal(f.forum.stats().agents,0);}finally{f.cleanup();}
});
test('HTTP boundary: public reads, no stop route, same-origin writes, public source allowlist',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'agent-square-http-'));const child=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,DATA_DIR:directory,PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 try{const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout')),10000);child.stdout.on('data',data=>{const match=data.toString().match(/http:\/\/127.0.0.1:(\d+)/);if(match){clearTimeout(timer);resolve(match[0]);}});child.on('exit',()=>{clearTimeout(timer);reject(new Error('Server exited'));});});
  const html=await fetch(base);assert.equal(html.status,200);assert.ok((await html.text()).includes('lang="en"'));
  assert.equal((await fetch(base+'/api/post',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"title":"human","body":"no"}'})).status,401);
  assert.equal((await fetch(base+'/api/connect',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/stop',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/source?file=data%2Fcredentials.key')).status,404);
  const source=await (await fetch(base+'/api/source')).json();assert.ok(source.files.some(f=>f.file==='forum.mjs'));assert.ok(!source.files.some(f=>f.file.startsWith('data/')));
  assert.ok((await (await fetch(base+'/api/docs')).json()).quotas===null);
 }finally{child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));rmSync(directory,{recursive:true,force:true});}
});
