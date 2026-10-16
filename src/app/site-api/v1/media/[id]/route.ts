import {createHash} from 'node:crypto';
import {dashboardTransport} from '@/lib/config';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-f0-9]{64}$/.test(id))return new Response(null,{status:404});
 try{
  const transport=dashboardTransport();const response=await fetch(new URL(`/api/site/media/${id}`,transport.base),{headers:transport.headers,redirect:'error',signal:AbortSignal.timeout(9000),cache:'no-store'});
  if(!response.ok)return new Response(null,{status:response.status===404?404:503,headers:{'Cache-Control':'no-store'}});
  const mime=response.headers.get('content-type')?.split(';')[0]||'';
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(mime))throw new Error('invalid_media');
  const reader=response.body?.getReader();if(!reader)throw new Error('empty_media');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)throw new Error('large_media');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(chunks);if(createHash('sha256').update(bytes).digest('hex')!==id)throw new Error('media_hash');
  return new Response(bytes,{headers:{'Content-Type':mime,'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','ETag':`"${id}"`}});
 }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});}
}
