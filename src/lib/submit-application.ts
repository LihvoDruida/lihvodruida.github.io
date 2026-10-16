import {bridgeError,BridgeError} from './bridge-error';
import {invalidateApplications} from './bridge';
import {isIP} from 'node:net';
import {dashboardTransport,siteUrl} from './config';
import {boundedText} from './http';
import {validateApplication} from './contracts';
const headers={'Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Lihvo-Site-Api':'v1','X-Content-Type-Options':'nosniff'};
const json=(payload:unknown,status=200,extra:Record<string,string>={})=>Response.json(payload,{status,headers:{...headers,...extra}});
export async function submitApplication(request:Request){
 // Browser-facing endpoint accepts only the configured site's own origin.
 const origin=request.headers.get('origin');
 if(origin!==siteUrl().origin)return json({error:'Недозволене джерело заявки.'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Потрібен JSON.'},415);
 let body:Record<string,unknown>;
 try{const value:unknown=JSON.parse(await boundedText(request.body,16*1024));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid');body=value as Record<string,unknown>;}
 catch(error){return json({error:'Некоректне тіло заявки.'},error instanceof Error&&error.message==='body_limit'?413:400);}
 const error=validateApplication(body);
 if(error)return json({error},400);
 if(body.consent!==true&&body.consent!=='on')return json({error:'Підтверди згоду на обробку заявки.'},400);
 // Nginx overwrites X-Real-IP. Do not relay browser-supplied Authorization,
 // cookies, forwarding chains, or arbitrary headers to the dashboard.
 const ip=request.headers.get('x-real-ip')||'';
 if(process.env.NODE_ENV==='production'&&!isIP(ip))return json({error:'Не вдалося визначити адресу клієнта.'},503);
 try{
  const transport=dashboardTransport();
  const response=await fetch(new URL('/api/site/applications',transport.base),{
   method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),
   headers:{...transport.headers,'Content-Type':'application/json',Accept:'application/json',Origin:siteUrl().origin,'X-Site-Client-IP':isIP(ip)?ip:'127.0.0.1'},
   body:JSON.stringify({...body,region:'eu'}),
  });
  if([401,403,421].includes(response.status))throw new BridgeError(response.status===403?'bridge_origin_failed':'bridge_auth_failed');
  const result=JSON.parse(await boundedText(response.body,32*1024));
  if(!response.ok){const status=[400,403,413,415,429].includes(response.status)?response.status:503;return json({error:status===503?'Заявку не підтверджено. Спробуй повторити надсилання.':String(result.error||'Не вдалося надіслати заявку.')},status,response.status===429?{'Retry-After':response.headers.get('retry-after')||'60'}:{});}
  if(result.ok!==true||!Number.isSafeInteger(result.application_number)||result.application_number<=0||typeof result.tracking_number!=='string')throw new Error('invalid_receipt');
  // Receipts are private to this POST response and never enter the read cache.
  invalidateApplications();
  return json({ok:true,application_number:result.application_number,tracking_number:result.tracking_number,duplicate:result.duplicate===true,status_key:result.status_key,status_text:result.status_text},response.status===201?201:200);
 }catch(error){const failure=bridgeError(error);console.warn(JSON.stringify({event:'application.forward_failed',code:failure.code}));return json(failure,failure.status,{'Retry-After':'10'});}
}
