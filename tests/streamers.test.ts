import './fixtures';
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {isPublicStreamers,channelIdentity,canManageStreamers} from '../src/lib/streamers-contract';
import {streamersSnapshot} from '../src/lib/bridge';
const live={id:'123',title:'Рейд наживо',url:'https://www.twitch.tv/sebas',publishedAt:new Date().toISOString()};
const item={id:'streamer-1',memberName:'Sebas',platform:'twitch',channelUrl:'https://www.twitch.tv/sebas',live,expiresAt:new Date(Date.now()+300000).toISOString()};
test('streamer contract rejects unsafe URLs and never grants moderation roles management',()=>{
 const data={schema:'mistblossom.public-streamers.v1',checked_at:new Date().toISOString(),items:[item]};assert.equal(isPublicStreamers(data),true);
 assert.equal(isPublicStreamers({...data,items:[{...item,live:{...live,url:'javascript:alert(1)'}}]}),false);
 assert.throws(()=>channelIdentity('twitch','https://twitch.tv.evil.example/sebas'));
 assert.equal(canManageStreamers({role:'moderator'}),false);assert.equal(canManageStreamers({role:'admin'}),true);
});
test('site bridge serves only explicit streamer fields, filters expired and excessive future LIVE, and uses service auth',async()=>{
 const fake=mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
  assert.equal(String(input),'http://dashboard:3000/api/site/streamers');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+'a'.repeat(64));assert.equal(new Headers(init?.headers).get('cookie'),null);
  return Response.json({schema:'mistblossom.public-streamers.v1',checked_at:new Date().toISOString(),token:'SECRET-TOP',items:[{...item,token:'SECRET-ROW',memberId:'PRIVATE-ID',live:{...live,access_token:'SECRET-MEDIA'}},{...item,id:'expired',expiresAt:new Date(Date.now()-1000).toISOString()},{...item,id:'far-future',expiresAt:new Date(Date.now()+86400000).toISOString()}]});
 });
 try{const result=await streamersSnapshot();assert.equal(result.data.items.length,1);const raw=JSON.stringify(result);for(const value of ['SECRET','PRIVATE-ID','token','memberId'])assert.equal(raw.includes(value),false);assert.equal(result.sync.stale,false);}finally{fake.mock.restore();}
});
