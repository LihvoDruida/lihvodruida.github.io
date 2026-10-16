import {dashboardTransport} from '@/lib/config';
import {boundedText} from '@/lib/http';
import {SnapshotCache} from '@/lib/bridge-cache';
import {assertDashboardResponse,bridgeError,BridgeError} from '@/lib/bridge-error';
import {SITE_API_BASE} from '@/lib/public-paths';
export const dynamic='force-dynamic';
const status=new SnapshotCache<boolean>(10000,0);
export async function GET(){
 const headers={'Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Lihvo-Site-Api':'v1'};
 try{
  await status.get(async()=>{
   const transport=dashboardTransport();const response=await fetch(new URL('/api/site/status',transport.base),{headers:transport.headers,redirect:'error',signal:AbortSignal.timeout(8000),cache:'no-store'});
   assertDashboardResponse(response);const data=JSON.parse(await boundedText(response.body,8192));
   if(data.ok!==true||data.protocol!=='mistblossom.site-bridge.v2'||data.store!=='postgres'||data.schemas?.content!=='mistblossom.public-content.v2'||!Array.isArray(data.capabilities)||!data.capabilities.includes('sync:revisions:v1')||!data.capabilities.includes('guild:raid-history:v2'))throw new BridgeError('invalid_schema');
   return true;
  });
  return Response.json({ok:true,integration:'ready',service:'lihvodruida-site',api_base:SITE_API_BASE},{headers});
 }catch(error){const failure=bridgeError(error);return Response.json({ok:false,integration:'unavailable',service:'lihvodruida-site',api_base:SITE_API_BASE,...failure},{status:503,headers:{...headers,'Retry-After':'10'}});}
}
