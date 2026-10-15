import {notFound} from 'next/navigation';
import {articles} from '@/lib/content';
import {ArticlePage} from '@/components/ArticlePage';
export function generateStaticParams(){return articles('guides').map(a=>({slug:a.slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const a=articles('guides').find(a=>a.slug===slug);return a?{title:a.title,description:a.description,alternates:{canonical:`/guides/${a.slug}`},openGraph:{type:'article',title:a.title,images:[a.image]}}:{};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const a=articles('guides').find(a=>a.slug===slug);if(!a)notFound();return <ArticlePage article={a}/>;}
