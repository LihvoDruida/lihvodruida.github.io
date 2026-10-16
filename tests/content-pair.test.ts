import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {allArticles} from '../src/lib/content';
import {invalidateSyncProbe} from '../src/lib/site-sync';
import {GET as feed} from '../src/app/feed.xml/route';
import {GET as sitemap} from '../src/app/sitemap.xml/route';
import './fixtures';
const require=createRequire(import.meta.url),root=process.env.PAIRED_DASHBOARD_ROOT,engine=process.env.SITE_SYNC_PG_MODULE;
test('dashboard draft, publish, edit and unpublish propagate through SQL revisions to site, RSS and sitemap',{skip:!root||!engine},async()=>{
 const f=require(`${root}/scripts/check-site-integration.cjs`)(),load=require(`${root}/scripts/lib/load-server-ts.cjs`),{PGlite}=require(engine!);const db=new PGlite();
 await db.exec('CREATE TABLE documents(collection text NOT NULL,doc_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(collection,doc_id));');
 const producer=load('src/lib/siteSync.ts',{'@/lib/db/pgPool':{pgQuery:(sql:string,values:unknown[])=>db.query(sql,values)}}).exports;
 async function reflectStorage(){
  for(const [path,value] of f.rows){const slash=path.indexOf('/');await db.query('INSERT INTO documents(collection,doc_id,data) VALUES($1,$2,$3) ON CONFLICT(collection,doc_id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() WHERE documents.data IS DISTINCT FROM EXCLUDED.data',[path.slice(0,slash),path.slice(slash+1),JSON.stringify(value)]);}
  invalidateSyncProbe();
 }
 const fake=mock.method(globalThis,'fetch',async(input:string|URL|Request,init?:RequestInit)=>{
  assert.ok(new Headers(init?.headers).get('Authorization')?.startsWith('Bearer '));const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.pathname==='/api/site/sync')return Response.json(await producer.publicSiteSync());
  if(url.pathname==='/api/site/content')return Response.json(await f.content.publicSiteContent(Number(url.searchParams.get('page'))||1));
  throw Error('Unexpected upstream route');
 });
 const input={kind:'guides',slug:'paired-guide',status:'draft',title:'Paired guide',description:'',body:'',categories:'Guild',tags:'WoW',author:'Editor',user:{id:'pair-editor',name:'Editor'}};
 try{
  const draft=await f.content.createSiteContent(input);await reflectStorage();assert.equal((await allArticles()).length,0);assert.ok(!(await (await feed()).text()).includes('paired-guide'));
  const published=await f.content.updateSiteContent({...input,path:draft.path,expectedRevision:draft.revision,status:'published',description:'Original public description',body:'Original published article body.'});await reflectStorage();assert.equal((await allArticles())[0].slug,'paired-guide');
  const edited=await f.content.updateSiteContent({...input,path:draft.path,expectedRevision:published.revision,status:'published',description:'Updated public description',body:'Updated published article body.'});await reflectStorage();assert.equal((await allArticles())[0].body,'Updated published article body.');assert.ok((await (await feed()).text()).includes('Updated public description'));assert.ok((await (await sitemap()).text()).includes('paired-guide'));
  await f.content.updateSiteContent({...input,path:draft.path,expectedRevision:edited.revision,status:'draft'});await reflectStorage();assert.equal((await allArticles()).length,0);assert.ok(!(await (await feed()).text()).includes('paired-guide'));assert.ok(!(await (await sitemap()).text()).includes('paired-guide'));
 }finally{fake.mock.restore();invalidateSyncProbe();await db.close();}
});
