'use client';
import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {startReveal} from '@/lib/motion';

/** Scroll reveal inside <main>, restarted per route; marks client navigations for the page fade-in. */
export function Motion(){
 const path=usePathname(),first=useRef(true);
 useEffect(()=>{
  // The first render is the server page: only later route changes fade in.
  if(first.current)first.current=false;else document.documentElement.classList.add('route-changed');
  return startReveal(document.getElementById('main'));
 },[path]);
 return null;
}
