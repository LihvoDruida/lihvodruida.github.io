import type {Metadata,Viewport} from 'next';
import Script from 'next/script';
import localFont from 'next/font/local';
import {SiteSyncController} from '@/components/SiteSync';
import {Motion} from '@/components/Motion';
import {Navigation} from '@/components/Navigation';
import {Footer} from '@/components/Shared';
import {siteUrl,data,type Community} from '@/lib/content';
import {siteSchema,SITE_NAME,SEO_PAGES,DEFAULT_IMAGE} from '@/lib/seo';
import {StructuredData} from '@/components/StructuredData';
import './globals.css';
import './guild-banner.css';
import './motion.css';
import './navigation.css';
const guildMasthead=localFont({src:'../../assets/fonts/site/Cinzel.woff2',weight:'400 900',style:'normal',display:'swap',variable:'--font-guild-masthead'});
const guildDisplay=localFont({src:'../../assets/fonts/site/SpectralSC-Bold.woff2',weight:'700',style:'normal',display:'swap',preload:false,variable:'--font-guild-display'});
// Headings: Playfair Display covers Latin and full Ukrainian Cyrillic, so a heading
// never mixes two typefaces. Cinzel (Latin only) stays for the English guild wordmark.
const display=localFont({src:'../../assets/fonts/site/PlayfairDisplay-Latin.woff2',weight:'400 900',style:'normal',display:'swap',adjustFontFallback:false,fallback:[],variable:'--font-site-display'});
const displayCyrillic=localFont({src:'../../assets/fonts/site/PlayfairDisplay-Cyrillic.woff2',weight:'400 900',style:'normal',display:'swap',adjustFontFallback:false,fallback:[],variable:'--font-site-display-cyrillic'});
const inter=localFont({src:'../../assets/fonts/site/Inter-Latin.woff2',weight:'100 900',style:'normal',display:'swap',adjustFontFallback:false,fallback:[],variable:'--font-site-inter'});
const interCyrillic=localFont({src:'../../assets/fonts/site/Inter-Cyrillic.woff2',weight:'100 900',style:'normal',display:'swap',adjustFontFallback:false,fallback:[],variable:'--font-site-inter-cyrillic'});
export const metadata:Metadata={metadataBase:siteUrl(),title:{default:SEO_PAGES['/'].title,template:`%s · ${SITE_NAME}`},description:SEO_PAGES['/'].description,applicationName:SITE_NAME,category:'World of Warcraft',openGraph:{type:'website',locale:'uk_UA',siteName:SITE_NAME,images:[DEFAULT_IMAGE]},twitter:{card:'summary_large_image',images:[DEFAULT_IMAGE]},alternates:{types:{'application/rss+xml':'/feed.xml'}},verification:{google:process.env.GOOGLE_SITE_VERIFICATION||undefined,other:process.env.BING_SITE_VERIFICATION?{'msvalidate.01':process.env.BING_SITE_VERIFICATION}:undefined},icons:{icon:'/favicon.ico',apple:'/assets/favicon/apple-icon-180x180.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#100d0a'};
// Third-party images (Blizzard avatars, CurseForge logos, CMS covers) can fail; swap
// to a local placeholder once instead of showing a broken image. Capture phase,
// installed before the body is parsed, so errors that fire before hydration count too.
const IMAGE_FALLBACK="addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&t.dataset.fallback&&!t.dataset.failed){t.dataset.failed='1';t.removeAttribute('srcset');t.src=t.dataset.fallback;}},true);";
export default function RootLayout({children}:{children:React.ReactNode}){const guild=data<Community[]>('guilds').find(g=>g.id==='mistblossom')!;return <html lang="uk" data-scroll-behavior="smooth" className={`${guildMasthead.variable} ${guildDisplay.variable} ${inter.variable} ${interCyrillic.variable} ${display.variable} ${displayCyrillic.variable}`}><head><script dangerouslySetInnerHTML={{__html:IMAGE_FALLBACK}}/></head><body className="site-with-guild-banner"><StructuredData value={siteSchema(Object.values(data<Record<string,string>>('socials')))}/><a className="skip-link" href="#main">До вмісту</a><Navigation guildName={guild.name} guildHref={guild.page||'/guild'} socials={data<Record<string,string>>('socials')}/><SiteSyncController/><Motion/><main id="main">{children}</main><Footer/><Script src="/assets/js/starfield.js" strategy="lazyOnload"/></body></html>;}
