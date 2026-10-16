import {getMods} from '@/lib/curseforge';
import {ModsView} from '@/components/ModsView';
export const dynamic='force-dynamic';
export const metadata={title:'Авторські адони',alternates:{canonical:'/mods'}};
export default async function Mods(){const data=await getMods();return <ModsView initial={{data,sync:{source:data.source,stale:data.stale,checkedAt:new Date().toISOString(),updatedAt:data.updatedAt}}}/>;}
