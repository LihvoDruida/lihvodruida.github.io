import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
// Last successful snapshot survives restarts (checklist C34) when SITE_STATE_DIR points at
// a writable volume. The file holds public addon data only, keyed by author, never the key.
const SNAPSHOT_MAX_AGE=30*24*3600000;
function snapshotFile(authorId:string){const dir=String(process.env.SITE_STATE_DIR||'').trim();return dir&&path.isAbsolute(dir)?path.join(dir,`curseforge-${authorId}.json`):null;}
function isMod(m:any):m is Mod{return !!m&&Number.isSafeInteger(m.id)&&typeof m.name==='string'&&typeof m.link==='string'&&Array.isArray(m.game_versions)&&Array.isArray(m.categories)&&Number.isFinite(m.downloads);}
export function readPersistedSnapshot(authorId:string):{mods:Mod[];updatedAt:string}|null{
 const file=snapshotFile(authorId);if(!file)return null;
 try{
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));const at=Date.parse(raw?.updatedAt);
  if(raw?.authorId!==authorId||!Number.isFinite(at)||Date.now()-at>SNAPSHOT_MAX_AGE||!Array.isArray(raw.mods)||!raw.mods.length||raw.mods.length>250||!raw.mods.every(isMod))return null;
  return {mods:raw.mods,updatedAt:new Date(at).toISOString()};
 }catch{return null;}
}
function persistSnapshot(authorId:string,snapshot:ModSnapshot){
 const file=snapshotFile(authorId);if(!file)return;
 const body=JSON.stringify({authorId,updatedAt:snapshot.updatedAt,mods:snapshot.mods});
 try{
  // Skip identical rewrites; write-then-rename so a crash never leaves half a file.
  try{const old=JSON.parse(fs.readFileSync(file,'utf8'));if(JSON.stringify(old.mods)===JSON.stringify(snapshot.mods)&&Date.now()-Date.parse(old.updatedAt)<3600000)return;}catch{}
  const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,body,{mode:0o600});fs.renameSync(temp,file);
 }catch(error){console.warn(JSON.stringify({event:'curseforge.snapshot_write_failed',code:(error as NodeJS.ErrnoException)?.code||'unknown'}));}
}
function toMod(raw:any):Mod|null {
 const id=Number(raw?.id),name=String(raw?.name||'').trim();if(!Number.isSafeInteger(id)||id<=0||!name)return null;
 if(raw.isAvailable===false)return null;
 const files=Array.isArray(raw.latestFiles)?raw.latestFiles:[],indexes=Array.isArray(raw.latestFilesIndexes)?raw.latestFilesIndexes:[];
 // Prefer the newest stable release (releaseType 1); betas/alphas only when nothing stable exists.
 const byDate=[...files].sort((a,b)=>String(b.fileDate||'').localeCompare(String(a.fileDate||'')));
 const newest=byDate.find(f=>Number(f.releaseType)===1)||byDate[0];
 // latestFiles holds a few recent files; latestFilesIndexes lists every supported flavour
 // (Retail, Classic, Anniversary…), so both are needed for the full version list.
 const versions=Array.from(new Set([...files.flatMap((f:any)=>Array.isArray(f.gameVersions)?f.gameVersions:[]),...indexes.map((i:any)=>i?.gameVersion)].filter((v:unknown)=>typeof v==='string'&&/^\d+(\.\d+){0,3}$/.test(v)))) as string[];
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
 const fallback=(code:string):ModSnapshot=>{
  if(state!.value&&Date.now()-state!.lastSuccess<24*3600000)return {...state!.value,source:'cache',stale:true,code};
  // After a restart the in-memory value is gone: use the persisted snapshot with its real date.
  const saved=readPersistedSnapshot(authorId);
  return saved?{mods:saved.mods,source:'cache',updatedAt:saved.updatedAt,stale:true,code}:catalog(code);
 };
 if(now<state.retryAt)return fallback(state.error||'curseforge_unavailable');
 if(!state.pending)state.pending=(async()=>{
  try{
   const mods:Mod[]=[];
   for(let page=0;page<5;page++){
    const url=new URL('https://api.curseforge.com/v1/mods/search');
    for(const [k,v] of Object.entries({gameId:'1',authorId,index:String(page*50),pageSize:'50',sortField:'2',sortOrder:'desc'}))url.searchParams.set(k,v);
    const response=await fetch(url,{headers:{'x-api-key':key,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.ok)throw new CurseForgeError(response.status===401||response.status===403?'curseforge_access_denied':response.status===429?'curseforge_rate_limited':'curseforge_unavailable');
    let payload:any;try{payload=JSON.parse(await boundedText(response.body,4*1024*1024));}catch{throw new CurseForgeError('curseforge_schema');}
    if(!Array.isArray(payload?.data)||payload.data.length>50)throw new CurseForgeError('curseforge_schema');
    for(const raw of payload.data){if(Array.isArray(raw.authors)&&!raw.authors.some((a:any)=>String(a.id)===authorId))continue;const mod=toMod(raw);if(mod)mods.push(mod);}
    if(payload.data.length<50)break;
   }
   if(!mods.length)throw new CurseForgeError('curseforge_empty');
   const result:ModSnapshot={mods:Array.from(new Map(mods.map(m=>[m.id,m])).values()).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)),source:'curseforge',updatedAt:new Date().toISOString(),stale:false};
   persistSnapshot(authorId,result);
   state!.value=result;state!.lastSuccess=Date.now();state!.expires=Date.now()+300000;state!.retryAt=0;state!.error=undefined;return result;
  }catch(error){const code=error instanceof CurseForgeError?error.code:'curseforge_unavailable';state!.error=code;state!.retryAt=Date.now()+(code==='curseforge_access_denied'?300000:60000);console.warn(JSON.stringify({event:'curseforge.sync_failed',code,configured:true}));return fallback(code);}
  finally{state!.pending=undefined;}
 })();
 return state.pending;
}
