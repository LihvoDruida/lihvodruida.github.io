import type {Metadata,Viewport} from 'next';
import Script from 'next/script';
import localFont from 'next/font/local';
import {LiveStreams} from '@/components/LiveStreams';
import {SiteSyncController} from '@/components/SiteSync';
import {Navigation} from '@/components/Navigation';
import {Footer} from '@/components/Shared';
import {siteUrl,data,type Community} from '@/lib/content';
import {siteSchema,SITE_NAME,SEO_PAGES,DEFAULT_IMAGE} from '@/lib/seo';
import {StructuredData} from '@/components/StructuredData';
import './globals.css';
import './guild-banner.css';
const guildMasthead=localFont({src:'../../assets/fonts/site/Cinzel.woff2',weight:'400 900',style:'normal',display:'swap',variable:'--font-guild-masthead'});
const guildDisplay=localFont({src:'../../assets/fonts/site/SpectralSC-Bold.woff2',weight:'700',style:'normal',display:'swap',preload:false,variable:'--font-guild-display'});
const inter=localFont({src:'../../assets/fonts/site/Inter-Latin.woff2',weight:'100 900',style:'normal',display:'swap',adjustFontFallback:false,fallback:[],variable:'--font-site-inter'});
const interCyrillic=localFont({src:'../../assets/fonts/site/Inter-Cyrillic.woff2',weight:'100 900',style:'normal',display:'swap',adjustFontFallback:false,fallback:[],variable:'--font-site-inter-cyrillic'});
export const metadata:Metadata={metadataBase:siteUrl(),title:{default:SEO_PAGES['/'].title,template:`%s · ${SITE_NAME}`},description:SEO_PAGES['/'].description,applicationName:SITE_NAME,category:'World of Warcraft',openGraph:{type:'website',locale:'uk_UA',siteName:SITE_NAME,images:[DEFAULT_IMAGE]},twitter:{card:'summary_large_image',images:[DEFAULT_IMAGE]},alternates:{types:{'application/rss+xml':'/feed.xml'}},verification:{google:process.env.GOOGLE_SITE_VERIFICATION||undefined,other:process.env.BING_SITE_VERIFICATION?{'msvalidate.01':process.env.BING_SITE_VERIFICATION}:undefined},icons:{icon:'/favicon.ico',apple:'/assets/favicon/apple-icon-180x180.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#100d0a'};
export default function RootLayout({children}:{children:React.ReactNode}){const guild=data<Community[]>('guilds').find(g=>g.id==='mistblossom')!;return <html lang="uk" data-scroll-behavior="smooth" className={`${guildMasthead.variable} ${guildDisplay.variable} ${inter.variable} ${interCyrillic.variable}`}><body className="site-with-guild-banner"><StructuredData value={siteSchema(Object.values(data<Record<string,string>>('socials')))}/><a className="skip-link" href="#main">До вмісту</a><Navigation guildName={guild.name} guildHref={guild.page||'/guild'}/><SiteSyncController/><LiveStreams/><main id="main">{children}</main><Footer/><Script src="/assets/js/starfield.js" strategy="lazyOnload"/></body></html>;}
