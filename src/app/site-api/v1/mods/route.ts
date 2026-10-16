import {getMods} from '@/lib/curseforge';
import {snapshotResponse} from '@/lib/bridge';
export const dynamic='force-dynamic';
export async function GET(request:Request){const data=await getMods();return snapshotResponse(request,{data,sync:{source:data.source,stale:data.stale,checkedAt:new Date().toISOString(),updatedAt:data.updatedAt}});}
