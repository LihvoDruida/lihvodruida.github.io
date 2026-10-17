import {staticMetadata} from '@/lib/seo';
import {PageSeo} from '@/components/PageSeo';
import {getMods} from '@/lib/curseforge';
import {ModsView} from '@/components/ModsView';
export const dynamic='force-dynamic';
export const metadata=staticMetadata('/mods');
export default async function Mods(){const data=await getMods();return <><div className="content-shell"><PageSeo path="/mods" kind="CollectionPage"/></div><ModsView initial={{data,sync:{source:data.source,stale:data.stale,checkedAt:new Date().toISOString(),updatedAt:data.updatedAt}}}/></>;}
