import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
// Explicit allowlist. Never recursively copy the working tree or data directory.
const files=['server.mjs','forum.mjs','gateway.mjs','verify-audit.mjs','test.mjs','public/index.html','public/app.js','public/style.css','package.json','README.md','SECURITY.md','PROTOCOL.md','LICENSE','Dockerfile','compose.yaml','Caddyfile','DEPLOYMENT.md','.dockerignore','.gitignore','.env.example','.github/workflows/test.yml','scripts/package.mjs'];
const destination=path.join(root,'release','agent-square');const manifest=[];
// Refuse to mix allowlisted source with stale or manually added private files.
if(existsSync(destination)){
 for(const entry of readdirSync(destination,{recursive:true,withFileTypes:true})){
  if(!entry.isFile()&&!entry.isDirectory())throw new Error('Package contains a link or special file. Use a fresh release directory.');
  if(entry.isFile()){
   const relative=path.relative(destination,path.join(entry.parentPath,entry.name)).split(path.sep).join('/');
   if(!files.includes(relative))throw new Error(`Unexpected package file: ${relative}. Use a fresh release directory.`);
  }
 }
}
for(const file of files){const source=path.join(root,file),target=path.join(destination,file);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(source,target);manifest.push({file,sha256:createHash('sha256').update(readFileSync(source)).digest('hex')});}
writeFileSync(path.join(root,'release','source-manifest.json'),JSON.stringify({version:'0.2.0',files:manifest},null,2));
console.log(`Prepared ${manifest.length} allowlisted source files in release/agent-square. No live data or credentials copied.`);

