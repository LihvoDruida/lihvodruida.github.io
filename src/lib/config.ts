/** Explicit server-side service configuration. Never exported to browser bundles. */
function origin(value:string, name:string, internal=false) {
 const url=new URL(value);
 const local=process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(url.hostname);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||
   (internal ? !(url.protocol==='http:'&&url.hostname==='dashboard'&&url.port==='3000')&&!local : url.protocol!=='https:'&&!local))throw new Error(`Invalid ${name}`);
 return url;
}
export const siteUrl=()=>origin(process.env.SITE_URL||'https://lihvodruida.pp.ua','SITE_URL');
export const dashboardUrl=()=>origin(process.env.DASHBOARD_URL||'https://guild.lihvodruida.pp.ua','DASHBOARD_URL');
export function dashboardTransport():{base:URL;headers:Record<string,string>}{
 const token=String(process.env.PUBLIC_SITE_BRIDGE_TOKEN||'').trim();
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw new Error('PUBLIC_SITE_BRIDGE_TOKEN is required (32–256 URL-safe characters)');
 const internal=String(process.env.DASHBOARD_INTERNAL_URL||'').trim();
 if(!internal)throw new Error('DASHBOARD_INTERNAL_URL is required');
 return {base:origin(internal,'DASHBOARD_INTERNAL_URL',true),headers:{Authorization:`Bearer ${token}`}};
}
