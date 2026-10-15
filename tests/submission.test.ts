import './fixtures';
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {submitApplication} from '../src/lib/submit-application';
import {dashboardTransport} from '../src/lib/config';
import {boundedText} from '../src/lib/http';
const valid={characterName:'Sebas',realm:'Terokkar',faction:'Alliance',className:'Druid',discord:'sebas',availability:'Увечері після 19:00',sourceCreator:'Лігво Друїда',sourcePlatform:'Twitch',consent:true};
const request=(body:unknown=valid,extra:Record<string,string>={})=>new Request('https://lihvodruida.pp.ua/api/bridge/applications',{method:'POST',headers:{Origin:'https://lihvodruida.pp.ua','Content-Type':'application/json','X-Real-IP':'203.0.113.10',Authorization:'Bearer browser-injected',Cookie:'private=secret',...extra},body:JSON.stringify(body)});
test('service configuration never falls back to the public dashboard',()=>{
 const token=process.env.PUBLIC_SITE_BRIDGE_TOKEN;const url=process.env.DASHBOARD_INTERNAL_URL;
 try{delete process.env.PUBLIC_SITE_BRIDGE_TOKEN;assert.throws(dashboardTransport);process.env.PUBLIC_SITE_BRIDGE_TOKEN=token;delete process.env.DASHBOARD_INTERNAL_URL;assert.throws(dashboardTransport);process.env.DASHBOARD_INTERNAL_URL='http://evil.example:3000';assert.throws(dashboardTransport);}
 finally{process.env.PUBLIC_SITE_BRIDGE_TOKEN=token;process.env.DASHBOARD_INTERNAL_URL=url;}
});
test('submission forwards only service credentials and visitor IP; receipt stays private',async()=>{
 const fake=mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
  assert.equal(String(input),'http://dashboard:3000/api/site/applications');const h=new Headers(init?.headers);
  assert.equal(h.get('authorization'),'Bearer '+'a'.repeat(64));assert.equal(h.get('cookie'),null);assert.equal(h.get('origin'),'https://lihvodruida.pp.ua');assert.equal(h.get('x-site-client-ip'),'203.0.113.10');assert.equal(init?.redirect,'error');
  return Response.json({ok:true,application_number:25,tracking_number:'private-receipt',duplicate:false,discord:'never expose'},{status:201});
 });
 try{const response=await submitApplication(request());assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:true,application_number:25,tracking_number:'private-receipt',duplicate:false});}
 finally{fake.mock.restore();}
});
test('origin, consent, fields and chunked oversized body reject before upstream',async()=>{
 let calls=0;const fake=mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not call');});
 try{
  assert.equal((await submitApplication(request(valid,{Origin:'https://evil.example'}))).status,403);
  assert.equal((await submitApplication(request({...valid,consent:false}))).status,400);
  assert.equal((await submitApplication(request({...valid,sourcePlatform:''}))).status,400);
  assert.equal((await submitApplication(request({...valid,availability:'a'.repeat(20000)}))).status,413);
  assert.equal(calls,0);
 }finally{fake.mock.restore();}
});
test('rate-limit cooldown retained; failed acknowledgements never claim success',async()=>{
 let mode='rate';const fake=mock.method(globalThis,'fetch',async()=>mode==='rate'?Response.json({error:'Зачекай'},{status:429,headers:{'Retry-After':'120'}}):Response.json({ok:true,application_number:'bad',tracking_number:'bad'}));
 try{let response=await submitApplication(request());assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'120');mode='bad';response=await submitApplication(request());assert.equal(response.status,503);assert.equal((await response.json()).ok,undefined);}
 finally{fake.mock.restore();}
});
test('bounded reader limits actual UTF-8 bytes',async()=>{await assert.rejects(boundedText(new Response('і'.repeat(9)).body,16),/body_limit/);});
