/** Read-only deployment diagnostics. Never logs response bodies or credentials. */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const required=['sync:revisions:v1','guild:raid-history:v2','streamers:read:v1'];
export class IntegrationFailure extends Error {
 constructor(code,message){super(message);this.code=code;}
}
const failure=(code,message)=>new IntegrationFailure(code,message);
async function jsonResponse(response,limit=8192){
 if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw failure('integration_non_json','Сервіс повернув HTML або інший формат замість JSON.');
 if(!response.body)throw failure('integration_empty','Сервіс повернув порожню відповідь.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw failure('integration_body_limit','Відповідь перевірки перевищує дозволений розмір.');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure('integration_invalid_json','Сервіс повернув пошкоджений JSON.');}
}
async function request(fetcher,url,headers){
 try{return await fetcher(url,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});}
 catch(error){
  const code=error?.cause?.code;
  if(code==='ENOTFOUND'||code==='EAI_AGAIN')throw failure('dashboard_dns','Ім’я dashboard не визначається. Перевірте спільну Docker-мережу mistblossom_edge.');
  if(code==='ECONNREFUSED')throw failure('dashboard_connection_refused','Дашборд не приймає з’єднання. Перевірте стан контейнера dashboard.');
  if(['TimeoutError','AbortError'].includes(error?.name))throw failure('integration_timeout','Сервіс не відповів за 8 секунд.');
  throw failure('integration_network','Не вдалося зв’язатися із сервісом. Перевірте стан контейнерів і Docker-мережу.');
 }
}
async function checkStreamerEndpoint(fetcher,url,headers={},envelope=false){
 let response;
 try{response=await request(fetcher,url,headers);}catch(error){
  if(error instanceof IntegrationFailure&&error.code==='integration_network')throw failure('dashboard_streamers_unavailable','Маршрут стрімерів недоступний або перенаправляє запит. Оновіть і перезберіть Dashboard 3.14.1 або новіший: /api/site/streamers має проходити внутрішній proxy з токеном сайту.');
  throw error;
 }
 if(!response.ok)throw failure('dashboard_streamers_http',`Маршрут стрімерів повернув HTTP ${response.status}. Перевірте Dashboard 3.14.1 або новіший, його proxy, PostgreSQL і PUBLIC_SITE_BRIDGE_TOKEN.`);
 const body=await jsonResponse(response,131072),data=envelope?body?.data:body;
 if(data?.schema!=='mistblossom.public-streamers.v1'||!Number.isFinite(Date.parse(data.checked_at))||!Array.isArray(data.items)||data.items.length>30)throw failure('dashboard_streamers_schema','Маршрут стрімерів повернув несумісні дані. Перевірте парне оновлення Dashboard і Site.');
}
export async function checkDashboard(env=process.env,fetcher=fetch){
 const token=String(env.PUBLIC_SITE_BRIDGE_TOKEN||'').trim();
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw failure('bridge_token_configuration','PUBLIC_SITE_BRIDGE_TOKEN відсутній або має неправильний формат.');
 if(String(env.DASHBOARD_INTERNAL_URL||'').trim()!=='http://dashboard:3000')throw failure('dashboard_url_configuration','DASHBOARD_INTERNAL_URL має дорівнювати http://dashboard:3000.');
 const response=await request(fetcher,'http://dashboard:3000/api/site/status',{Accept:'application/json',Authorization:`Bearer ${token}`});
 if(response.headers.has('x-guild-worker-request-id'))throw failure('legacy_dashboard_route','Запит потрапив у старий маршрут. Перевірте DASHBOARD_INTERNAL_URL і мережу.');
 if([401,403,421].includes(response.status))throw failure('bridge_access_rejected',`Дашборд відхилив внутрішній запит (HTTP ${response.status}). Перевірте однаковий PUBLIC_SITE_BRIDGE_TOKEN в обох контейнерах і дозволений внутрішній маршрут.`);
 if(!response.ok)throw failure('dashboard_http',`Перевірка дашборда повернула HTTP ${response.status}. Перевірте його стан і доступність PostgreSQL.`);
 const data=await jsonResponse(response);
 if(data?.ok!==true||data.protocol!=='mistblossom.site-bridge.v2'||data.store!=='postgres'||data.schemas?.content!=='mistblossom.public-content.v2')throw failure('dashboard_protocol_incompatible','Дашборд повернув несумісний протокол або сховище. Спочатку встановіть і перезберіть Dashboard 3.14.1 або новіший.');
 const missing=required.filter(item=>!Array.isArray(data.capabilities)||!data.capabilities.includes(item));
 if(missing.length)throw failure('dashboard_capabilities_missing',`Запущений дашборд не підтримує: ${missing.join(', ')}. Спочатку встановіть і перезберіть Dashboard 3.14.1 або новіший; розпакування файлів без перезапуску контейнера недостатньо.`);
 await checkStreamerEndpoint(fetcher,'http://dashboard:3000/api/site/streamers',{Accept:'application/json',Authorization:`Bearer ${token}`});
 return {ok:true};
}
export async function checkLocal(fetcher=fetch){
 const response=await request(fetcher,'http://127.0.0.1:3000/site-api/v1/status',{Accept:'application/json'}),data=await jsonResponse(response);
 if(!response.ok||data?.ok!==true||data.integration!=='ready'||data.service!=='lihvodruida-site'||data.api_base!=='/site-api/v1'){
  const safeCodes=new Set(['bridge_configuration','bridge_auth_failed','bridge_origin_failed','dashboard_timeout','dashboard_dns','invalid_schema','dashboard_unavailable','legacy_edge_route','invalid_content_type']);
  const code=safeCodes.has(data?.code)?data.code:'site_integration_unavailable';
  throw failure(code,`Сайт запущено, але його інтеграція не готова (HTTP ${response.status}). Перевірте зв’язок із дашбордом.`);
 }
 await checkStreamerEndpoint(fetcher,'http://127.0.0.1:3000/site-api/v1/streamers',{Accept:'application/json'},true);
 return {ok:true};
}
export async function runIntegration(args=[],env=process.env,fetcher=fetch,log=console){
 const local=args.length===1&&args[0]==='--local';
 if(args.length>1||args.length===1&&!['--local','--upstream'].includes(args[0])){log.error('Використання: node check-integration.mjs [--upstream|--local]');return 2;}
 try{
  if(local)await checkLocal(fetcher);else await checkDashboard(env,fetcher);
  log.log(local?'PASS local site integration readiness':'PASS dashboard protocol, PostgreSQL and required capabilities');return 0;
 }catch(error){
  log.error(`${error instanceof IntegrationFailure?error.code:'integration_check_failed'}: ${error instanceof IntegrationFailure?error.message:'Не вдалося завершити перевірку інтеграції.'}`);
  if(local){try{await checkDashboard(env,fetcher);log.error('Дашборд сумісний; перевірте відповідь локального readiness сайту.');}catch(upstream){log.error(`${upstream instanceof IntegrationFailure?upstream.code:'dashboard_check_failed'}: ${upstream instanceof IntegrationFailure?upstream.message:'Не вдалося перевірити дашборд.'}`);}}
  return 1;
 }
}
if(process.argv[1]==='-'||process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void runIntegration(process.argv.slice(2)).then(code=>{process.exitCode=code;});
