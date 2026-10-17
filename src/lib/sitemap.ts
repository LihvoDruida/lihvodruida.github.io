import type {Article} from './content';
import {SEO_PAGES,absoluteUrl,articleDates} from './seo';
const escape=(s:string)=>s.replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]!));
export function sitemapXml(articles:Article[]){
 const entries:{path:string;modified?:string;image?:string}[]=Object.keys(SEO_PAGES).map(path=>({path}));
 // Static/list pages have no authoritative modification timestamp. Do not invent one.
 for(const article of articles)entries.push({path:`/${article.kind}/${article.slug}`,modified:articleDates(article).modified,image:article.image});
 return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.map(item=>`<url><loc>${escape(absoluteUrl(item.path))}</loc>${item.modified?`<lastmod>${item.modified}</lastmod>`:''}${item.image?`<image:image><image:loc>${escape(absoluteUrl(item.image))}</image:loc></image:image>`:''}</url>`).join('')}</urlset>`;
}
