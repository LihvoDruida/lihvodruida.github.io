import {siteSync} from '@/lib/site-sync';
import {bridgeError} from '@/lib/bridge-error';
// Register resources in this runtime before checking for a changed revision.
import '@/lib/content';
import {snapshotResponse} from '@/lib/bridge';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Lihvo-Site-Api':'v1'};
 try{const value=await siteSync();return snapshotResponse(request,{data:value,sync:{source:'dashboard',stale:false,checkedAt:value.checked_at,updatedAt:null}});}
 catch(error){return Response.json({ok:false,...bridgeError(error)},{status:503,headers});}
}
