import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {checkDashboard,checkLocal,runIntegration}=require('../scripts/check-integration.mjs');
const env={DASHBOARD_INTERNAL_URL:'http://dashboard:3000',PUBLIC_SITE_BRIDGE_TOKEN:'a'.repeat(64)};
const valid={ok:true,protocol:'mistblossom.site-bridge.v2',store:'postgres',schemas:{content:'mistblossom.public-content.v2'},capabilities:['sync:revisions:v1','guild:raid-history:v2','streamers:read:v1']};
const fetcher=(data:unknown,status=200)=>async()=>Response.json(data,{status});
test('deployment preflight verifies actual dashboard capabilities and private service authentication',async()=>{
 await checkDashboard(env,async(url:string,init:RequestInit)=>{assert.equal(url,'http://dashboard:3000/api/site/status');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+env.PUBLIC_SITE_BRIDGE_TOKEN);assert.equal(init.redirect,'error');return Response.json(valid)});
});
test('deployment preflight identifies a running older dashboard instead of silently rolling the site back',async()=>{
 await assert.rejects(checkDashboard(env,fetcher({...valid,capabilities:['sync:revisions:v1']})),(error:{code:string;message:string})=>error.code==='dashboard_capabilities_missing'&&error.message.includes('guild:raid-history:v2')&&error.message.includes('3.14.0'));
 await assert.rejects(checkDashboard(env,fetcher({...valid,store:'other'})),{code:'dashboard_protocol_incompatible'});
});
test('deployment distinguishes rejected tokens, DNS, connection refusal and HTTP errors without leaking upstream bodies',async()=>{
 for(const status of [401,403,421])await assert.rejects(checkDashboard(env,fetcher({token:'private-response'},status)),{code:'bridge_access_rejected'});
 for(const [code,expected] of [['ENOTFOUND','dashboard_dns'],['ECONNREFUSED','dashboard_connection_refused']])await assert.rejects(checkDashboard(env,async()=>{throw Object.assign(Error('private-network-detail'),{cause:{code}})}),{code:expected});
 await assert.rejects(checkDashboard(env,fetcher({error:'private-database-detail'},503)),{code:'dashboard_http'});
 let called=false;await assert.rejects(checkDashboard({...env,DASHBOARD_INTERNAL_URL:'https://external.test'},async()=>{called=true}),{code:'dashboard_url_configuration'});assert.equal(called,false);
});
test('deployment rejects non-JSON, oversized and malformed status responses',async()=>{
 await assert.rejects(checkDashboard(env,async()=>new Response('<html>private</html>',{headers:{'Content-Type':'text/html'}})),{code:'integration_non_json'});
 await assert.rejects(checkDashboard(env,fetcher({secret:'x'.repeat(9000)})),{code:'integration_body_limit'});
 await assert.rejects(checkDashboard(env,async()=>new Response('{bad',{headers:{'Content-Type':'application/json'}})),{code:'integration_invalid_json'});
});
test('local readiness failure prints the safe cause and a specific upstream diagnosis',async()=>{
 const lines:string[]=[],log={log:(line:string)=>lines.push(line),error:(line:string)=>lines.push(line)};
 const code=await runIntegration(['--local'],env,async(url:string)=>url.includes('127.0.0.1')?Response.json({ok:false,code:'invalid_schema',private:'never-print'},{status:503}):Response.json({...valid,capabilities:[]}),log);
 assert.equal(code,1);const output=lines.join('\n');assert.match(output,/invalid_schema/);assert.match(output,/dashboard_capabilities_missing/);assert.ok(!output.includes('never-print'));assert.ok(!output.includes(env.PUBLIC_SITE_BRIDGE_TOKEN));
 await checkLocal(fetcher({ok:true,integration:'ready',service:'lihvodruida-site',api_base:'/site-api/v1'}));
});
test('unexpected network messages and raw response codes cannot leak secrets into deployment logs',async()=>{
 const lines:string[]=[],log={log:(line:string)=>lines.push(line),error:(line:string)=>lines.push(line)};
 const code=await runIntegration(['--upstream'],env,async()=>{throw Error('http://private/?token='+env.PUBLIC_SITE_BRIDGE_TOKEN)},log);
 assert.equal(code,1);assert.ok(!lines.join('').includes(env.PUBLIC_SITE_BRIDGE_TOKEN));assert.match(lines.join(''),/integration_network/);
 assert.equal(await runIntegration(['--local','--upstream'],env,async()=>{throw Error('must not run')},log),2);
});
