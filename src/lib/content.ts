import fs from 'node:fs';
import path from 'node:path';
import {cache} from 'react';
import {parse} from 'yaml';
import type {Guild,Season} from './contracts';
export const siteUrl=()=>new URL(process.env.SITE_URL||'https://lihvodruida.pp.ua');
export const dashboardUrl=()=>{const u=new URL(process.env.DASHBOARD_URL||'https://guild.lihvodruida.pp.ua');if(u.username||u.password||u.pathname!=='/'||(!['https:'].includes(u.protocol)&&!(process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(u.hostname)))) throw new Error('Invalid DASHBOARD_URL');return u;};
/** Used exclusively for server-side public READ requests (guild, CMS, applications).
 * Browser POST keeps the public HTTPS origin; private Docker requests authenticate
 * with a dedicated read-only token, not the internal admin/cron token.
 */
export function dashboardReadTransport(){
 const internal=String(process.env.DASHBOARD_INTERNAL_URL||'').trim();
 const token=String(process.env.PUBLIC_SITE_BRIDGE_TOKEN||'').trim();
 if(internal&&token.length>=32){
  const url=new URL(internal);
  if(url.protocol!=='http:'||url.hostname!=='dashboard'||url.port!=='3000'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('Invalid DASHBOARD_INTERNAL_URL');
  return {base:url,headers:{Authorization:`Bearer ${token}`}};
 }
 return {base:dashboardUrl(),headers:{}};
}
export const data=cache(<T,>(name:string):T=>parse(fs.readFileSync(path.join(process.cwd(),'_data',`${name}.yml`),'utf8')) as T);
export type Community={id:string;name:string;game:string;logo:string;description:string;page:string;discord:string;details:{label:string;value:string}[];links:{label:string;url:string}[]};
export type Mod={id:number;name:string;summary:string;downloads:number;updated_at:string;link:string;logo:string;categories:string[];game_versions:string[];version:string};
export type Character={name:string;class:string;realm:string;avatar:string;link:string;dps:{score:number};tank:{score:number};healer:{score:number}};
export type ProfessionData={characters:{name:string;realm:string;profile_url:string;professions:{primaries:{name:string;tiers:{name:string;learned_points:number;max_points:number}[]}[]}}[]};
export type Article={slug:string;kind:'guides'|'news';title:string;description:string;image:string;date:string;author:string;tags:string[];body:string};
// Articles are read ONLY from the dashboard CMS. Legacy _guides / _news are import inputs,
// not a second editable source of truth. React cache deduplicates render-time reads.
type ArticleEnvelope={schema:string;updated_at:string;items:Article[]};
let lastGood: {value:Article[];at:number}|null=null;
export const allArticles=cache(async ():Promise<Article[]>=>{
 try{
  const url=new URL('/api/site/content',dashboardReadTransport().base);
  const response=await fetch(url,{next:{revalidate:60},signal:AbortSignal.timeout(9000),redirect:'error',headers:{Accept:'application/json',...dashboardReadTransport().headers}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const size=Number(response.headers.get('content-length')||0);if(size>8*1024*1024)throw new Error('Content payload too large');
  const raw=await response.text();if(raw.length>8*1024*1024)throw new Error('Content payload too large');
  const result=JSON.parse(raw) as ArticleEnvelope;
  if(result.schema!=='mistblossom.public-content.v1'||!Array.isArray(result.items))throw new Error('Unsupported content schema');
  const items=result.items.filter((a):a is Article=>a&&(['news','guides'] as string[]).includes(a.kind)&&typeof a.slug==='string'&&/^[a-z0-9-]{1,90}$/.test(a.slug)&&typeof a.title==='string'&&typeof a.body==='string'&&a.body.length<=200000)
   .map(a=>({...a,description:String(a.description||''),author:String(a.author||''),image:typeof a.image==='string'&&(/^https:\/\/(guild|admin)\.lihvodruida\.pp\.ua\/api\/site\/media\/[a-f0-9]{64}$/.test(a.image)||a.image.startsWith('/assets/'))?a.image:'/assets/img/news-placeholder.webp',tags:Array.isArray(a.tags)?a.tags.map(String).slice(0,40):[]}));
  lastGood={value:items,at:Date.now()};return items;
 }catch(error){console.warn('[site-content] dashboard unavailable:',error instanceof Error?error.message:'unknown');
  if(lastGood&&Date.now()-lastGood.at<24*60*60*1000)return lastGood.value;
  return [];
 }
});
export const articles=async(kind:'guides'|'news'):Promise<Article[]>=> (await allArticles()).filter(a=>a.kind===kind).sort((a,b)=>b.date.localeCompare(a.date));
export const fallbackGuild=cache(():Guild=>{const g=data<Guild>('guild');const r=data<{current_season:string;seasons:Season[];catalog:Record<string,{name:string}>}>('raids');return {...g,raid_seasons:{current_season_id:r.current_season,seasons:r.seasons,catalog:r.catalog},scheduled_raids:[]};});
export function formatDate(date:string){const d=new Date(date);return Number.isNaN(d.getTime())?'Дата не вказана':new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Kyiv'}).format(d);}
