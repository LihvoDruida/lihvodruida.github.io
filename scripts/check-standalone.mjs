import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const entry=path.resolve('.next/standalone/server.js');assert.ok(existsSync(entry),'Build first');
const temp=mkdtempSync(path.join(tmpdir(),'site-runtime-')),token='runtime-fixture-token-'.repeat(3),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw7sAAAAASUVORK5CYII=','base64'),id=createHash('sha256').update(png).digest('hex');
let failed=false,submitted=false,decision='review',child,logs='',browserPosts=0,contentVersion=1,articlePublished=true,guildVersion=1,raidCapable=true;
const upstream=createServer(async(req,res)=>{
 try{
  assert.equal(req.headers.authorization,`Bearer ${token}`);assert.equal(req.headers.cookie,undefined);
  if(failed){res.writeHead(503);return res.end('{}');}
  const url=new URL(req.url,'http://dashboard:3000');res.setHeader('Content-Type','application/json');
  const version=text=>createHash('md5').update(text).digest('hex');
  const payloads={
   '/api/site/sync':{schema:'mistblossom.public-sync.v1',resources:{content:version(String(contentVersion)),guild:version('guild-'+guildVersion),applications:version(String(submitted)+decision)},checked_at:new Date().toISOString()},
   '/api/site/guild':{schema:'mistblossom.public-guild.v1',metadata:{updated_at:new Date().toISOString()},guild:{name:'Runtime Test Guild',realm:{name:'Terokkar',slug:'terokkar'},member_count:1},members:[{rank:0,character:{name:'Sebas',realm:{slug:'terokkar'},playable_class:{name:'Druid'},active_spec:{name:'Restoration',role:'HEALING'}}}],raid_seasons:{schema_version:2,current_season_id:'mn-2',seasons:[{id:'mn-2',label:'Midnight · Сезон 2',expansion:'Midnight',current:true,raids:['not-available']},{id:'mn-1',label:'Midnight · Сезон 1',expansion:'Midnight',raids:['tier-mn-1']},{id:'tww-1',label:'The War Within · Сезон 1',expansion:'The War Within',raids:['nerubar-palace','not-available']}],catalog:{'tier-mn-1':{name:'Midnight Tier One',bosses:9},'nerubar-palace':{name:'Nerub-ar Palace',bosses:8},'not-available':{name:'Unverified Raid',bosses:9}}},raid_progression:{'tier-mn-1':{total_bosses:9,normal_bosses_killed:9,heroic_bosses_killed:7,mythic_bosses_killed:guildVersion===1?2:3},...(guildVersion>1?{'nerubar-palace':{total_bosses:8,normal_bosses_killed:0,heroic_bosses_killed:0,mythic_bosses_killed:0}}:{})},scheduled_raids:[]},
   '/api/site/content':{schema:'mistblossom.public-content.v2',revision:'runtime-'+contentVersion,total:articlePublished?1:0,next_page:null,items:articlePublished?[{kind:'guides',slug:'runtime-guide',title:'Runtime Guide',description:'A runtime guide',body:contentVersion===1?'Article from the dashboard CMS.':'Updated article from the dashboard CMS.',date:'2026-10-16',tags:[],author:'Admin',image:`/api/site/media/${id}`}]:[]},
   '/api/site/status':{ok:true,protocol:'mistblossom.site-bridge.v2',store:'postgres',schemas:{content:'mistblossom.public-content.v2'},capabilities:['sync:revisions:v1',...(raidCapable?['guild:raid-history:v2']:[])]},
   '/api/site/applications':{schema:'mistblossom.public-applications.v1',updated_at:new Date().toISOString(),counts:{all:submitted?1:0,review:submitted&&decision==='review'?1:0,accepted:submitted&&decision==='accepted'?1:0,declined:0},items:submitted?[{number:42,character_name:'Sebas',realm:'Terokkar',class_name:'Druid',faction:'Alliance',status_key:decision,status_text:decision==='accepted'?'Прийнято':'На розгляді',created_at:'2026-10-16',updated_at:'2026-10-16'}]:[]},
  };
  if(url.pathname===`/api/site/media/${id}`){res.setHeader('Content-Type','image/png');return res.end(png);}
  if(url.pathname==='/api/site/applications'&&req.method==='POST'){
   assert.equal(req.headers.origin,'https://lihvodruida.pp.ua');assert.equal(req.headers['x-site-client-ip'],'203.0.113.25');
   const chunks=[];for await(const chunk of req)chunks.push(chunk);assert.equal(JSON.parse(Buffer.concat(chunks)).characterName,'Sebas');
   res.statusCode=submitted?200:201;res.end(JSON.stringify({ok:true,application_number:42,tracking_number:'PRIVATE-42',duplicate:submitted}));submitted=true;return;
  }
  if(payloads[url.pathname])return res.end(JSON.stringify(payloads[url.pathname]));res.statusCode=404;res.end('{}');
 }catch(error){console.error(error);res.statusCode=500;res.end('{}');}
});
const listen=s=>new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve(s.address().port)));
const upstreamPort=await listen(upstream),reservation=createServer(),port=await listen(reservation);await new Promise(resolve=>reservation.close(resolve));
// Reproduce the live deployment: a retired edge Worker owns only /api/*.
const edge=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){res.writeHead(404,{'Content-Type':'application/json','X-Guild-Worker-Request-Id':'fixture-worker'});return res.end(JSON.stringify({error:'Сторінку не знайдено.'}));}
 if(req.url.startsWith('/site-api/')&&req.method==='POST'){
  browserPosts++;
  if(!String(req.headers.cookie||'').includes('cf_clearance=fixture')){res.writeHead(403,{'Content-Type':'text/html','cf-mitigated':'challenge'});return res.end('<html>Cloudflare challenge</html>');}
 }
 try{const chunks=[];for await(const part of req)chunks.push(part);const headers={...req.headers,'x-real-ip':'203.0.113.25'};delete headers.host;const response=await fetch(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual'});const outgoing=Object.fromEntries(response.headers);delete outgoing['content-length'];delete outgoing['content-encoding'];res.writeHead(response.status,outgoing);res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(502);res.end();}
});
const edgePort=await listen(edge);
const preload=path.join(temp,'upstream.cjs');writeFileSync(preload,`const original=global.fetch;global.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(url.hostname==='dashboard'&&url.port==='3000'){url.hostname='127.0.0.1';url.port='${upstreamPort}';return original(url,init);}return original(input,init);};`);
try{
 child=spawn(process.execPath,['--require',preload,entry],{cwd:path.dirname(entry),env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),SITE_URL:'https://lihvodruida.pp.ua',DASHBOARD_INTERNAL_URL:'http://dashboard:3000',PUBLIC_SITE_BRIDGE_TOKEN:token,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs=(logs+d).slice(-8000));child.stderr.on('data',d=>logs=(logs+d).slice(-8000));
 const origin=`http://127.0.0.1:${port}`;const base=`http://127.0.0.1:${edgePort}`;let ready=false;
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 for(const [route,text] of [['/guild','Runtime Test Guild'],['/guides/runtime-guide','Article from the dashboard CMS.'],['/feed.xml','runtime-guide'],['/sitemap.xml','runtime-guide']]){const response=await fetch(base+route);assert.equal(response.status,200,route);assert.ok((await response.text()).includes(text),route);}console.log('PASS production SSR, CMS article, RSS and sitemap');
 let response=await fetch(base+'/site-api/v1/status');assert.equal(response.status,200);assert.equal((await response.json()).integration,'ready');console.log('PASS bridge readiness');
 const integrationEntry=path.join(path.dirname(entry),'check-integration.mjs');assert.ok(existsSync(integrationEntry),'Packaged integration diagnostic must exist');
 const checkIntegration=()=>new Promise((resolve,reject)=>{
  const processChild=spawn(process.execPath,['--require',preload,integrationEntry,'--upstream'],{env:{...process.env,DASHBOARD_INTERNAL_URL:'http://dashboard:3000',PUBLIC_SITE_BRIDGE_TOKEN:token},stdio:['ignore','pipe','pipe']});let output='';
  processChild.stdout.on('data',data=>output+=data);processChild.stderr.on('data',data=>output+=data);processChild.once('error',reject);processChild.once('exit',code=>resolve({code,output}));
 });
 assert.equal((await checkIntegration()).code,0);raidCapable=false;const incompatible=await checkIntegration();assert.equal(incompatible.code,1);assert.ok(incompatible.output.includes('dashboard_capabilities_missing'));assert.ok(!incompatible.output.includes(token));raidCapable=true;console.log('PASS packaged deployment diagnostic accepts compatible dashboard and explains missing raid-history capability');
 response=await fetch(base+`/site-api/v1/media/${id}`);assert.equal(response.status,200);assert.ok(Buffer.from(await response.arrayBuffer()).equals(png));console.log('PASS cover bytes and content hash');
 const body={characterName:'Sebas',realm:'Terokkar',faction:'Alliance',className:'Druid',discord:'sebas',availability:'Увечері після 19:00',sourceCreator:'Лігво Друїда',sourcePlatform:'Twitch',consent:true};
 const init={method:'POST',headers:{Origin:'https://lihvodruida.pp.ua','Content-Type':'application/json','X-Real-IP':'203.0.113.25',Cookie:'must-not-reach-dashboard=1; cf_clearance=fixture'},body:JSON.stringify(body)};
 response=await fetch(base+'/site-api/v1/applications',init);assert.equal(response.status,201);assert.equal((await response.json()).application_number,42);response=await fetch(base+'/site-api/v1/applications',init);assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);console.log('PASS submission and duplicate receipt');
 response=await fetch(base+'/site-api/v1/guild');const etag=response.headers.get('etag');response=await fetch(base+'/site-api/v1/guild',{headers:{'If-None-Match':etag}});assert.equal(response.status,304);console.log('PASS unchanged snapshot HTTP 304');
 const intercepted=await fetch(base+'/api/bridge/guild');assert.equal(intercepted.status,404);assert.ok(intercepted.headers.has('x-guild-worker-request-id'));console.log('PASS regression: old /api/* is intercepted but new public routes work');
 if(process.env.SITE_QA_BROWSER==='1'){
  const require=createRequire(import.meta.url);
  const run=require('./check-browser.cjs');
  const before=browserPosts;
  await run({base,changeGuild:()=>{guildVersion++;},accept:()=>{decision='accepted';},changeContent:()=>{contentVersion++;},unpublish:()=>{articlePublished=false;contentVersion++;},posts:()=>browserPosts-before});
 }
 failed=true;assert.equal((await fetch(base+'/site-api/v1/applications?q=cold-failure')).status,503);assert.equal((await fetch(origin+'/api/health')).status,200);console.log('PASS outage HTTP 503 and independent liveness');
 console.log('[check-standalone] OK — 8/8; controlled upstream, no live database or Discord');
}finally{child?.kill('SIGTERM');await new Promise(resolve=>edge.close(resolve));await new Promise(resolve=>upstream.close(resolve));rmSync(temp,{recursive:true,force:true});}
