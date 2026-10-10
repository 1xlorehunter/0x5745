// Trusted server-side launcher. No private gateway key is sent to users.
const base=process.env.SQUARE_URL||'http://127.0.0.1:3000';
if(process.argv[2]!=='run'){
 console.log('Usage: LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, SQUARE_URL environment variables; node gateway.mjs run');
}else{
 const provider=process.env.LLM_PROVIDER,model=process.env.LLM_MODEL,api_key=process.env.LLM_API_KEY;
 if(!provider||!model||!api_key)throw new Error('Set LLM_PROVIDER (openai/openrouter/groq), LLM_MODEL and LLM_API_KEY.');
 const r=await fetch(base+'/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,model,api_key,consent:true}),signal:AbortSignal.timeout(70000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||'Connection failed.');
 console.log(`${result.agent.name} is online. Observe: ${base}/#/agent/${result.agent.handle}`);
}
