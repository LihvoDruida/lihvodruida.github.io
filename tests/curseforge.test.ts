import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {getMods} from '../src/lib/curseforge';
const raw={id:123,name:'Test Addon',dateReleased:'2025-01-01',dateModified:'2026-10-16',authors:[{id:104580421}],latestFiles:[{displayName:'1.2.3.zip',fileDate:'2026-10-16',gameVersions:['12.0.7']}],links:{websiteUrl:'https://www.curseforge.com/wow/addons/test'}};
test('missing key is a labelled catalogue, not claimed live data',async()=>{delete process.env.CURSEFORGE_API_KEY;const result=await getMods();assert.equal(result.source,'catalog');assert.equal(result.stale,true);assert.equal(result.code,'curseforge_key_missing');});
test('403 is classified and negatively cached; literal dollar signs reach x-api-key',async()=>{
 const key='$2a$10$test-literal-dollar-signs-403';process.env.CURSEFORGE_API_KEY=key;let calls=0;
 const fake=mock.method(globalThis,'fetch',async(_input:unknown,init?:RequestInit)=>{calls++;assert.equal(new Headers(init?.headers).get('x-api-key'),key);return Response.json({},{status:403});});
 try{const results=await Promise.all(Array.from({length:20},()=>getMods()));assert.ok(results.every(x=>x.source==='catalog'&&x.stale&&x.code==='curseforge_access_denied'));await getMods();assert.equal(calls,1);assert.ok(!JSON.stringify(results).includes(key));}finally{fake.mock.restore();}
});
test('successful reads coalesce, use dateModified and refresh when key rotates',async()=>{
 process.env.CURSEFORGE_API_KEY='valid-test-key-that-is-private-1';let calls=0;
 const fake=mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{calls++;assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');const url=new URL(String(input));assert.equal(url.searchParams.get('authorId'),'104580421');return Response.json({data:[raw]});});
 try{const results=await Promise.all(Array.from({length:20},()=>getMods()));assert.equal(calls,1);assert.ok(results.every(x=>x.source==='curseforge'&&!x.stale));assert.equal(results[0].mods[0].updated_at,'2026-10-16');assert.equal(results[0].mods[0].version,'1.2.3');process.env.CURSEFORGE_API_KEY='valid-test-key-that-is-private-2';await getMods();assert.equal(calls,2);}finally{fake.mock.restore();}
});
test('malformed or wrong-author responses cannot become an empty successful update',async()=>{
 let mode='invalid';const fake=mock.method(globalThis,'fetch',async()=>Response.json(mode==='invalid'?{}:{data:[{...raw,authors:[{id:1}]}]}));
 try{process.env.CURSEFORGE_API_KEY='invalid-response-test-private-key';assert.equal((await getMods()).code,'curseforge_schema');mode='other';process.env.CURSEFORGE_API_KEY='other-author-test-private-key';assert.equal((await getMods()).code,'curseforge_empty');}finally{fake.mock.restore();}
});
test('versions include every flavour index, stable releases win over newer betas, unavailable mods are skipped',async()=>{
 process.env.CURSEFORGE_API_KEY='flavour-index-test-private-key';
 const mod={...raw,id:777,latestFiles:[{displayName:'2.0.0-beta.zip',fileDate:'2026-11-10',releaseType:2,gameVersions:['12.0.7']},{displayName:'1.9.0.zip',fileDate:'2026-11-01',releaseType:1,gameVersions:['12.0.5']}],latestFilesIndexes:[{gameVersion:'1.15.8'},{gameVersion:'5.5.3'},{gameVersion:'12.0.5'},{gameVersion:'Retail'}]};
 const fake=mock.method(globalThis,'fetch',async()=>Response.json({data:[mod,{...raw,id:778,name:'Gone',isAvailable:false}]}));
 try{const result=await getMods();assert.equal(result.source,'curseforge');assert.deepEqual(result.mods.map(m=>m.id),[777]);
  assert.equal(result.mods[0].version,'1.9.0');assert.deepEqual(result.mods[0].game_versions,['12.0.7','12.0.5','5.5.3','1.15.8']);}finally{fake.mock.restore();}
});
test('a truncated or non-JSON body is a schema error, not an outage',async()=>{
 process.env.CURSEFORGE_API_KEY='broken-json-test-private-key';
 const fake=mock.method(globalThis,'fetch',async()=>new Response('{"data":[',{headers:{'Content-Type':'application/json'}}));
 try{assert.equal((await getMods()).code,'curseforge_schema');}finally{fake.mock.restore();}
});
test('last successful snapshot survives a restart during a 403 with its real date, then refreshes (C34)',async()=>{
 const {mkdtempSync,readFileSync,rmSync,statSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'site-state-'));process.env.SITE_STATE_DIR=dir;
 try{
  process.env.CURSEFORGE_API_KEY='persist-success-private-key';
  let fake=mock.method(globalThis,'fetch',async()=>Response.json({data:[{...raw,id:901,name:'Persisted'}]}));
  const live=await getMods();fake.mock.restore();assert.equal(live.source,'curseforge');
  const file=join(dir,'curseforge-104580421.json');const saved=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(saved.mods[0].name,'Persisted');assert.equal(statSync(file).mode&0o777,0o600);assert.ok(!readFileSync(file,'utf8').includes('persist-success-private-key'));
  // A different key models a fresh process: no in-memory state, CurseForge refuses.
  process.env.CURSEFORGE_API_KEY='persist-restart-private-key';
  fake=mock.method(globalThis,'fetch',async()=>Response.json({},{status:403}));
  const restarted=await getMods();fake.mock.restore();
  assert.equal(restarted.source,'cache');assert.equal(restarted.stale,true);assert.equal(restarted.code,'curseforge_access_denied');
  assert.equal(restarted.updatedAt,live.updatedAt);assert.deepEqual(restarted.mods.map(m=>m.name),['Persisted']);
  // A corrupt or foreign file is ignored rather than trusted.
  const {writeFileSync}=await import('node:fs');writeFileSync(file,'{"authorId":"1","updatedAt":"2026-01-01","mods":[]}');
  process.env.CURSEFORGE_API_KEY='persist-corrupt-private-key';
  fake=mock.method(globalThis,'fetch',async()=>Response.json({},{status:403}));
  const corrupt=await getMods();fake.mock.restore();assert.equal(corrupt.source,'catalog');
 }finally{delete process.env.SITE_STATE_DIR;rmSync(dir,{recursive:true,force:true});}
});
