import type {MetadataRoute} from 'next';
import {articles,siteUrl} from '@/lib/content';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{return ['','/guides','/news','/mods','/guild','/guild/apply','/donate',...[...await articles('guides'),...await articles('news')].map(a=>`/${a.kind}/${a.slug}`)].map(p=>({url:new URL(p,siteUrl()).href}));}
