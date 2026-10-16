export class BridgeError extends Error {
 constructor(readonly code:string,readonly status=503){super(code);}
}
export function bridgeError(error:unknown):{code:string;error:string;status:number}{
 const code=error instanceof BridgeError?error.code:error instanceof Error&&/PUBLIC_SITE_BRIDGE_TOKEN|DASHBOARD_INTERNAL_URL|DASHBOARD_URL/.test(error.message)?'bridge_configuration':error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'dashboard_timeout':(error as {cause?:{code?:string}})?.cause?.code==='ENOTFOUND'?'dashboard_dns':'dashboard_unavailable';
 const messages:Record<string,string>={bridge_configuration:'Синхронізацію сайту ще не налаштовано.',bridge_auth_failed:'Сайт і дашборд мають різні налаштування доступу.',bridge_origin_failed:'Дашборд відхилив домен сайту.',dashboard_timeout:'Дашборд не встиг відповісти. Повторимо запит.',dashboard_dns:'Сервіси сайту не бачать один одного в мережі.',invalid_schema:'Сайт і дашборд повернули несумісні дані.',dashboard_unavailable:'Дані тимчасово недоступні. Повторимо запит.',legacy_edge_route:'Запит перехопив застарілий маршрут.',invalid_content_type:'Сервіс повернув неочікуваний формат відповіді.'};
 return {code,error:messages[code]||messages.dashboard_unavailable,status:error instanceof BridgeError?error.status:503};
}
export function assertDashboardResponse(response:Response){
 if(response.headers.has('x-guild-worker-request-id'))throw new BridgeError('legacy_edge_route');
 if(!response.ok)throw new BridgeError(response.status===401||response.status===421?'bridge_auth_failed':response.status===403?'bridge_origin_failed':'dashboard_unavailable');
 if(!response.headers.get('content-type')?.includes('application/json'))throw new BridgeError('invalid_content_type');
}
