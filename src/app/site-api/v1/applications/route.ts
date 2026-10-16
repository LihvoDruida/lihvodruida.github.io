import {NextResponse} from 'next/server';
import {bridgeError} from '@/lib/bridge-error';
import {applicationsSnapshot,snapshotResponse} from '@/lib/bridge';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{return snapshotResponse(request,await applicationsSnapshot(new URL(request.url).searchParams));}
 catch(error){const failure=bridgeError(error);return NextResponse.json(failure,{status:failure.status,headers:{'Cache-Control':'no-store','Retry-After':'10','X-Lihvo-Site-Api':'v1'}});}
}
export {submitApplication as POST} from '@/lib/submit-application';
