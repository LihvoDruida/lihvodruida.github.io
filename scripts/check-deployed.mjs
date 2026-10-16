/** Read-only checks; does not create an application or send a Discord message. */
const urls=[new URL('/site-api/v1/sync',process.env.SITE_URL||'https://lihvodruida.pp.ua'),new URL('/site-api/v1/status',process.env.SITE_URL||'https://lihvodruida.pp.ua'),new URL('/site-api/v1/guild',process.env.SITE_URL||'https://lihvodruida.pp.ua'),new URL('/site-api/v1/applications',process.env.SITE_URL||'https://lihvodruida.pp.ua')];
if(process.argv.includes('--curseforge'))urls.push(new URL('/site-api/v1/mods',process.env.SITE_URL||'https://lihvodruida.pp.ua'));
for(const url of urls){
 const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'LihvoDruida-SyncCheck/4.3.1'}});
 if(response.headers.has('x-guild-worker-request-id'))throw Error('legacy_edge_route: public requests are still intercepted by the retired Worker');
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error(`public_edge_non_json: ${url.pathname} HTTP ${response.status}`);
 const data=await response.json();
 if(!response.ok)throw Error(`public_sync_failed: ${url.pathname} ${data.code||response.status}`);
 if(url.pathname.endsWith('/status')&&(data.service!=='lihvodruida-site'||data.api_base!=='/site-api/v1'||data.integration!=='ready'))throw Error('public_route_mismatch');
 if(url.pathname.endsWith('/sync')&&(data.data?.schema!=='mistblossom.public-sync.v1'||!['content','guild','applications'].every(key=>typeof data.data?.resources?.[key]==='string')))throw Error('public_sync_contract');
 if(url.pathname.endsWith('/guild')&&data.data?.schema!=='mistblossom.public-guild.v1')throw Error('public_guild_contract');
 if(url.pathname.endsWith('/applications')&&data.data?.schema!=='mistblossom.public-applications.v1')throw Error('public_applications_contract');
 if(url.pathname.endsWith('/mods')&&(data.data?.source!=='curseforge'||data.data?.stale))throw Error(`curseforge_not_live: ${data.data?.code||'unknown'}; inspect the server-side key and its permissions`);
 console.log(`PASS public ${url.pathname}`);
}
