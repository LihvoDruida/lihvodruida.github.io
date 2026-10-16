import {createHash} from 'node:crypto';
import {data,type Mod} from './content';
import {boundedText} from './http';
export type ModSnapshot={mods:Mod[];source:'curseforge'|'cache'|'catalog';updatedAt:string|null;stale:boolean;code?:string};
class CurseForgeError extends Error{constructor(readonly code:string){super(code);}}
const states=new Map<string,{value?:ModSnapshot;expires:number;lastSuccess:number;retryAt:number;error?:string;pending?:Promise<ModSnapshot>}>();
function settings(){
 const key=String(process.env.CURSEFORGE_API_KEY||'').trim().replace(/^(['"])(.*)\1$/,'$2');
 const authorId=String(process.env.CURSEFORGE_AUTHOR_ID||'104580421').trim();
 return {key,authorId,id:createHash('sha256').update(`${authorId}:${key}`).digest('hex')};
}
export function curseForgeConfiguration(){const {key,authorId}=settings();return {configured:!!key,authorValid:/^\d+$/.test(authorId),keyMalformed:!!key&&(/\s/.test(key)||/^(?:replace|your[_ -]|<)/i.test(key))};}
function toMod(raw:any):Mod|null {
 const id=Number(raw?.id),name=String(raw?.name||'').trim();if(!Number.isSafeInteger(id)||id<=0||!name)return null;
 const files=Array.isArray(raw.latestFiles)?raw.latestFiles:[];
 const newest=[...files].sort((a,b)=>String(b.fileDate||'').localeCompare(String(a.fileDate||'')))[0];
 const versions=Array.from(new Set(files.flatMap((f:any)=>Array.isArray(f.gameVersions)?f.gameVersions:[]).filter((v:unknown)=>typeof v==='string'&&/^\d+(\.\d+){0,3}$/.test(v)))) as string[];
 versions.sort((a,b)=>{const p=a.split('.').map(Number),q=b.split('.').map(Number);for(let i=0;i<Math.max(p.length,q.length);i++){if((p[i]||0)!==(q[i]||0))return (q[i]||0)-(p[i]||0);}return 0;});
 return {id,name,summary:String(raw.summary||'').slice(0,2000),downloads:Math.max(0,Math.floor(Number(raw.downloadCount)||0)),updated_at:String(raw.dateModified||raw.dateReleased||''),link:String(raw.links?.websiteUrl||`https://www.curseforge.com/wow/addons/${raw.slug||id}`),logo:String(raw.logo?.thumbnailUrl||''),categories:(Array.isArray(raw.categories)?raw.categories:[]).map((c:any)=>String(c.name||'')).filter(Boolean).slice(0,15),game_versions:versions.slice(0,20),version:String(newest?.displayName||newest?.fileName||'—').replace(/\.zip$/i,'').slice(0,120)};
}
export async function getMods():Promise<ModSnapshot>{
 const {key,authorId,id}=settings();const now=Date.now();
 const catalog=(code:string):ModSnapshot=>({mods:data<Mod[]>('my_mods'),source:'catalog',updatedAt:null,stale:true,code});
 const config=curseForgeConfiguration();
 if(!config.configured)return catalog('curseforge_key_missing');
 if(config.keyMalformed||!config.authorValid)return catalog('curseforge_configuration');
 let state=states.get(id);if(!state){if(states.size>=4)states.delete(states.keys().next().value!);state={expires:0,lastSuccess:0,retryAt:0};states.set(id,state);}
 if(state.value&&now<state.expires)return state.value;
 const fallback=(code:string):ModSnapshot=>state!.value&&Date.now()-state!.lastSuccess<24*3600000?{...state!.value,source:'cache',stale:true,code}:catalog(code);
 if(now<state.retryAt)return fallback(state.error||'curseforge_unavailable');
 if(!state.pending)state.pending=(async()=>{
  try{
   const mods:Mod[]=[];
   for(let page=0;page<5;page++){
    const url=new URL('https://api.curseforge.com/v1/mods/search');
    for(const [k,v] of Object.entries({gameId:'1',authorId,index:String(page*50),pageSize:'50',sortField:'2',sortOrder:'desc'}))url.searchParams.set(k,v);
    const response=await fetch(url,{headers:{'x-api-key':key,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.ok)throw new CurseForgeError(response.status===401||response.status===403?'curseforge_access_denied':response.status===429?'curseforge_rate_limited':'curseforge_unavailable');
    const payload=JSON.parse(await boundedText(response.body,4*1024*1024));
    if(!Array.isArray(payload?.data)||payload.data.length>50)throw new CurseForgeError('curseforge_schema');
    for(const raw of payload.data){if(Array.isArray(raw.authors)&&!raw.authors.some((a:any)=>String(a.id)===authorId))continue;const mod=toMod(raw);if(mod)mods.push(mod);}
    if(payload.data.length<50)break;
   }
   if(!mods.length)throw new CurseForgeError('curseforge_empty');
   const result:ModSnapshot={mods:Array.from(new Map(mods.map(m=>[m.id,m])).values()).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)),source:'curseforge',updatedAt:new Date().toISOString(),stale:false};
   state!.value=result;state!.lastSuccess=Date.now();state!.expires=Date.now()+300000;state!.retryAt=0;state!.error=undefined;return result;
  }catch(error){const code=error instanceof CurseForgeError?error.code:'curseforge_unavailable';state!.error=code;state!.retryAt=Date.now()+(code==='curseforge_access_denied'?300000:60000);console.warn(JSON.stringify({event:'curseforge.sync_failed',code,configured:true}));return fallback(code);}
  finally{state!.pending=undefined;}
 })();
 return state.pending;
}
