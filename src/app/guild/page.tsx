import {fallbackGuild,data,type ProfessionData} from '@/lib/content';
import {GuildView} from '@/components/GuildView';
export const metadata={title:'Mistblossom Vanguard — склад і прогрес',alternates:{canonical:'/guild'}};
export default function Guild(){const g=fallbackGuild();const professions=data<ProfessionData>('professions').characters.map(p=>({name:p.name,realm:p.realm,items:p.professions.primaries.map(x=>{const t=x.tiers.at(-1);return `${x.name}${t?` · ${t.name}: ${t.learned_points}/${t.max_points}`:''}`;})}));return <div className="content-shell"><GuildView initial={{data:g,sync:{source:'archive',stale:true,checkedAt:null,updatedAt:g.metadata.updated_at}}} professions={professions}/></div>;}
