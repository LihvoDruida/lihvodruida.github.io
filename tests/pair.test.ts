import './fixtures';
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {submitApplication} from '../src/lib/submit-application';
const root=process.env.PAIRED_DASHBOARD_ROOT;
test('paired dashboard route accepts service POST, deduplicates and sanitizes receipt',{skip:!root},async()=>{
 const require=createRequire(import.meta.url);const load=require(path.join(root!,'scripts/lib/load-server-ts.cjs'));
 assert.equal(readFileSync(path.join(root!,'src/lib/applicationContract.ts'),'utf8'),readFileSync('src/lib/applicationContract.ts','utf8'));
 const {NextRequest,NextResponse}=require(path.join(root!,'node_modules/next/server'));
 const validator=load('src/lib/applicationContract.ts').exports;
 const auth=load('src/lib/siteBridgeAuth.ts',{}, {process:{env:{PUBLIC_SITE_BRIDGE_TOKEN:'a'.repeat(64)}}}).exports;
 let creations=0,notifications=0;const keys:string[]=[];
 const item={number:42,tracking_number:'tracking-private',character_name:'Sebas',realm:'Terokkar',status_key:'review',status_text:'На розгляді',discord:'never public'};
 const route=load('src/app/api/site/applications/route.ts',{
  'next/server':{NextRequest,NextResponse},'@/lib/applicationContract':validator,'@/lib/siteBridgeAuth':auth,
  '@/lib/publicSiteBridge':{isAllowedPublicSiteOrigin:(r:Request)=>r.headers.get('origin')==='https://lihvodruida.pp.ua',publicSiteCorsHeaders:()=>({'Cache-Control':'no-store'})},
  '@/lib/security':{assertRequestBodySize:()=>null,checkRateLimit:(key:string)=>{keys.push(key);return {ok:true}},getClientIp:()=>{throw Error('trusted service IP should be used')},logDashboardEvent:()=>{},safeErrorMessage:()=>''},
  '@/lib/discord':{notifyDiscordNewApplication:async()=>{notifications++;return {ok:true,channel_id:'123',message_id:'456'}}},
  '@/lib/applicationsStore':{createGuildApplication:async()=>({item,duplicate:creations++>0}),sanitizeApplicationForPublicSite:()=>item,setApplicationDiscordMessageRef:async()=>true},
 }).exports;
 const fake=mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>route.POST(new NextRequest(String(input),init)));
 const payload={characterName:'Sebas',realm:'Terokkar',faction:'Alliance',className:'Druid',discord:'sebas',availability:'Увечері після 19:00',sourceCreator:'Лігво Друїда',sourcePlatform:'Twitch',consent:true};
 const request=()=>new Request('https://lihvodruida.pp.ua/api/bridge/applications',{method:'POST',headers:{Origin:'https://lihvodruida.pp.ua','Content-Type':'application/json','X-Real-IP':'203.0.113.5'},body:JSON.stringify(payload)});
 try{
  const first=await submitApplication(request());assert.equal(first.status,201);const receipt=await first.json();assert.equal(receipt.application_number,42);assert.equal(receipt.tracking_number,'tracking-private');assert.equal(receipt.discord,undefined);
  const second=await submitApplication(request());assert.equal(second.status,200);assert.equal((await second.json()).duplicate,true);assert.equal(notifications,1);assert.ok(keys.every(key=>key.includes('203.0.113.5')));
  const direct=await route.POST(new NextRequest('http://dashboard:3000/api/site/applications',{method:'POST',headers:{Origin:'https://lihvodruida.pp.ua'},body:JSON.stringify(payload)}));assert.equal(direct.status,403);assert.equal(creations,2);
  assert.equal(auth.hasSiteBridgeToken(new Request('http://dashboard:3000',{headers:{Authorization:'Bearer '+'é'.repeat(64)}})),false);
 }finally{fake.mock.restore();}
});
