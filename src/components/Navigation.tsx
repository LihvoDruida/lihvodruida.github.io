'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
import {GuildStatusBanner} from './GuildStatusBanner';
const links=[['/','Головна'],['/guides','Гайди'],['/news','Новини'],['/mods','Адони'],['/guild','Гільдія']];
export function Navigation({guildName,guildHref}:{guildName:string;guildHref:string}){const path=usePathname();const [open,setOpen]=useState(false);return <><GuildStatusBanner guildName={guildName} guildHref={guildHref} onNavigate={()=>setOpen(false)}/><header className="site-header"><div className="nav-inner"><Link href="/" className="brand" onClick={()=>setOpen(false)}><img src="/assets/img/guild-logo.webp" width="44" height="44" alt=""/><span>ЛІГВО ДРУЇДА<small>УКРАЇНСЬКА ІГРОВА СПІЛЬНОТА</small></span></Link><button type="button" className="menu-toggle" aria-expanded={open} aria-controls="primary-navigation" onClick={()=>setOpen(!open)}>{open?'Закрити ✕':'Меню ☰'}</button><nav id="primary-navigation" className={open?'navigation is-open':'navigation'} aria-label="Головна навігація">{links.map(([href,label])=><Link key={href} href={href} aria-current={(href==='/'?path==='/':path.startsWith(href))?'page':undefined} onClick={()=>setOpen(false)}>{label}</Link>)}<Link className="nav-support" href="/donate" onClick={()=>setOpen(false)}>Підтримати ↗</Link></nav></div></header></>;}
