import {guildSnapshot,snapshotResponse} from '@/lib/bridge';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:Request){return snapshotResponse(request,await guildSnapshot());}
