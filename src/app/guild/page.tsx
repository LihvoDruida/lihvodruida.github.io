import {data,type ProfessionData} from '@/lib/content';
import {guildSnapshot} from '@/lib/bridge';
import {GuildView} from '@/components/GuildView';
export const metadata={title:'Mistblossom Vanguard — склад і прогрес',alternates:{canonical:'/guild'}};
export const dynamic='force-dynamic';
export default async function Guild(){const snapshot=await guildSnapshot();const professions=data<ProfessionData>('professions').characters.map(p=>({name:p.name,realm:p.realm,items:p.professions.primaries.map(x=>{const t=x.tiers.at(-1);return `${x.name}${t?` · ${t.name}: ${t.learned_points}/${t.max_points}`:''}`;})}));return <div className="content-shell"><GuildView initial={snapshot} professions={professions}/></div>;}
