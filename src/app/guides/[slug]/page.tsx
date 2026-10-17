import {articleMetadata} from '@/lib/seo';
import {notFound} from 'next/navigation';
import {articles} from '@/lib/content';
import {ArticlePage} from '@/components/ArticlePage';
export const dynamic='force-dynamic';

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const a=(await articles('guides')).find(a=>a.slug===slug);if(!a)notFound();return articleMetadata(a);}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const items=await articles('guides');const a=items.find(a=>a.slug===slug);if(!a)notFound();return <ArticlePage article={a} related={items.filter(item=>item.slug!==a.slug).slice(0,3)}/>;}
