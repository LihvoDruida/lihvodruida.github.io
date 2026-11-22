import {SnapshotCache} from './bridge-cache';
import {dashboardTransport} from './config';
import {boundedText} from './http';
import {assertDashboardResponse,BridgeError} from './bridge-error';
import {safeUrl} from './contracts';
import {data,type Character} from './content';

/** One card in the "behind the scenes" block: the server owner's character. */
export type OwnerCharacter={name:string;isMain:boolean;edition:'retail'|'forever';className:string|null;specName:string|null;realm:string;itemLevel:number|null;rio:number|null;avatarUrl:string|null;link:string|null};

const MAX_CHARACTERS=12;
// Fresh for a minute, the last good list stays usable for a day when the panel is down.
const cache=new SnapshotCache<OwnerCharacter[]>(60_000,24*60*60_000);

const text=(value:unknown,max:number)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):null;
const count=(value:unknown,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=max?Math.round(value):null;
const https=(value:unknown)=>{const url=safeUrl(value,'');return url||null;};

/** Strict mapping of the panel's mistblossom.public-owner.v1 payload. Raider.IO stays Retail-only. */
export function parseOwnerSnapshot(value:unknown):OwnerCharacter[]{
 const payload=value as {schema?:unknown;characters?:unknown};
 if(!payload||payload.schema!=='mistblossom.public-owner.v1'||!Array.isArray(payload.characters))throw new BridgeError('invalid_schema');
 return payload.characters.slice(0,MAX_CHARACTERS).flatMap((raw:unknown)=>{
  const c=raw as Record<string,unknown>;const name=text(c?.name,24);if(!name)return [];
  const edition=c.edition==='forever'?'forever':'retail';
  return [{name,isMain:c.isMain===true,edition,className:text(c.className,32),specName:text(c.specName,32),realm:text(c.realm,40)||'',itemLevel:count(c.itemLevel,2000),rio:edition==='retail'?count(c.rio,10000):null,avatarUrl:https(c.avatarUrl),link:https(c.link)}];
 });
}

async function loadOwner():Promise<OwnerCharacter[]>{
 const transport=dashboardTransport();
 const response=await fetch(new URL('/api/site/owner',transport.base),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000),headers:{Accept:'application/json',...transport.headers}});
 assertDashboardResponse(response);
 return parseOwnerSnapshot(JSON.parse(await boundedText(response.body,256*1024)));
}

/** Static catalog entry from _data/characters.yml in the same shape (no item level / RIO). */
export function staticOwnerCharacters():OwnerCharacter[]{
 return data<Character[]>('characters').map((c,index)=>({name:c.name,isMain:index===0,edition:'retail',className:c.class||null,specName:null,realm:c.realm,itemLevel:null,rio:null,avatarUrl:https(c.avatar),link:https(c.link)}));
}

/** Owner's characters from the panel (their saved order, main first); falls back to the static catalog. */
export async function ownerCharacters():Promise<{items:OwnerCharacter[];source:'dashboard'|'catalog'}>{
 try{const result=await cache.get(loadOwner);if(result.data.length)return {items:result.data,source:'dashboard'};}catch{/* panel unavailable: static catalog below */}
 return {items:staticOwnerCharacters(),source:'catalog'};
}
