import type {MetadataRoute} from 'next';
import {siteUrl} from '@/lib/content';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/guild/applications']},sitemap:new URL('/sitemap.xml',siteUrl()).href};}
