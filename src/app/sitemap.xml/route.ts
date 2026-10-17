import {allArticles} from '@/lib/content';
import {sitemapXml} from '@/lib/sitemap';
export const dynamic='force-dynamic';
export async function GET(){
 try{return new Response(sitemapXml(await allArticles()),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store'}});}
 catch{return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Retry-After':'60','Cache-Control':'no-store','CDN-Cache-Control':'no-store'}});}
}
