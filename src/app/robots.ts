import type {MetadataRoute} from 'next';
import {siteUrl} from '@/lib/content';
// Let crawlers read the applications page's noindex. Cover images stay crawlable.
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/site-api/v1/sync','/site-api/v1/status','/site-api/v1/applications','/site-api/v1/guild','/site-api/v1/mods']},sitemap:new URL('/sitemap.xml',siteUrl()).href};}
