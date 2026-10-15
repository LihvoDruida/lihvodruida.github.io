import {NextResponse} from 'next/server';
import {guildSnapshot,snapshotResponse} from '@/lib/bridge';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:Request){try{return snapshotResponse(request,await guildSnapshot());}catch{return NextResponse.json({error:'Дані гільдії тимчасово недоступні.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});}}
