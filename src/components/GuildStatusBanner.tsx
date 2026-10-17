'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';

const COLLAPSED_CLASS='guild-banner-collapsed';
const SCROLL_THRESHOLD=28;
const SCROLL_DELTA=6;

/** Public masthead: the dashboard's scroll behavior, with intentionally empty sides. */
export function GuildStatusBanner({guildName,guildHref,onNavigate}:{guildName:string;guildHref:string;onNavigate:()=>void}){
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{
  let lastScrollY=window.scrollY,frame=0;
  const root=document.documentElement;
  const collapse=(value:boolean)=>{root.classList.toggle(COLLAPSED_CLASS,value);setCollapsed(value);};
  const update=()=>{
   frame=0;const current=window.scrollY;
   if(current<=SCROLL_THRESHOLD)collapse(false);
   else if(current>lastScrollY+SCROLL_DELTA)collapse(true);
   else if(current<lastScrollY-SCROLL_DELTA)collapse(false);
   if(current<=SCROLL_THRESHOLD||Math.abs(current-lastScrollY)>SCROLL_DELTA)lastScrollY=current;
  };
  const onScroll=()=>{if(!frame)frame=window.requestAnimationFrame(update);};
  collapse(lastScrollY>SCROLL_THRESHOLD);
  window.addEventListener('scroll',onScroll,{passive:true});
  return ()=>{window.removeEventListener('scroll',onScroll);if(frame)window.cancelAnimationFrame(frame);root.classList.remove(COLLAPSED_CLASS);};
 },[]);
 const name=guildName.trim(),brandBreak=name.lastIndexOf(' ');
 const start=brandBreak>0?name.slice(0,brandBreak):name,end=brandBreak>0?name.slice(brandBreak):'';
 return <div className="guild-status-banner" aria-label="Гільдія World of Warcraft" aria-hidden={collapsed||undefined} inert={collapsed}>
  <div className="guild-status-banner__inner">
   <div className="guild-status-banner__side" aria-hidden="true"/>
   <Link href={guildHref} prefetch={false} onClick={onNavigate} className="guild-status-banner__brand" aria-label={name}>
    <strong className="guild-status-banner__wordmark" title={name}><span>{start}</span>{end&&<span className="guild-status-banner__wordmark-accent">{end}</span>}</strong>
    <span className="guild-status-banner__brand-sub"><i aria-hidden="true"/> World of Warcraft <i aria-hidden="true"/></span>
   </Link>
   <div className="guild-status-banner__side" aria-hidden="true"/>
  </div>
 </div>;
}
