export type Member = { rank:number; character:{name:string; region?:string; realm:{slug:string;name?:string}; playable_class?:{name:string}; playable_race?:{name:string}; active_spec?:{name:string;role:string}; avatar?:string; profile_url?:string; item_level_equipped?:number; mythic_plus_scores?:Record<string,{score:number;color?:string}>} };
export type Progress = {name?:string;summary?:string;total_bosses:number;normal_bosses_killed:number;heroic_bosses_killed:number;mythic_bosses_killed:number};
export type Season = {id:string;label:string;raids:string[];current?:boolean};
export type Guild = {schema?:string;metadata:{updated_at:string;source?:string};guild:{name:string;realm:{name:string;slug:string};faction?:{name?:string;type?:string};member_count:number;profile_url?:string;achievement_points?:number};members:Member[];raid_progression:Record<string,Progress>;raid_rankings?:Record<string,Record<string,{world:number;region:number;realm:number}>>;raid_seasons?:{current_season_id?:string;seasons:Season[];catalog?:Record<string,{name:string}>}|null;scheduled_raids?:{id:string;title:string;date:string;time:string;difficulty:string;going:number;capacity:number;raid_leader?:string}[]};
export type Application = {number:number;character_name:string;realm:string;class_name:string;faction:string;status_key:string;status_text:string;created_at:string;updated_at:string};
export type Applications = {schema:string;items:Application[];counts:{all:number;review:number;accepted:number;declined:number};updated_at:string};
export type Envelope<T> = {data:T;sync:{source:'dashboard'|'cache'|'archive';stale:boolean;checkedAt:string|null;updatedAt:string|null}};
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown)=>typeof x==='string';
const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function isGuild(x:unknown):x is Guild {
 if(!record(x)||x.schema!=='mistblossom.public-guild.v1'||!record(x.guild)||!record(x.guild.realm)||!record(x.metadata)||!text(x.guild.name)||!text(x.guild.realm.name)||!text(x.guild.realm.slug)||!number(x.guild.member_count)||!text(x.metadata.updated_at)||!Array.isArray(x.members)||!record(x.raid_progression)) return false;
 if(x.scheduled_raids!==undefined&&(!Array.isArray(x.scheduled_raids)||!x.scheduled_raids.every(r=>record(r)&&text(r.id)&&text(r.title)&&text(r.date)&&text(r.time)&&number(r.going)&&number(r.capacity))))return false;
 if(x.raid_seasons!==undefined&&x.raid_seasons!==null&&(!record(x.raid_seasons)||!Array.isArray(x.raid_seasons.seasons)||!x.raid_seasons.seasons.every(s=>record(s)&&text(s.id)&&text(s.label)&&Array.isArray(s.raids)&&s.raids.every(text))))return false;
 return x.members.length<=2000&&x.members.every(m=>record(m)&&number(m.rank)&&record(m.character)&&text(m.character.name)&&record(m.character.realm)&&text(m.character.realm.slug))&&Object.values(x.raid_progression).every(p=>record(p)&&['total_bosses','normal_bosses_killed','heroic_bosses_killed','mythic_bosses_killed'].every(k=>number(p[k])));
}
export function isApplications(x:unknown):x is Applications {
 return record(x)&&x.schema==='mistblossom.public-applications.v1'&&text(x.updated_at)&&record(x.counts)&&['all','review','accepted','declined'].every(k=>number((x.counts as Record<string,unknown>)[k]))&&Array.isArray(x.items)&&x.items.length<=100&&x.items.every(a=>record(a)&&number(a.number)&&text(a.character_name)&&text(a.status_key)&&text(a.realm));
}
// An explicit allowlist prevents an upstream contract change from exposing contact data.
export function publicApplications(x:Applications):Applications {return {schema:x.schema,counts:{all:x.counts.all,review:x.counts.review,accepted:x.counts.accepted,declined:x.counts.declined},updated_at:x.updated_at,items:x.items.map(a=>({number:a.number,character_name:a.character_name,realm:a.realm,class_name:a.class_name||'',faction:a.faction||'',status_key:a.status_key,status_text:a.status_text||'',created_at:a.created_at||'',updated_at:a.updated_at||''}))};}
export function applicationQuery(input:URLSearchParams){const out=new URLSearchParams({limit:'100'});for(const key of ['q','status','class','sort']) {const value=input.get(key)?.trim().slice(0,key==='q'?80:40);if(value) out.set(key,value);}return out;}
export function safeUrl(value:unknown,fallback='#'){try{const url=new URL(String(value));return url.protocol==='https:'?url.href:fallback;}catch{return fallback;}}
export const classes=['Warrior','Paladin','Hunter','Rogue','Priest','Death Knight','Shaman','Mage','Warlock','Monk','Druid','Demon Hunter','Evoker'];
export function validateApplication(x:Record<string,unknown>):string|null {
 const s=(k:string)=>String(x[k]||'').trim();
 if(s('website')) return 'Не вдалося надіслати заявку.';
 if(!/^\p{L}{2,12}$/u.test(s('characterName'))) return 'Ім’я персонажа: 2–12 літер.';
 if(!/^\p{Script=Latin}[\p{Script=Latin}\p{N} '’.()\-]{1,31}$/u.test(s('realm'))) return 'Перевір назву реалму.';
 if(!['Alliance','Horde'].includes(s('faction'))||!classes.includes(s('className'))) return 'Обери фракцію та клас.';
 if(!/^[a-z0-9._]{2,32}$/.test(s('discord'))) return 'Вкажи Discord username без @, малими літерами.';
 if((s('faction')==='Horde'||s('battleTag'))&&!/^\p{L}[\p{L}\p{N}]{2,11}#\d{4,6}$/u.test(s('battleTag'))) return 'Перевір BattleTag: Name#12345. Для Horde він обов’язковий.';
 if(s('availability').length<10||s('availability').length>1200) return 'Опиши час гри: від 10 до 1200 символів.';
 if(!s('sourceCreator')&&!s('sourceOther')&&!s('source')) return 'Вкажи, звідки дізнався про нас.';
 if(s('sourceCreator')==='Інше'&&!s('sourceOther')) return 'Уточни, звідки дізнався про нас.';
 return null;
}
