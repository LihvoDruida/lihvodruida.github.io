import {createHash,randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {SnapshotCache} from './bridge-cache';
import {dashboardUrl,fallbackGuild} from './content';
import {applicationQuery,isApplications,isGuild,publicApplications,type Applications,type Guild,type Envelope} from './contracts';
const guildCache=new SnapshotCache<Guild>(60000,15*60000);
const applicationCaches=new Map<string,SnapshotCache<Applications>>();
const deadline=8000;
export function logBridge(event:string,fields:Record<string,string|number|boolean>={}){if(event==='bridge.unchanged'&&process.env.SITE_DEBUG_LOGS!=='true')return;console.info(JSON.stringify({time:new Date().toISOString(),service:'lihvodruida-site',level:event==='bridge.failed'?'warn':event==='bridge.unchanged'?'debug':'info',event,...fields}));}
const revisions=new Map<string,string>();
async function upstream<T>(resource:string,validate:(x:unknown)=>x is T):Promise<T>{
 const start=Date.now();const requestId=randomUUID();
 try{
  const response=await fetch(new URL(`/api/site/${resource}`,dashboardUrl()),{cache:'no-store',signal:AbortSignal.timeout(deadline),redirect:'error',headers:{Accept:'application/json','X-Request-Id':requestId}});
  if(!response.ok)throw new Error(`http_${response.status}`);
  // Bound actual response bytes, including responses without Content-Length.
  const reader=response.body?.getReader();if(!reader)throw new Error('empty_body');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024)throw new Error('body_limit');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!validate(value))throw new Error('invalid_schema');
  const {generated_at:_,updated_at:__,...stable}=value as Record<string,unknown>;const revision=createHash('sha256').update(JSON.stringify(stable)).digest('hex');const unchanged=revisions.get(resource)===revision;if(revisions.size>=100)revisions.delete(revisions.keys().next().value!);revisions.set(resource,revision);logBridge(unchanged?'bridge.unchanged':'bridge.refreshed',{resource:resource.split('?')[0],requestId,durationMs:Date.now()-start});return value;
 }catch(error){const name=error instanceof Error?error.message:'';logBridge('bridge.failed',{resource:resource.split('?')[0],requestId,durationMs:Date.now()-start,reason:/^(http_\d{3}|body_limit|invalid_schema|empty_body)$/.test(name)?name:'transport_error'});throw error;}
}
export async function guildSnapshot():Promise<Envelope<Guild>>{
 try{const s=await guildCache.get(()=>upstream('guild',isGuild));return {data:s.data,sync:{source:s.stale?'cache':'dashboard',stale:s.stale,checkedAt:new Date(s.at).toISOString(),updatedAt:s.data.metadata.updated_at}};}
 catch{return {data:fallbackGuild(),sync:{source:'archive',stale:true,checkedAt:null,updatedAt:fallbackGuild().metadata.updated_at}};}
}
export async function applicationsSnapshot(params:URLSearchParams):Promise<Envelope<Applications>>{
 const query=applicationQuery(params).toString();let cache=applicationCaches.get(query);
 if(!cache){if(applicationCaches.size>=100)applicationCaches.delete(applicationCaches.keys().next().value!);cache=new SnapshotCache<Applications>(15000,120000);applicationCaches.set(query,cache);}
 const s=await cache.get(async()=>publicApplications(await upstream(`applications?${query}`,isApplications)));
 return {data:s.data,sync:{source:s.stale?'cache':'dashboard',stale:s.stale,checkedAt:new Date(s.at).toISOString(),updatedAt:s.data.updated_at}};
}
export function snapshotResponse(request:Request,payload:Envelope<Guild|Applications>){
 // Exclude transport timestamps so unchanged polls reuse the same content revision.
 const {generated_at:_,updated_at:__,...stable}=payload.data as unknown as Record<string,unknown>;
 const etag='"'+createHash('sha256').update(JSON.stringify({data:stable,source:payload.sync.source,stale:payload.sync.stale})).digest('hex').slice(0,24)+'"';
 const headers={'ETag':etag,'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff','X-Sync-Checked-At':payload.sync.checkedAt||'','X-Sync-Source':payload.sync.source};
 return request.headers.get('if-none-match')===etag?new NextResponse(null,{status:304,headers}):NextResponse.json(payload,{headers});
}
