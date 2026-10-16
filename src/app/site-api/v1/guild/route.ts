import {NextResponse} from 'next/server';
import {bridgeError} from '@/lib/bridge-error';
import {guildSnapshot,snapshotResponse} from '@/lib/bridge';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{return snapshotResponse(request,await guildSnapshot());}
 catch(error){const failure=bridgeError(error);return NextResponse.json(failure,{status:failure.status,headers:{'Cache-Control':'no-store','Retry-After':'10','X-Lihvo-Site-Api':'v1'}});}
}
