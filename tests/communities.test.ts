import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {syncFixtureResponse} from './fixtures';
import {invalidateSyncProbe} from '../src/lib/site-sync';
import {communityCards,communityLogoPath,parseCommunities,staticCommunities} from '../src/lib/communities';

const payload={schema:'mistblossom.public-communities.v1',revision:3,updated_at:null,items:[
 {id:'varta',name:'VARTA',game:'Aion',logo:'/api/site/media/'+'b'.repeat(64),description:'Легіон.',page:'',pageLabel:'x',details:[{label:'Сервер',value:'RiftShade'}],links:[{label:'Discord легіону',url:'https://discord.gg/B7JxeZEyaE'},{label:'Bad',url:'javascript:alert(1)'}]},
 {id:'mistblossom',name:'Mistblossom Vanguard',game:'World of Warcraft',logo:'/assets/img/guild-logo.webp',description:'Гільдія.',page:'/guild',pageLabel:'Про гільдію',details:[{label:'Реалм',value:'EU · Terokkar'}],links:[]},
]};

test('panel communities keep their order; uploaded logos go through the site media proxy',()=>{
 const items=parseCommunities(payload);
 assert.deepEqual(items.map(c=>c.id),['varta','mistblossom']);
 assert.equal(items[0].logo,'/site-api/v1/media/'+'b'.repeat(64));
 assert.equal(items[0].page,'');assert.equal(items[0].pageLabel,'','no page, no button');
 assert.deepEqual(items[0].links.map(l=>l.label),['Discord легіону'],'non-https links are dropped');
 assert.equal(items[1].page,'/guild');assert.equal(items[1].pageLabel,'Про гільдію');
 assert.deepEqual(items[1].details,['EU · Terokkar']);
});

test('only site artwork or panel media can be a logo',()=>{
 assert.equal(communityLogoPath('https://evil.example/x.png'),'/assets/img/guild-logo.webp');
 assert.equal(communityLogoPath('/assets/img/../secret.png'),'/assets/img/guild-logo.webp');
 assert.equal(communityLogoPath('/assets/img/varta-logo.webp'),'/assets/img/varta-logo.webp');
 assert.throws(()=>parseCommunities({schema:'other',items:[]}));
});

test('panel data is used when the bridge answers',async()=>{
 const fetchMock=mock.method(globalThis,'fetch',async(input:string|URL|Request)=>syncFixtureResponse(input)||Response.json(payload));
 try{
  const result=await communityCards();
  assert.equal(result.source,'dashboard');
  assert.equal(result.items[0].id,'varta');
 }finally{fetchMock.mock.restore();}
});

test('panel failure keeps the previous static communities',async()=>{
 // A new content revision invalidates the cached panel data, then the panel fails.
 invalidateSyncProbe();
 const fetchMock=mock.method(globalThis,'fetch',async(input:string|URL|Request)=>new URL(typeof input==='string'||input instanceof URL?input:input.url).pathname==='/api/site/sync'?Response.json({schema:'mistblossom.public-sync.v1',resources:{content:'f'.repeat(32),guild:'2'.repeat(32),applications:'3'.repeat(32)},checked_at:new Date().toISOString()}):new Response('{}',{status:503}));
 try{
  const result=await communityCards();
  assert.equal(result.source,'catalog');
  assert.deepEqual(result.items.map(c=>c.id),staticCommunities().map(c=>c.id));
  assert.ok(!result.items.find(c=>c.id==='mistblossom')!.details.includes('Horde'),'faction chip stays hidden as before');
 }finally{fetchMock.mock.restore();}
});
