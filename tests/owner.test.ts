import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import './fixtures';
import {ownerCharacters,parseOwnerSnapshot,staticOwnerCharacters} from '../src/lib/owner';

const payload={schema:'mistblossom.public-owner.v1',generated_at:'2026-11-22T10:00:00Z',updated_at:null,characters:[
 {name:'Khayen',isMain:true,edition:'retail',className:'Druid',specName:'Balance',raceName:'Haranir',realm:'Terokkar',region:'eu',level:90,itemLevel:712,rio:3151,avatarUrl:'https://render.worldofwarcraft.com/a.jpg',link:'https://raider.io/characters/eu/terokkar/Khayen'},
 {name:'Oldie',isMain:false,edition:'forever',className:'Mage',specName:null,raceName:null,realm:'WoW Forever',region:'eu',level:60,itemLevel:null,rio:999,avatarUrl:'javascript:alert(1)',link:'https://worldofwarcraft.blizzard.com/x'},
 {name:'Krouli',isMain:false,edition:'retail',className:'Demon Hunter',specName:'Havoc',raceName:null,realm:'Terokkar',region:'eu',level:90,itemLevel:705,rio:null,avatarUrl:null,link:''},
]};

test('owner payload keeps the panel order and shows Raider.IO only for Retail',()=>{
 const items=parseOwnerSnapshot(payload);
 assert.deepEqual(items.map(c=>c.name),['Khayen','Oldie','Krouli']);
 assert.equal(items[0].isMain,true);assert.equal(items[0].rio,3151);
 assert.equal(items[1].edition,'forever');assert.equal(items[1].rio,null,'Forever never shows RIO even if the payload has one');
 assert.equal(items[1].avatarUrl,null,'non-https image URLs are dropped');
 assert.equal(items[2].link,null,'empty link renders a non-clickable card');
});

test('owner payload with an unknown schema is rejected',()=>{
 assert.throws(()=>parseOwnerSnapshot({...payload,schema:'other'}));
 assert.throws(()=>parseOwnerSnapshot({schema:'mistblossom.public-owner.v1'}));
});

test('panel failure falls back to the static catalog, main first',async()=>{
 const fetchMock=mock.method(globalThis,'fetch',async()=>new Response('{}',{status:503}));
 try{
  const result=await ownerCharacters();
  assert.equal(result.source,'catalog');
  assert.deepEqual(result.items.map(c=>c.name),staticOwnerCharacters().map(c=>c.name));
  assert.equal(result.items[0].isMain,true);
  assert.ok(result.items.every(c=>c.rio===null));
 }finally{fetchMock.mock.restore();}
});
