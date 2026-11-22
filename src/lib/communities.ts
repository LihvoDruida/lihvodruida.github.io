import {SnapshotCache} from './bridge-cache';
import {dashboardTransport} from './config';
import {boundedText} from './http';
import {assertDashboardResponse,BridgeError} from './bridge-error';
import {registerSyncCache,syncedSnapshot} from './site-sync';
import {safeUrl} from './contracts';
import {data,type Community} from './content';

/** One card of the home page "Communities" block. */
export type CommunityCard={id:string;name:string;game:string;logo:string;description:string;page:string;pageLabel:string;details:string[];links:{label:string;url:string}[]};

// Content sync (siteCommunities rows) invalidates this cache as soon as the panel saves.
const cache=new SnapshotCache<CommunityCard[]>(60_000,7*24*60*60_000);
registerSyncCache('content',()=>cache.invalidate());

const text=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
/** Panel uploads are proxied by the site; site artwork is used as is. Anything else is dropped. */
export function communityLogoPath(value:unknown){
 const raw=text(value,300);
 const media=/^\/api\/site\/media\/([a-f0-9]{64})$/.exec(raw);
 if(media)return `/site-api/v1/media/${media[1]}`;
 return /^\/assets\/img\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|svg)$/.test(raw)&&!raw.includes('..')?raw:'/assets/img/guild-logo.webp';
}

/** Strict mapping of mistblossom.public-communities.v1. */
export function parseCommunities(value:unknown):CommunityCard[]{
 const payload=value as {schema?:unknown;items?:unknown};
 if(!payload||payload.schema!=='mistblossom.public-communities.v1'||!Array.isArray(payload.items))throw new BridgeError('invalid_schema');
 return payload.items.slice(0,6).flatMap((raw:unknown)=>{
  const c=raw as Record<string,unknown>;const name=text(c?.name,60);if(!name)return [];
  const page=text(c.page,82);const internalPage=/^\/[a-z0-9/-]{0,80}$/.test(page)&&!page.includes('//')?page:'';
  const details=(Array.isArray(c.details)?c.details:[]).slice(0,6).map(d=>text((d as {value?:unknown})?.value,60)).filter(Boolean);
  const links=(Array.isArray(c.links)?c.links:[]).slice(0,6).flatMap(l=>{const label=text((l as {label?:unknown})?.label,40),url=safeUrl((l as {url?:unknown})?.url,'');return label&&url?[{label,url}]:[];});
  return [{id:text(c.id,40)||name,name,game:text(c.game,40),logo:communityLogoPath(c.logo),description:text(c.description,300),page:internalPage,pageLabel:internalPage?text(c.pageLabel,40)||'Детальніше':'',details,links}];
 });
}

async function loadCommunities():Promise<CommunityCard[]>{
 const transport=dashboardTransport();
 const response=await fetch(new URL('/api/site/communities',transport.base),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000),headers:{Accept:'application/json',...transport.headers}});
 assertDashboardResponse(response);
 return parseCommunities(JSON.parse(await boundedText(response.body,256*1024)));
}

/** The previous static source (_data/guilds.yml), in the same card shape. */
export function staticCommunities():CommunityCard[]{
 return data<Community[]>('guilds').map(g=>({id:g.id,name:g.name,game:g.game,logo:g.logo,description:g.description,page:g.page,pageLabel:g.page?'Про гільдію':'',
  details:g.details.filter(d=>!(g.id==='mistblossom'&&d.label==='Фракція')).map(d=>d.value),links:g.links.map(l=>({label:l.label,url:l.url}))}));
}

/** Communities from the panel; the static catalog while the panel is unreachable or not yet updated. */
export async function communityCards():Promise<{items:CommunityCard[];source:'dashboard'|'catalog'}>{
 try{const result=await syncedSnapshot(cache,loadCommunities);return {items:result.data,source:'dashboard'};}
 catch{return {items:staticCommunities(),source:'catalog'};}
}
