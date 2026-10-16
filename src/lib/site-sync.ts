import {SnapshotCache} from './bridge-cache';
import {dashboardTransport} from './config';
import {boundedText} from './http';
import {assertDashboardResponse,BridgeError} from './bridge-error';
import {isSiteSync,type SiteSync,type SyncResource} from './sync-contract';
const probe=new SnapshotCache<SiteSync>(3000,0),known=new Map<SyncResource,string>(),invalidators=new Map<SyncResource,Set<()=>void>>();
export function registerSyncCache(resource:SyncResource,invalidate:()=>void){let group=invalidators.get(resource);if(!group){group=new Set();invalidators.set(resource,group);}group.add(invalidate);}
export function invalidateSyncProbe(){probe.invalidate();}
export async function siteSync(){
 const result=await probe.get(async()=>{
  const transport=dashboardTransport(),response=await fetch(new URL('/api/site/sync',transport.base),{cache:'no-store',redirect:'error',headers:{Accept:'application/json',...transport.headers},signal:AbortSignal.timeout(8000)});
  assertDashboardResponse(response);const value=JSON.parse(await boundedText(response.body,8192));if(!isSiteSync(value))throw new BridgeError('invalid_schema');
  return value;
 });
 for(const resource of ['content','guild','applications'] as const){if(known.get(resource)!==result.data.resources[resource]){known.set(resource,result.data.resources[resource]);for(const invalidate of invalidators.get(resource)||[])invalidate();}}
 return {...result.data,checked_at:new Date(result.at).toISOString()};
}
export async function syncedSnapshot<T>(cache:SnapshotCache<T>,load:()=>Promise<T>){
 try{await siteSync();}catch(error){return cache.fallback(error);}
 return cache.get(load);
}
