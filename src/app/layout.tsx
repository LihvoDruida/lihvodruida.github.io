import type {Metadata,Viewport} from 'next';
import Script from 'next/script';
import {SiteSyncController} from '@/components/SiteSync';
import {Navigation} from '@/components/Navigation';
import {Footer} from '@/components/Shared';
import {siteUrl,data} from '@/lib/content';
import {siteSchema,SITE_NAME,SEO_PAGES,DEFAULT_IMAGE} from '@/lib/seo';
import {StructuredData} from '@/components/StructuredData';
import './globals.css';
export const metadata:Metadata={metadataBase:siteUrl(),title:{default:SEO_PAGES['/'].title,template:`%s · ${SITE_NAME}`},description:SEO_PAGES['/'].description,applicationName:SITE_NAME,category:'World of Warcraft',openGraph:{type:'website',locale:'uk_UA',siteName:SITE_NAME,images:[DEFAULT_IMAGE]},twitter:{card:'summary_large_image',images:[DEFAULT_IMAGE]},alternates:{types:{'application/rss+xml':'/feed.xml'}},verification:{google:process.env.GOOGLE_SITE_VERIFICATION||undefined,other:process.env.BING_SITE_VERIFICATION?{'msvalidate.01':process.env.BING_SITE_VERIFICATION}:undefined},icons:{icon:'/favicon.ico',apple:'/assets/favicon/apple-icon-180x180.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#100d0a'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="uk"><body><StructuredData value={siteSchema(Object.values(data<Record<string,string>>('socials')))}/><a className="skip-link" href="#main">До вмісту</a><Navigation/><SiteSyncController/><main id="main">{children}</main><Footer/><Script src="/assets/js/starfield.js" strategy="afterInteractive"/></body></html>;}
