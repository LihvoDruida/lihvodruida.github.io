import {guild,syncFixtureResponse} from './fixtures';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotCache} from '../src/lib/bridge-cache';
import {applicationQuery,isApplications,isGuild,publicApplications,validateApplication,safeUrl} from '../src/lib/contracts';
import {articles,data,type Mod,type Community} from '../src/lib/content';
test('simultaneous visitors share one upstream request',async()=>{let calls=0;const cache=new SnapshotCache<number>(100,1000);const load=async()=>{calls++;await Promise.resolve();return 7};assert.deepEqual((await Promise.all(Array.from({length:50},()=>cache.get(load)))).map(s=>s.data),Array(50).fill(7));assert.equal(calls,1)});
test('fresh cache, bounded stale fallback, cooldown, and recovery',async()=>{let now=0,calls=0;const cache=new SnapshotCache<number>(100,1000,()=>now);await cache.get(async()=>5);now=101;const bad=async()=>{calls++;throw Error('offline')};assert.equal((await cache.get(bad)).stale,true);now=110;assert.equal((await cache.get(bad)).data,5);assert.equal(calls,1);now=1100;await assert.rejects(cache.get(bad));assert.equal(calls,1);now=5000;assert.equal((await cache.get(async()=>9)).data,9);assert.equal((await cache.get(bad)).stale,false)});
test('cold outages are coalesced and do not hot-loop',async()=>{let calls=0;const cache=new SnapshotCache(100,1000);const bad=async()=>{calls++;throw Error('offline')};await Promise.allSettled(Array.from({length:20},()=>cache.get(bad)));await assert.rejects(cache.get(bad));assert.equal(calls,1)});
test('invalid public payloads cannot replace a good snapshot',()=>{assert.equal(isGuild({...guild,schema:'mistblossom.public-guild.v1'}),true);assert.equal(isGuild({schema:'mistblossom.public-guild.v1',guild:{name:'X'}}),false);assert.equal(isGuild({...guild,schema:'mistblossom.public-guild.v1',members:[{rank:1,character:{name:'X'}}]}),false);assert.equal(isApplications({schema:'mistblossom.public-applications.v1',items:[],counts:{all:'12'}}),false)});
test('public application projection strips private and unknown fields',()=>{const input={schema:'mistblossom.public-applications.v1',updated_at:'2026-10-15',counts:{all:1,review:1,accepted:0,declined:0,secret:123},secret:'private',items:[{number:12,character_name:'Khayen',realm:'Terokkar',class_name:'Druid',faction:'Alliance',status_key:'review',status_text:'На розгляді',created_at:'2026-10-15',updated_at:'2026-10-15',discord:'private',battle_tag:'private',availability:'private',tracking_number:'private',secret:'private'}]};assert.ok(isApplications(input));const result=JSON.stringify(publicApplications(input));assert.ok(!result.includes('private'));assert.ok(!result.includes('secret'));assert.ok(result.includes('Khayen'))});
test('only bounded, supported application filters reach dashboard',()=>{const q=applicationQuery(new URLSearchParams({limit:'100000',q:'a'.repeat(200),token:'secret',redirect:'http://localhost',status:'accepted'}));assert.equal(q.get('q')?.length,80);assert.equal(q.get('limit'),'100');assert.equal(q.get('token'),null);assert.equal(q.get('redirect'),null)});
const valid={characterName:'Khayen',realm:'Terokkar',region:'eu',faction:'Alliance',className:'Druid',discord:'sebas_druid',battleTag:'',availability:'Увечері після 19:00',sourceCreator:'Лігво Друїда',sourcePlatform:'Twitch',consent:true};
test('form uses dashboard field rules, including Horde BattleTag',()=>{assert.equal(validateApplication(valid),null);assert.match(validateApplication({...valid,faction:'Horde'})||'',/BattleTag/);assert.equal(validateApplication({...valid,faction:'Horde',battleTag:'Name#12345'}),null);assert.ok(validateApplication({...valid,discord:'bad name'}));assert.ok(validateApplication({...valid,characterName:'1x'}));assert.ok(validateApplication({...valid,website:'bot'}));assert.ok(validateApplication({...valid,sourceCreator:'Інше'}))});
test('external URLs disallow script and insecure navigation',()=>{assert.equal(safeUrl('javascript:alert(1)'),'#');assert.equal(safeUrl('http://example.org'),'#');assert.equal(safeUrl('https://raider.io/characters/eu/test'),'https://raider.io/characters/eu/test')});
test('articles are loaded asynchronously from dashboard CMS rather than local Markdown',async()=>{
 const originalFetch=globalThis.fetch;
 const urls:string[]=[];
 const items=[
  {kind:'guides',slug:'guide-older',title:'Guide older',description:'Older guide',body:'Old guide content',image:'/assets/img/news-placeholder.webp',date:'2026-09-01',author:'Admin',tags:[]},
  {kind:'news',slug:'news-latest',title:'News latest',description:'Latest news',body:'New update',image:'/assets/img/news-placeholder.webp',date:'2026-10-15',author:'Admin',tags:[]},
  {kind:'guides',slug:'guide-newer',title:'Guide newer',description:'Newer guide',body:'New guide content',image:'/assets/img/news-placeholder.webp',date:'2026-10-01',author:'Admin',tags:[]},
 ];
 globalThis.fetch=async (input)=>{
  const sync=syncFixtureResponse(input);if(sync)return sync;
  urls.push(String(input));
  return new Response(JSON.stringify({schema:'mistblossom.public-content.v2',revision:'test',next_page:null,total:items.length,updated_at:'2026-10-15T12:00:00Z',items}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const guides=await articles('guides');
  assert.deepEqual(guides.map(a=>a.slug),['guide-newer','guide-older']);
  const news=await articles('news');
  assert.deepEqual(news.map(a=>a.slug),['news-latest']);
  assert.ok(urls.length>=1);
  assert.ok(urls.every(url=>new URL(url).pathname==='/api/site/content'));
 }finally{globalThis.fetch=originalFetch;}
});
test('community and addon reference data stay available',()=>{
 assert.ok(data<Mod[]>('my_mods').length>=8);
 assert.deepEqual(data<Community[]>('guilds').map(g=>g.id),['mistblossom','varta']);

});
