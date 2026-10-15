import {NextResponse} from 'next/server';
import {applicationsSnapshot,snapshotResponse} from '@/lib/bridge';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:Request){try{return snapshotResponse(request,await applicationsSnapshot(new URL(request.url).searchParams));}catch{return NextResponse.json({error:'Статуси тимчасово недоступні. Спробуй пізніше.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});}}
