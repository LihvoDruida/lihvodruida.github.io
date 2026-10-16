import fs from 'node:fs';
import path from 'node:path';
import {cache} from 'react';
import {parse} from 'yaml';
import {dashboardTransport} from './config';
import {boundedText} from './http';
import {SnapshotCache} from './bridge-cache';
import {syncedSnapshot,registerSyncCache} from './site-sync';
export {siteUrl,dashboardUrl,dashboardTransport} from './config';
export const data=cache(<T,>(name:string):T=>parse(fs.readFileSync(path.join(process.cwd(),'_data',`${name}.yml`),'utf8')) as T);
export type Community={id:string;name:string;game:string;logo:string;description:string;page:string;discord:string;details:{label:string;value:string}[];links:{label:string;url:string}[]};
export type Mod={id:number;name:string;summary:string;downloads:number;updated_at:string;link:string;logo:string;categories:string[];game_versions:string[];version:string};
export type Character={name:string;class:string;realm:string;avatar:string;link:string;dps:{score:number};tank:{score:number};healer:{score:number}};
export type ProfessionData={characters:{name:string;realm:string;profile_url:string;professions:{primaries:{name:string;tiers:{name:string;learned_points:number;max_points:number}[]}[]}}[]};
export type Article={slug:string;kind:'guides'|'news';title:string;description:string;image:string;date:string;updatedAt?:string;author:string;tags:string[];body:string};
// Articles have one source of truth: the dashboard CMS.
const contentCache=new SnapshotCache<Article[]>(60_000,300_000);
registerSyncCache('content',()=>contentCache.invalidate());
function contentImage(value:unknown){
 const raw=typeof value==='string'?value:'';
 const media=/^(?:https:\/\/(?:guild|admin)\.lihvodruida\.pp\.ua)?\/api\/site\/media\/([a-f0-9]{64})$/.exec(raw);
 if(media)return `/site-api/v1/media/${media[1]}`;
 return /^\/assets\/[A-Za-z0-9_./-]+$/.test(raw)&&!raw.includes('..')?raw:'/assets/img/news-placeholder.webp';
}
async function loadContentPages():Promise<Article[]>{
  const transport=dashboardTransport();let page:number|null=1,revision='';const items:Article[]=[];const seen=new Set<string>();
  // One bounded paginated snapshot. Mixed revisions are rejected and retried later.
  while(page!==null){
   if(page>25)throw new Error('content_page_limit');
   const response=await fetch(new URL(`/api/site/content?page=${page}`,transport.base),{cache:'no-store',signal:AbortSignal.timeout(9000),redirect:'error',headers:{Accept:'application/json',...transport.headers}});
   if(!response.ok)throw new Error('content_upstream_unavailable');
   const result=JSON.parse(await boundedText(response.body,20*1024*1024));
   if(result.schema!=='mistblossom.public-content.v2'||typeof result.revision!=='string'||!Number.isSafeInteger(result.total)||result.total<0||result.total>500||!Array.isArray(result.items)||result.items.length>20||(result.next_page!==null&&result.next_page!==page+1))throw new Error('content_contract');
   if(page>1&&revision!==result.revision)throw new Error('content_revision_changed');
   revision=result.revision;
   for(const a of result.items){
    if(!a||!['news','guides'].includes(a.kind)||typeof a.slug!=='string'||!/^[a-z0-9-]{1,90}$/.test(a.slug)||typeof a.title!=='string'||typeof a.body!=='string'||a.body.length>200000||typeof a.date!=='string'||!Number.isFinite(Date.parse(a.date)))throw new Error('content_article_contract');
    const key=`${a.kind}/${a.slug}`;if(seen.has(key))throw new Error('duplicate_article');seen.add(key);
    items.push({kind:a.kind,slug:a.slug,title:a.title,body:a.body,date:a.date,updatedAt:String(a.updated_at||a.last_modified_at||a.date),description:String(a.description||''),author:String(a.author||''),image:contentImage(a.image),tags:Array.isArray(a.tags)?a.tags.map(String).slice(0,40):[]});
   }
   page=result.next_page;
   if(page===null&&items.length!==result.total)throw new Error('content_incomplete');
  }
  return items;
}
async function loadCoherentContent(){try{return await loadContentPages();}catch(error){if(error instanceof Error&&error.message==='content_revision_changed')return loadContentPages();throw error;}}
export const allArticles=cache(async():Promise<Article[]>=>{
 try{return (await syncedSnapshot(contentCache,loadCoherentContent)).data;}
 catch{console.warn('[site-content] CMS unavailable or invalid');throw new Error('Матеріали тимчасово недоступні. Спробуйте пізніше.');}
});
export const articles=async(kind:'guides'|'news'):Promise<Article[]>=> (await allArticles()).filter(a=>a.kind===kind).sort((a,b)=>b.date.localeCompare(a.date));
export {formatDate} from './format-date';
