import {dashboardTransport} from '@/lib/config';
import {boundedText} from '@/lib/http';
import {SnapshotCache} from '@/lib/bridge-cache';
export const dynamic='force-dynamic';
const status=new SnapshotCache<boolean>(10000,0);
export async function GET(){
 try{
  await status.get(async()=>{
   const transport=dashboardTransport();const response=await fetch(new URL('/api/site/status',transport.base),{headers:transport.headers,redirect:'error',signal:AbortSignal.timeout(8000),cache:'no-store'});
   const data=JSON.parse(await boundedText(response.body,8192));
   if(!response.ok||data.ok!==true||data.protocol!=='mistblossom.site-bridge.v2'||data.store!=='postgres'||data.schemas?.content!=='mistblossom.public-content.v2')throw new Error('unavailable');
   return true;
  });
  return Response.json({ok:true,integration:'ready'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({ok:false,integration:'unavailable'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'10'}});}
}
