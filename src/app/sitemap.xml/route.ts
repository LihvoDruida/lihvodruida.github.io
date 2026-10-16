import {allArticles,siteUrl} from '@/lib/content';
export const dynamic='force-dynamic';
const escape=(s:string)=>s.replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]!));
export async function GET(){
 const articles=await allArticles(),base=siteUrl();
 const entries=[...['','/guides','/news','/mods','/guild','/guild/apply','/donate'].map(path=>({path,modified:''})),...articles.map(a=>({path:`/${a.kind}/${a.slug}`,modified:a.updatedAt||a.date}))];
 const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(item=>`<url><loc>${escape(new URL(item.path,base).href)}</loc>${Number.isFinite(Date.parse(item.modified))?`<lastmod>${new Date(item.modified).toISOString()}</lastmod>`:''}</url>`).join('')}</urlset>`;
 return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store'}});
}
