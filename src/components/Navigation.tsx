'use client';
import {communityLogo} from '@/lib/site-assets';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {GuildStatusBanner} from './GuildStatusBanner';
import {SocialLinks} from './SocialLinks';
const links=[['/','Головна'],['/guides','Гайди'],['/news','Новини'],['/mods','Адони'],['/guild','Гільдія']];
// Matches the CSS breakpoint where the menu becomes a drawer.
const MOBILE_QUERY='(max-width: 800px)';
const OPEN_CLASS='site-nav-open';

export function Navigation({guildName,guildHref,socials}:{guildName:string;guildHref:string;socials:Record<string,string>}){
 const path=usePathname();
 const [open,setOpen]=useState(false);
 const toggleRef=useRef<HTMLButtonElement>(null);
 const navRef=useRef<HTMLElement>(null);
 const close=useCallback((restoreFocus=false)=>{setOpen(false);if(restoreFocus)toggleRef.current?.focus();},[]);
 const navigateHome=()=>{setOpen(false);if(path==='/')window.scrollTo({top:0,left:0,behavior:'instant'});};

 // A route change always closes the drawer (links, back/forward, programmatic navigation).
 useEffect(()=>{setOpen(false);},[path]);

 // Growing past the breakpoint resets the drawer so it never reopens by itself.
 useEffect(()=>{
  const media=window.matchMedia(MOBILE_QUERY);
  const onChange=()=>{if(!media.matches)setOpen(false);};
  media.addEventListener('change',onChange);
  return ()=>media.removeEventListener('change',onChange);
 },[]);

 // Open drawer: lock page scroll, Escape closes, Tab stays inside the header.
 useEffect(()=>{
  const root=document.documentElement;
  root.classList.toggle(OPEN_CLASS,open);
  if(!open)return;
  const first=navRef.current?.querySelector<HTMLElement>('a[href]');
  first?.focus({preventScroll:true});
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();close(true);return;}
   if(event.key!=='Tab')return;
   const focusable=[toggleRef.current,...(navRef.current?.querySelectorAll<HTMLElement>('a[href]')||[])].filter(Boolean) as HTMLElement[];
   const firstItem=focusable[0],lastItem=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===firstItem){event.preventDefault();lastItem.focus();}
   else if(!event.shiftKey&&document.activeElement===lastItem){event.preventDefault();firstItem.focus();}
  };
  document.addEventListener('keydown',onKey);
  return ()=>{document.removeEventListener('keydown',onKey);root.classList.remove(OPEN_CLASS);};
 },[open,close]);

 return <><GuildStatusBanner guildName={guildName} guildHref={guildHref} onNavigate={()=>setOpen(false)}/>
  <header className="site-header" data-open={open||undefined}><div className="nav-inner">
   <Link href="/" onNavigate={navigateHome} className="brand" onClick={()=>setOpen(false)}><img {...communityLogo('/assets/img/guild-logo.webp',44)} width="44" height="44" alt=""/><span>ЛІГВО ДРУЇДА<small>УКРАЇНСЬКА ІГРОВА СПІЛЬНОТА</small></span></Link>
   <button ref={toggleRef} type="button" className="menu-toggle" aria-expanded={open} aria-controls="primary-navigation" aria-label={open?'Закрити меню':'Відкрити меню'} onClick={()=>setOpen(value=>!value)}>
    <span className="menu-toggle-icon" aria-hidden="true"><span/><span/><span/></span><span className="menu-toggle-text" aria-hidden="true">{open?'Закрити':'Меню'}</span>
   </button>
   <nav ref={navRef} id="primary-navigation" className={open?'navigation is-open':'navigation'} aria-label="Головна навігація">
    {links.map(([href,label],index)=><Link key={href} href={href} style={{'--nav-index':index} as CSSProperties} onNavigate={href==='/'?navigateHome:undefined} aria-current={(href==='/'?path==='/':path.startsWith(href))?'page':undefined} onClick={()=>setOpen(false)}>{label}</Link>)}
    <Link className="nav-support" href="/donate" style={{'--nav-index':links.length} as CSSProperties} aria-current={path.startsWith('/donate')?'page':undefined} onClick={()=>setOpen(false)}>Підтримати ↗</Link>
    <SocialLinks socials={socials} className="nav-socials"/>
   </nav>
  </div></header>
  <div className="nav-backdrop" data-open={open||undefined} aria-hidden="true" onClick={()=>close()}/>
 </>;
}
