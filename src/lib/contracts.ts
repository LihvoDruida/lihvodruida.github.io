export type Member = { rank:number; character:{name:string; region?:string; realm:{slug:string;name?:string}; playable_class?:{name:string}; playable_race?:{name:string}; active_spec?:{name:string;role:string}; avatar?:string; profile_url?:string; item_level_equipped?:number; mythic_plus_scores?:Record<string,{score:number;color?:string}>} };
export type Progress = {updated_at?:string|null;stale?:boolean;name?:string;summary?:string;total_bosses:number;normal_bosses_killed:number;heroic_bosses_killed:number;mythic_bosses_killed:number};
export type Season = {expansion?:string;slug?:string;starts_at?:string|null;ends_at?:string|null;id:string;label:string;raids:string[];current?:boolean};
export type Guild = {schema?:string;metadata:{updated_at:string;source?:string;stale?:boolean;raid_history?:{state:string;known:number;pending:number;failed:number;updatedAt:string|null}|null};guild:{name:string;realm:{name:string;slug:string};faction?:{name?:string;type?:string};member_count:number;profile_url?:string;achievement_points?:number};members:Member[];raid_progression:Record<string,Progress>;raid_rankings?:Record<string,Record<string,{world:number|null;region:number|null;realm:number|null}>>;raid_seasons?:{schema_version?:number;partial?:boolean;current_season_id?:string;seasons:Season[];catalog?:Record<string,{name:string;bosses:number;expansion?:string;starts_at?:string|null;ends_at?:string|null}>}|null;scheduled_raids?:{id:string;title:string;date:string;time:string;difficulty:string;going:number;capacity:number;raid_leader?:string}[]};
export type Application = {number:number;character_name:string;realm:string;class_name:string;faction:string;status_key:string;status_text:string;created_at:string;updated_at:string};
export type Applications = {schema:string;items:Application[];counts:{all:number;review:number;accepted:number;declined:number};updated_at:string};
export type Envelope<T> = {data:T;sync:{source:'dashboard'|'cache'|'curseforge'|'catalog';stale:boolean;checkedAt:string|null;updatedAt:string|null}};
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown)=>typeof x==='string';
const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const optionalText=(x:unknown)=>x===undefined||x===null||text(x);
const optionalBoolean=(x:unknown)=>x===undefined||typeof x==='boolean';
const count=(x:unknown)=>number(x)&&Number.isInteger(x);
export function isGuild(x:unknown):x is Guild {
 if(!record(x)||x.schema!=='mistblossom.public-guild.v1'||!record(x.guild)||!record(x.guild.realm)||!record(x.metadata)||!text(x.guild.name)||!text(x.guild.realm.name)||!text(x.guild.realm.slug)||!number(x.guild.member_count)||!text(x.metadata.updated_at)||!Array.isArray(x.members)||!record(x.raid_progression)) return false;
 if(x.scheduled_raids!==undefined&&(!Array.isArray(x.scheduled_raids)||!x.scheduled_raids.every(r=>record(r)&&text(r.id)&&text(r.title)&&text(r.date)&&text(r.time)&&number(r.going)&&number(r.capacity))))return false;
 if(x.raid_seasons!==undefined&&x.raid_seasons!==null){
  const seasons=x.raid_seasons;
  if(!record(seasons)||!optionalText(seasons.current_season_id)||!optionalBoolean(seasons.partial)||!Array.isArray(seasons.seasons)||seasons.seasons.length>100||!seasons.seasons.every(s=>record(s)&&text(s.id)&&text(s.label)&&optionalText(s.expansion)&&optionalText(s.starts_at)&&optionalText(s.ends_at)&&optionalBoolean(s.current)&&Array.isArray(s.raids)&&s.raids.length<=100&&s.raids.every(text))||new Set(seasons.seasons.map(s=>s.id)).size!==seasons.seasons.length)return false;
  if(seasons.catalog!==undefined&&(!record(seasons.catalog)||Object.keys(seasons.catalog).length>200||!Object.values(seasons.catalog).every(r=>record(r)&&text(r.name)&&count(r.bosses)&&optionalText(r.expansion))))return false;
 }
 if(x.metadata.raid_history!==undefined&&x.metadata.raid_history!==null){const h=x.metadata.raid_history;if(!record(h)||!['unavailable','partial','ready','pending'].includes(String(h.state))||!['known','pending','failed'].every(k=>count(h[k]))||!optionalText(h.updatedAt))return false;}
 if(x.raid_rankings!==undefined&&(!record(x.raid_rankings)||!Object.values(x.raid_rankings).every(r=>record(r)&&Object.values(r).every(d=>record(d)&&['world','region','realm'].every(key=>d[key]===null||number(d[key]))))))return false;

 return x.members.length<=2000&&x.members.every(m=>record(m)&&number(m.rank)&&record(m.character)&&text(m.character.name)&&record(m.character.realm)&&text(m.character.realm.slug))&&Object.values(x.raid_progression).every(p=>record(p)&&['total_bosses','normal_bosses_killed','heroic_bosses_killed','mythic_bosses_killed'].every(k=>count(p[k]))&&optionalText(p.updated_at)&&optionalBoolean(p.stale)&&(p.total_bosses as number)>0&&['normal_bosses_killed','heroic_bosses_killed','mythic_bosses_killed'].every(k=>(p[k] as number)<=(p.total_bosses as number)));
}
export function isApplications(x:unknown):x is Applications {
 return record(x)&&x.schema==='mistblossom.public-applications.v1'&&text(x.updated_at)&&record(x.counts)&&['all','review','accepted','declined'].every(k=>number((x.counts as Record<string,unknown>)[k]))&&Array.isArray(x.items)&&x.items.length<=100&&x.items.every(a=>record(a)&&number(a.number)&&text(a.character_name)&&text(a.status_key)&&text(a.realm));
}
// An explicit allowlist prevents an upstream contract change from exposing contact data.
export function publicApplications(x:Applications):Applications {return {schema:x.schema,counts:{all:x.counts.all,review:x.counts.review,accepted:x.counts.accepted,declined:x.counts.declined},updated_at:x.updated_at,items:x.items.map(a=>({number:a.number,character_name:a.character_name,realm:a.realm,class_name:a.class_name||'',faction:a.faction||'',status_key:a.status_key,status_text:a.status_text||'',created_at:a.created_at||'',updated_at:a.updated_at||''}))};}
export function applicationQuery(input:URLSearchParams){const out=new URLSearchParams({limit:'100'});for(const key of ['q','status','class','sort']) {const value=input.get(key)?.trim().slice(0,key==='q'?80:40);if(value) out.set(key,value);}return out;}
export function safeUrl(value:unknown,fallback='#'){try{const url=new URL(String(value));return url.protocol==='https:'?url.href:fallback;}catch{return fallback;}}
export {classes,validateApplication} from './applicationContract';
