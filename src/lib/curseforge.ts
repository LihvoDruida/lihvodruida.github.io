import {data,type Mod} from './content';
export type ModSnapshot={mods:Mod[];source:'curseforge'|'archive';updatedAt:string|null;error?:string};
let lastGood: {value:ModSnapshot;at:number}|null=null;
const KEY=()=>process.env.CURSEFORGE_API_KEY||'';
function toMod(raw:any):Mod|null {
 const id=Number(raw?.id),name=String(raw?.name||'').trim();if(!Number.isInteger(id)||id<=0||!name)return null;
 const files=Array.isArray(raw.latestFiles)?raw.latestFiles:[];
 const newest=[...files].sort((a,b)=>String(b.fileDate||'').localeCompare(String(a.fileDate||'')))[0];
 const versions=Array.from(new Set(files.flatMap((f:any)=>Array.isArray(f.gameVersions)?f.gameVersions:[]).filter((v:unknown)=>typeof v==='string'&&/^\d+(\.\d+){0,3}$/.test(v)))) as string[];
 versions.sort((a,b)=>{const p=a.split('.').map(Number),q=b.split('.').map(Number);for(let i=0;i<Math.max(p.length,q.length);i++){if((p[i]||0)!==(q[i]||0))return (q[i]||0)-(p[i]||0);}return 0;});
 return {id,name,summary:String(raw.summary||'').slice(0,2000),downloads:Math.max(0,Math.floor(Number(raw.downloadCount)||0)),updated_at:String(raw.dateReleased||raw.dateModified||''),link:String(raw.links?.websiteUrl||`https://www.curseforge.com/wow/addons/${raw.slug||id}`),logo:String(raw.logo?.thumbnailUrl||''),categories:(Array.isArray(raw.categories)?raw.categories:[]).map((c:any)=>String(c.name||'')).filter(Boolean).slice(0,15),game_versions:versions.slice(0,20),version:String(newest?.displayName||newest?.fileName||'—').replace(/\.zip$/i,'').slice(0,120)};
}
export async function getMods():Promise<ModSnapshot>{
 const archive=()=>({mods:data<Mod[]>('my_mods'),source:'archive' as const,updatedAt:null,error:'Немає підтвердженого з’єднання з CurseForge'});
 if(!KEY())return archive();
 try {
  const mods:Mod[]=[];const authorId=process.env.CURSEFORGE_AUTHOR_ID||'104580421';
  if(!/^\d+$/.test(authorId))throw new Error('Invalid author ID');
  for(let index=0;index<5;index++){
   const url=new URL('https://api.curseforge.com/v1/mods/search');
   for(const [key,value] of Object.entries({gameId:'1',authorId,index:String(index*50),pageSize:'50',sortField:'2',sortOrder:'desc'}))url.searchParams.set(key,value);
   const response=await fetch(url,{headers:{'x-api-key':KEY(),Accept:'application/json'},next:{revalidate:1800},signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const payload=await response.json();const page=Array.isArray(payload?.data)?payload.data:[];
   for(const raw of page){const mod=toMod(raw);if(mod)mods.push(mod);}
   if(page.length<50)break;
  }
  if(!mods.length)throw new Error('CurseForge returned an empty list');
  const result:ModSnapshot={mods:Array.from(new Map(mods.map(m=>[m.id,m])).values()).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)),source:'curseforge',updatedAt:new Date().toISOString()};
  lastGood={value:result,at:Date.now()};return result;
 }catch(error){if(lastGood&&Date.now()-lastGood.at<24*3600000)return {...lastGood.value,error:'З’єднання з CurseForge тимчасово недоступне'};
 return {...archive(),error:`Помилка CurseForge: ${error instanceof Error?error.message:'невідома'}`};}
}
