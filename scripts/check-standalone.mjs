import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const entry=path.resolve('.next/standalone/server.js');assert.ok(existsSync(entry),'Build first');
const temp=mkdtempSync(path.join(tmpdir(),'site-runtime-')),token='runtime-fixture-token-'.repeat(3),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw7sAAAAASUVORK5CYII=','base64'),id=createHash('sha256').update(png).digest('hex');
let failed=false,submitted=false,child,logs='';
const upstream=createServer(async(req,res)=>{
 try{
  assert.equal(req.headers.authorization,`Bearer ${token}`);assert.equal(req.headers.cookie,undefined);
  if(failed){res.writeHead(503);return res.end('{}');}
  const url=new URL(req.url,'http://dashboard:3000');res.setHeader('Content-Type','application/json');
  const payloads={
   '/api/site/guild':{schema:'mistblossom.public-guild.v1',metadata:{updated_at:new Date().toISOString()},guild:{name:'Runtime Test Guild',realm:{name:'Terokkar',slug:'terokkar'},member_count:0},members:[],raid_progression:{},scheduled_raids:[]},
   '/api/site/content':{schema:'mistblossom.public-content.v2',revision:'runtime-1',total:1,next_page:null,items:[{kind:'guides',slug:'runtime-guide',title:'Runtime Guide',description:'A runtime guide',body:'Article from the dashboard CMS.',date:'2026-10-16',tags:[],author:'Admin',image:`/api/site/media/${id}`}]},
   '/api/site/status':{ok:true,protocol:'mistblossom.site-bridge.v2',store:'postgres',schemas:{content:'mistblossom.public-content.v2'}},
   '/api/site/applications':{schema:'mistblossom.public-applications.v1',updated_at:new Date().toISOString(),counts:{all:0,review:0,accepted:0,declined:0},items:[]},
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
const preload=path.join(temp,'upstream.cjs');writeFileSync(preload,`const original=global.fetch;global.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(url.hostname==='dashboard'&&url.port==='3000'){url.hostname='127.0.0.1';url.port='${upstreamPort}';return original(url,init);}return original(input,init);};`);
try{
 child=spawn(process.execPath,['--require',preload,entry],{cwd:path.dirname(entry),env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),SITE_URL:'https://lihvodruida.pp.ua',DASHBOARD_INTERNAL_URL:'http://dashboard:3000',PUBLIC_SITE_BRIDGE_TOKEN:token,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs=(logs+d).slice(-8000));child.stderr.on('data',d=>logs=(logs+d).slice(-8000));
 const base=`http://127.0.0.1:${port}`;let ready=false;
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 for(const [route,text] of [['/guild','Runtime Test Guild'],['/guides/runtime-guide','Article from the dashboard CMS.'],['/feed.xml','runtime-guide'],['/sitemap.xml','runtime-guide']]){const response=await fetch(base+route);assert.equal(response.status,200,route);assert.ok((await response.text()).includes(text),route);}console.log('PASS production SSR, CMS article, RSS and sitemap');
 let response=await fetch(base+'/api/bridge/status');assert.equal(response.status,200);assert.equal((await response.json()).integration,'ready');console.log('PASS bridge readiness');
 response=await fetch(base+`/api/media/${id}`);assert.equal(response.status,200);assert.ok(Buffer.from(await response.arrayBuffer()).equals(png));console.log('PASS cover bytes and content hash');
 const body={characterName:'Sebas',realm:'Terokkar',faction:'Alliance',className:'Druid',discord:'sebas',availability:'Увечері після 19:00',sourceCreator:'Лігво Друїда',sourcePlatform:'Twitch',consent:true};
 const init={method:'POST',headers:{Origin:'https://lihvodruida.pp.ua','Content-Type':'application/json','X-Real-IP':'203.0.113.25',Cookie:'must-not-reach-dashboard=1'},body:JSON.stringify(body)};
 response=await fetch(base+'/api/bridge/applications',init);assert.equal(response.status,201);assert.equal((await response.json()).application_number,42);response=await fetch(base+'/api/bridge/applications',init);assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);console.log('PASS submission and duplicate receipt');
 response=await fetch(base+'/api/bridge/guild');const etag=response.headers.get('etag');response=await fetch(base+'/api/bridge/guild',{headers:{'If-None-Match':etag}});assert.equal(response.status,304);console.log('PASS unchanged snapshot HTTP 304');
 failed=true;assert.equal((await fetch(base+'/api/bridge/applications?q=cold-failure')).status,503);assert.equal((await fetch(base+'/api/health')).status,200);console.log('PASS outage HTTP 503 and independent liveness');
 console.log('[check-standalone] OK — 6/6; controlled upstream, no live database or Discord');
}finally{child?.kill('SIGTERM');await new Promise(resolve=>upstream.close(resolve));rmSync(temp,{recursive:true,force:true});}
