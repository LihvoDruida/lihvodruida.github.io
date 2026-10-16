import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {applicationsSnapshot,guildSnapshot,snapshotResponse} from '../src/lib/bridge';
import {syncFixtureResponse} from './fixtures';
const application={schema:'mistblossom.public-applications.v1',updated_at:'2026-10-15',counts:{all:1,review:1,accepted:0,declined:0},items:[{number:1,character_name:'Khayen',realm:'Terokkar',status_key:'review',discord:'must-not-pass',battle_tag:'must-not-pass'}]};
test('bridge reads only configured dashboard, projects contacts, caches and returns 304',async()=>{
 let calls=0;const requests:string[]=[];const fake=mock.method(globalThis,'fetch',async(input:string|URL|Request,init?:RequestInit)=>{const sync=syncFixtureResponse(input);if(sync)return sync;calls++;requests.push(String(input));assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');assert.ok(init?.signal);return Response.json(application)});
 try{
  const params=new URLSearchParams({q:'wire-test',evil:'secret'});const s=await applicationsSnapshot(params);assert.equal(calls,1);assert.ok(requests[0].startsWith('http://dashboard:3000/api/site/applications?'));assert.ok(!requests[0].includes('evil'));assert.ok(!JSON.stringify(s).includes('must-not-pass'));await applicationsSnapshot(params);assert.equal(calls,1);
  const r=snapshotResponse(new Request('https://lihvodruida.pp.ua/site-api/v1/applications'),s);assert.equal(r.status,200);const etag=r.headers.get('etag')!;
  const second=snapshotResponse(new Request('https://lihvodruida.pp.ua/site-api/v1/applications',{headers:{'if-none-match':etag}}),{...s,data:{...s.data,updated_at:'2027-01-01'},sync:{...s.sync,checkedAt:'2027-01-01'}});assert.equal(second.status,304);assert.equal(await second.text(),'');
 }finally{fake.mock.restore()}
});
test('invalid and oversized upstream responses are rejected',async()=>{let mode='invalid';const fake=mock.method(globalThis,'fetch',async()=>mode==='invalid'?Response.json({items:[]}):new Response(' '.repeat(4*1024*1024+1)));try{await assert.rejects(applicationsSnapshot(new URLSearchParams({q:'invalid-wire'})));mode='large';await assert.rejects(applicationsSnapshot(new URLSearchParams({q:'oversized-wire'})));}finally{fake.mock.restore()}});
test('cold dashboard outage is an error; no old guild archive is served',async()=>{const fake=mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));try{await assert.rejects(guildSnapshot());}finally{fake.mock.restore()}});
