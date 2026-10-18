import {NextResponse} from 'next/server';
import {streamersSnapshot,snapshotResponse} from '@/lib/bridge';
import {bridgeError} from '@/lib/bridge-error';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{return snapshotResponse(request,await streamersSnapshot());}catch(error){const failure=bridgeError(error);return NextResponse.json(failure,{status:failure.status,headers:{'Cache-Control':'no-store','Retry-After':'30','X-Lihvo-Site-Api':'v1'}});}}
