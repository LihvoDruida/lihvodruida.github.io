export class ClientApiError extends Error {
 constructor(message:string,readonly code:string,readonly status:number){super(message);}
}
export async function apiJson<T>(response:Response):Promise<T>{
 if(response.headers.has('x-guild-worker-request-id')||response.headers.has('x-guild-worker-duration-ms'))throw new ClientApiError('Запит перехопив застарілий маршрут. Онови сторінку після оновлення сайту.','legacy_edge_route',response.status);
 const json=response.headers.get('content-type')?.toLowerCase().includes('application/json');
 if(!json){
  const challenge=response.headers.get('cf-mitigated')==='challenge'||response.status===403;
  throw new ClientApiError(challenge?'Cloudflare не пропустив запит. Онови сторінку та пройди перевірку.':`Сайт повернув неочікувану відповідь (HTTP ${response.status}).` ,challenge?'edge_challenge':'invalid_content_type',response.status);
 }
 let data:any;
 try{data=await response.json();}catch{throw new ClientApiError('Сайт повернув пошкоджену відповідь. Спробуй оновити дані.','invalid_json',response.status);}
 if(!response.ok)throw new ClientApiError(typeof data?.error==='string'?data.error.slice(0,240):`Не вдалося виконати запит (HTTP ${response.status}).`,typeof data?.code==='string'?data.code:'http_error',response.status);
 return data as T;
}
