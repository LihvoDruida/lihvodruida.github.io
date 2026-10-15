'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import type {Envelope} from '@/lib/contracts';
export function useLiveSnapshot<T>(url:string,interval:number,initial?:Envelope<T>){
 const [snapshot,setSnapshot]=useState(initial);const [error,setError]=useState('');const [loading,setLoading]=useState(!initial);const wake=useRef<()=>void>(()=>{});
 const refresh=useCallback(()=>wake.current(),[]);
 useEffect(()=>{
  let stopped=false,running=false,failures=0,etag='',timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  setSnapshot(initial);setError('');setLoading(!initial);
  const schedule=()=>{clearTimeout(timer);if(!stopped&&!document.hidden&&navigator.onLine) timer=setTimeout(run,Math.min(interval*2**failures,300000)*(0.95+Math.random()*0.1));};
  async function run(){
   clearTimeout(timer);if(stopped||running||document.hidden||!navigator.onLine)return;
   running=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),10000);
   try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:etag?{'If-None-Match':etag}:{}});
    if(!response.ok&&response.status!==304)throw new Error('unavailable');
    if(response.status!==304){const next=await response.json() as Envelope<T>;if(!next?.data||!next.sync)throw new Error('contract');etag=response.headers.get('etag')||'';if(!stopped)setSnapshot(next);}
    else if(!stopped){const checked=response.headers.get('x-sync-checked-at');if(checked)setSnapshot(prev=>prev?{...prev,sync:{...prev.sync,checkedAt:checked}}:prev);}
    failures=0;if(!stopped)setError('');
   }catch{if(!stopped&&!document.hidden){failures=Math.min(failures+1,5);setError('З’єднання перервано. Повторимо автоматично.');}}
   finally{clearTimeout(timeout);running=false;if(!stopped){setLoading(false);schedule();}}
  }
  const resume=()=>{if(document.hidden||!navigator.onLine){clearTimeout(timer);controller?.abort();}else void run();};
  wake.current=()=>void run();void run();
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('offline',resume);
  return()=>{stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',resume);};
 // Initial data is a server snapshot. Its identity must not restart a running subscription.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[url,interval]);
 return {snapshot,error,loading,refresh};
}
