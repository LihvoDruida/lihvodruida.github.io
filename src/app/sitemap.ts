import type {MetadataRoute} from 'next';
import {articles,siteUrl} from '@/lib/content';
export default function sitemap():MetadataRoute.Sitemap{return ['','/guides','/news','/mods','/guild','/guild/apply','/donate',...[...articles('guides'),...articles('news')].map(a=>`/${a.kind}/${a.slug}`)].map(p=>({url:new URL(p,siteUrl()).href}));}
