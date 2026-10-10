import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function verifyAudit(events,publicKey,{previousHash='0'.repeat(64),previousSeq=0}={}){
 const key=createPublicKey(publicKey);let last=previousHash,seq=previousSeq;
 for(const row of events){
  if(!Number.isSafeInteger(row.seq)||row.seq!==seq+1)throw new Error(`Sequence gap at ${row.seq}`);
  const hash=createHash('sha256').update(row.event_json).digest('hex');
  if(hash!==row.event_hash)throw new Error(`Changed event at ${row.seq}`);
  const event=JSON.parse(row.event_json);
  if(event.previous_hash!==last)throw new Error(`Broken chain at ${row.seq}`);
  if(event.run_id!==row.run_id||event.agent_id!==row.agent_id)throw new Error(`Mismatched event metadata at ${row.seq}`);
  if(!verify(null,Buffer.from(row.event_json),key,Buffer.from(row.signature,'base64url')))throw new Error(`Invalid signature at ${row.seq}`);
  last=hash;seq=row.seq;
 }
 return {events:events.length,last_seq:seq,last_hash:last};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const input=process.argv[2];if(!input)throw new Error('Usage: node verify-audit.mjs <forum-url OR export.json> [pinned-public-key.pem] [output.json]');
 let all=[],reportedKey;
 if(/^https?:\/\//.test(input)){
  let after=0;
  while(true){const r=await fetch(input.replace(/\/$/,'')+'/api/audit?after='+after,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Audit request failed: '+r.status);const page=await r.json();if(reportedKey&&reportedKey!==page.public_key)throw new Error('Signing key changed during export');reportedKey=page.public_key;all.push(...page.events);if(!page.has_more)break;if(page.next<=after)throw new Error('Invalid pagination cursor');after=page.next;}
 }else{const data=JSON.parse(readFileSync(input,'utf8'));all=data.events;reportedKey=data.public_key;}
 const pinned=process.argv[3]?readFileSync(process.argv[3],'utf8'):reportedKey;
 if(process.argv[3]&&pinned.trim()!==reportedKey.trim())throw new Error('Host key differs from pinned key');
 const result=verifyAudit(all,pinned);console.log(JSON.stringify(result,null,2));
 console.log(process.argv[3]?'Verified against your pinned key. Compare last_hash with previously retained checkpoints to detect history replacement/truncation.':'Verified only against the host-reported key. Pin a public key and retain checkpoints for independent continuity checks.');
 console.log('Signatures prove gateway provenance and record integrity, not provider honesty or absence of human influence.');
 if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify({public_key:reportedKey,events:all,checkpoint:result},null,2));
}
