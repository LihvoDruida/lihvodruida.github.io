import type {Metadata} from 'next';
import type {Article} from './content';
import {siteUrl} from './config';

export const SITE_NAME='Лігво Друїда';
export const DEFAULT_IMAGE='/assets/img/og-image-default.webp';
export const SEO_PAGES={
 '/':{title:'Лігво Друїда — WoW українською, гайди та гільдія',description:'Українська спільнота World of Warcraft: гайди, авторські адони Sebas, новини та гільдія Mistblossom Vanguard. Знаходь друзів для рейдів і Mythic+.',label:'Головна'},
 '/guides':{title:'Гайди World of Warcraft українською',description:'Україномовні гайди WoW від Лігва Друїда: рейди, Mythic+, професії та поради для гри. Знаходь потрібну тему й читай матеріали українською.',label:'Гайди WoW'},
 '/news':{title:'Новини WoW та української спільноти',description:'Новини Лігва Друїда: події української WoW-спільноти, оновлення проєктів, нові матеріали та історії спільної гри у World of Warcraft.',label:'Новини'},
 '/mods':{title:'Авторські адони WoW від Sebas',description:'Адони для World of Warcraft від Sebas / Лігва Друїда: опис проєктів, підтримувані версії та прямі посилання на завантаження з CurseForge.',label:'Адони WoW'},
 '/guild':{title:'Mistblossom Vanguard — українська гільдія WoW',description:'Шукаєш українську гільдію World of Warcraft? Mistblossom Vanguard на EU · Terokkar: рейди, Mythic+, склад, прогрес і заявка на вступ.',label:'Гільдія Mistblossom Vanguard'},
 '/guild/apply':{title:'Вступ до WoW-гільдії Mistblossom Vanguard',description:'Подай заявку до української гільдії Mistblossom Vanguard у World of Warcraft. Розкажи про персонажа, час гри та познайомся зі спільнотою в Discord.',label:'Вступ до гільдії'},
 '/donate':{title:'Підтримати Лігво Друїда',description:'Добровільна підтримка українського проєкту Лігво Друїда: допоможи розвивати гайди WoW, авторські адони й трансляції. Способи та прозорі умови підтримки.',label:'Підтримати проєкт'},
} as const;
export type SeoPath=keyof typeof SEO_PAGES;
export type Crumb={name:string;path:string};
export function absoluteUrl(path:string){
 const url=new URL(path,siteUrl());
 if(url.origin!==siteUrl().origin||url.search||url.hash)throw new Error('SEO URL must be a canonical site URL');
 return url.href;
}
export function descriptionText(value:string,max=175){
 const plain=value.replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,' ').replace(/[#*_`~>|]/g,' ').replace(/\s+/g,' ').trim();
 if(plain.length<=max)return plain;
 const cut=plain.slice(0,max-1),space=cut.lastIndexOf(' ');
 return `${space>max*.65?cut.slice(0,space):cut}…`;
}
function fullTitle(title:string){return title.startsWith(SITE_NAME)?title:`${title} · ${SITE_NAME}`;}
export function pageMetadata(path:string,title:string,description:string,image=DEFAULT_IMAGE,noindex=false):Metadata{
 const url=absoluteUrl(path),name=fullTitle(title);
 return {title:{absolute:name},description,alternates:{canonical:url,types:{'application/rss+xml':[{url:absoluteUrl('/feed.xml'),title:'Гайди та новини Лігва Друїда'}]}},
  robots:{index:!noindex,follow:true,googleBot:{index:!noindex,follow:true,'max-image-preview':'large','max-snippet':-1,'max-video-preview':-1}},
  openGraph:{type:'website',url,title:name,description,locale:'uk_UA',siteName:SITE_NAME,images:[{url:absoluteUrl(image),alt:title,...(image===DEFAULT_IMAGE?{width:1200,height:630}:{})}]},
  twitter:{card:'summary_large_image',title:name,description,images:[{url:absoluteUrl(image),alt:title}]},
 };
}
export const staticMetadata=(path:SeoPath)=>pageMetadata(path,SEO_PAGES[path].title,SEO_PAGES[path].description);
export function articleDescription(article:Article){return descriptionText(article.description)||descriptionText(article.body)||`${article.title} — матеріал українською від ${SITE_NAME}.`;}
export function articleDates(article:Article){
 const published=Date.parse(article.date),modified=Date.parse(article.updatedAt||article.date);
 return {published:Number.isFinite(published)?new Date(published).toISOString():undefined,modified:Number.isFinite(modified)&&modified>=published?new Date(modified).toISOString():Number.isFinite(published)?new Date(published).toISOString():undefined};
}
export function articleMetadata(article:Article):Metadata{
 const description=articleDescription(article),meta=pageMetadata(`/${article.kind}/${article.slug}`,article.title,description,article.image),dates=articleDates(article);
 return {...meta,authors:article.author?[{name:article.author}]:undefined,openGraph:{...meta.openGraph,type:'article',publishedTime:dates.published,modifiedTime:dates.modified,authors:article.author?[article.author]:undefined,tags:article.tags}};
}
export const schemaId=(fragment:string)=>`${absoluteUrl('/')}#${fragment}`;
export function siteSchema(socials:string[]=[]){return {'@context':'https://schema.org','@graph':[
 {'@type':'Organization','@id':schemaId('organization'),name:SITE_NAME,url:absoluteUrl('/'),logo:absoluteUrl('/assets/favicon/apple-icon-180x180.png'),sameAs:socials.filter(url=>/^https:\/\//.test(url))},
 {'@type':'WebSite','@id':schemaId('website'),name:SITE_NAME,url:absoluteUrl('/'),inLanguage:'uk',publisher:{'@id':schemaId('organization')}},
 ]};}
export function breadcrumbItems(path:string):Crumb[]{
 if(path==='/')return [];
 return [{name:'Головна',path:'/'},...(path==='/guild/apply'?[{name:SEO_PAGES['/guild'].label,path:'/guild'}]:[]),{name:SEO_PAGES[path as SeoPath]?.label||'Сторінка',path}];
}
export function breadcrumbSchema(items:Crumb[],path:string){return {'@type':'BreadcrumbList','@id':`${absoluteUrl(path)}#breadcrumb`,itemListElement:items.map((item,index)=>({'@type':'ListItem',position:index+1,name:item.name,item:absoluteUrl(item.path)}))};}
export function pageSchema(path:SeoPath,kind='WebPage'){
 const info=SEO_PAGES[path],items=breadcrumbItems(path);
 return {'@context':'https://schema.org','@graph':[
  {'@type':kind,'@id':`${absoluteUrl(path)}#webpage`,url:absoluteUrl(path),name:info.title,description:info.description,inLanguage:'uk',isPartOf:{'@id':schemaId('website')},...(items.length?{breadcrumb:{'@id':`${absoluteUrl(path)}#breadcrumb`}}:{})},
  ...(items.length?[breadcrumbSchema(items,path)]:[]),
 ]};
}
export function articleSchema(article:Article){
 const url=absoluteUrl(`/${article.kind}/${article.slug}`),dates=articleDates(article),items=[{name:'Головна',path:'/'},{name:SEO_PAGES[`/${article.kind}`].label,path:`/${article.kind}`},{name:article.title,path:`/${article.kind}/${article.slug}`}];
 return {'@context':'https://schema.org','@graph':[
  {'@type':'WebPage','@id':`${url}#webpage`,url,name:article.title,inLanguage:'uk',isPartOf:{'@id':schemaId('website')},mainEntity:{'@id':`${url}#article`},breadcrumb:{'@id':`${url}#breadcrumb`}},
  {'@type':article.kind==='news'?'BlogPosting':'Article','@id':`${url}#article`,mainEntityOfPage:{'@id':`${url}#webpage`},headline:article.title,description:articleDescription(article),image:[absoluteUrl(article.image)],datePublished:dates.published,dateModified:dates.modified,inLanguage:'uk',author:article.author?{'@type':'Person',name:article.author}:{'@id':schemaId('organization')},publisher:{'@id':schemaId('organization')},articleSection:SEO_PAGES[`/${article.kind}`].label,keywords:article.tags},
  breadcrumbSchema(items,`/${article.kind}/${article.slug}`),
 ]};
}
// CMS text must never terminate a JSON-LD script element.
export const serializeSchema=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
