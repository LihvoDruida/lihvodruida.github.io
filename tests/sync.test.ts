import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotCache} from '../src/lib/bridge-cache';
import {invalidateSyncProbe,registerSyncCache,siteSync,syncedSnapshot} from '../src/lib/site-sync';
import {allArticles} from '../src/lib/content';
import './fixtures';
const versions=(content='a',guild='b',applications='c')=>({schema:'mistblossom.public-sync.v1',resources:{content:content.repeat(32),guild:guild.repeat(32),applications:applications.repeat(32)},checked_at:new Date().toISOString()});
test('invalidating an in-flight read never lets its old result replace a newer generation',async()=>{
 const cache=new SnapshotCache<number>(60000,120000);let release!:(value:number)=>void,calls=0;
 const load=()=>{calls++;return calls===1?new Promise<number>(resolve=>release=resolve):Promise.resolve(2);};
 const old=cache.get(load);await Promise.resolve();cache.invalidate();assert.equal((await cache.get(load)).data,2);release(1);assert.equal((await old).data,2);assert.equal((await cache.get(load)).data,2);assert.equal(calls,2);
});
test('database revision changes invalidate only their own cache before its normal TTL',async()=>{
 invalidateSyncProbe();let value=versions(),loads=0,probes=0;const cache=new SnapshotCache<number>(60000,120000);registerSyncCache('content',()=>cache.invalidate());
 const fake=mock.method(globalThis,'fetch',async()=>{probes++;return Response.json(value);});
 try{
  assert.equal((await syncedSnapshot(cache,async()=>++loads)).data,1);await Promise.all(Array.from({length:20},()=>siteSync()));assert.equal(probes,1);
  value=versions('a','d');invalidateSyncProbe();assert.equal((await syncedSnapshot(cache,async()=>++loads)).data,1);
  value=versions('e','d');invalidateSyncProbe();assert.equal((await syncedSnapshot(cache,async()=>++loads)).data,2);
 }finally{fake.mock.restore();invalidateSyncProbe();}
});
test('metadata outages expose a bounded stale snapshot and never claim a fresh result',async()=>{
 const cache=new SnapshotCache<number>(60000,120000);await cache.get(async()=>5);invalidateSyncProbe();const fake=mock.method(globalThis,'fetch',async()=>new Response('offline',{status:503}));
 try{const fallback=await syncedSnapshot(cache,async()=>99);assert.equal(fallback.data,5);assert.equal(fallback.stale,true);await assert.rejects(syncedSnapshot(new SnapshotCache(100,1000),async()=>99));}
 finally{fake.mock.restore();invalidateSyncProbe();}
});
test('CMS retries one mixed pagination revision and removes unpublished content on the next revision',async()=>{
 let stage=0,contentReads=0,unpublished=false;invalidateSyncProbe();
 const article=(slug:string)=>({kind:'guides',slug,title:slug,body:'A complete guide body.',date:'2026-10-16',tags:[]});
 const fake=mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.pathname==='/api/site/sync')return Response.json(versions(unpublished?'f':'e'));
  contentReads++;const page=Number(url.searchParams.get('page'));
  if(unpublished)return Response.json({schema:'mistblossom.public-content.v2',revision:'empty',total:0,next_page:null,items:[]});
  if(page===1)stage++;
  return Response.json({schema:'mistblossom.public-content.v2',revision:stage===1?(page===1?'old':'new'):'coherent',total:2,next_page:page===1?2:null,items:[article(page===1?'first':'second')]});
 });
 try{assert.deepEqual((await allArticles()).map(a=>a.slug),['first','second']);assert.equal(contentReads,4);unpublished=true;invalidateSyncProbe();assert.equal((await allArticles()).length,0);}
 finally{fake.mock.restore();invalidateSyncProbe();}
});
