import fs from 'node:fs';
import path from 'node:path';
import {cache} from 'react';
import {parse} from 'yaml';
import type {Guild,Season} from './contracts';
export const siteUrl=()=>new URL(process.env.SITE_URL||'https://lihvodruida.pp.ua');
export const dashboardUrl=()=>{const u=new URL(process.env.DASHBOARD_URL||'https://guild.lihvodruida.pp.ua');if(u.username||u.password||u.pathname!=='/'||(!['https:'].includes(u.protocol)&&!(process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(u.hostname)))) throw new Error('Invalid DASHBOARD_URL');return u;};
export const data=cache(<T,>(name:string):T=>parse(fs.readFileSync(path.join(process.cwd(),'_data',`${name}.yml`),'utf8')) as T);
export type Community={id:string;name:string;game:string;logo:string;description:string;page:string;discord:string;details:{label:string;value:string}[];links:{label:string;url:string}[]};
export type Mod={id:number;name:string;summary:string;downloads:number;updated_at:string;link:string;logo:string;categories:string[];game_versions:string[];version:string};
export type Character={name:string;class:string;realm:string;avatar:string;link:string;dps:{score:number};tank:{score:number};healer:{score:number}};
export type ProfessionData={characters:{name:string;realm:string;profile_url:string;professions:{primaries:{name:string;tiers:{name:string;learned_points:number;max_points:number}[]}[]}}[]};
export type Article={slug:string;kind:'guides'|'news';title:string;description:string;image:string;date:string;author:string;tags:string[];body:string};
export const articles=cache((kind:'guides'|'news'):Article[]=>{
 const dir=path.join(process.cwd(),`_${kind}`);if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir).filter(f=>/\.md$/.test(f)).map(file=>{
  const raw=fs.readFileSync(path.join(dir,file),'utf8').replace(/\r\n/g,'\n');
  const match=raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);if(!match)throw new Error(`Invalid frontmatter: ${file}`);
  const meta=parse(match[1]); const slug=meta.slug||file.replace(/^\d{4}-\d{2}-\d{2}-/,'').replace(/\.md$/,'');
  if(!/^[\p{L}\p{N}_-]+$/u.test(slug))throw new Error(`Invalid slug: ${file}`);
  return {slug,kind,title:String(meta.title||slug),description:String(meta.description||''),image:String(meta.image||'/assets/img/news-placeholder.webp'),date:String(meta.date||file.slice(0,10)),author:String(meta.author||'Sebas'),tags:Array.isArray(meta.tags)?meta.tags.map(String):[],body:match[2]};
 }).sort((a,b)=>b.date.localeCompare(a.date));
});
export const fallbackGuild=cache(():Guild=>{const g=data<Guild>('guild');const r=data<{current_season:string;seasons:Season[];catalog:Record<string,{name:string}>}>('raids');return {...g,raid_seasons:{current_season_id:r.current_season,seasons:r.seasons,catalog:r.catalog},scheduled_raids:[]};});
export function formatDate(date:string){const d=new Date(date);return Number.isNaN(d.getTime())?'Дата не вказана':new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Kyiv'}).format(d);}
