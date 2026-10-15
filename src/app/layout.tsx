import type {Metadata,Viewport} from 'next';
import Script from 'next/script';
import {Navigation} from '@/components/Navigation';
import {Footer} from '@/components/Shared';
import {siteUrl} from '@/lib/content';
import './globals.css';
export const metadata:Metadata={metadataBase:siteUrl(),title:{default:'Лігво Друїда — українська WoW-спільнота',template:'%s · Лігво Друїда'},description:'Гайди українською, авторські адони та гільдія Mistblossom Vanguard. Знаходь своїх в Азероті.',openGraph:{type:'website',locale:'uk_UA',siteName:'Лігво Друїда',images:['/assets/img/og-image-default.webp']},icons:{icon:'/favicon.ico',apple:'/assets/favicon/apple-icon-180x180.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#100d0a'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="uk"><body><a className="skip-link" href="#main">До вмісту</a><Navigation/><main id="main">{children}</main><Footer/><Script src="/assets/js/starfield.js" strategy="afterInteractive"/></body></html>;}
