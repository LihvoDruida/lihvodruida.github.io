export type SyncResource='content'|'guild'|'applications';
export type SiteSync={schema:'mistblossom.public-sync.v1';resources:Record<SyncResource,string>;checked_at:string};
export const SITE_SYNC_EVENT='lihvo:site-sync';
export function isSiteSync(value:unknown):value is SiteSync{
 if(!value||typeof value!=='object')return false;const x=value as SiteSync;
 return x.schema==='mistblossom.public-sync.v1'&&!!x.resources&&['content','guild','applications'].every(key=>typeof x.resources[key as SyncResource]==='string'&&/^[a-f0-9]{32}(?::\d{4}-\d{2}-\d{2})?$/.test(x.resources[key as SyncResource]))&&Number.isFinite(Date.parse(x.checked_at));
}
