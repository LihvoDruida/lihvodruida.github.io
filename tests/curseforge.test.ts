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
