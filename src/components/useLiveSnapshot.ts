'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import {apiJson} from '@/lib/client-api';
import {SITE_SYNC_EVENT,type SyncResource} from '@/lib/sync-contract';
import type {Envelope} from '@/lib/contracts';
export function useLiveSnapshot<T>(url:string,interval:number,initial?:Envelope<T>){
 const [snapshot,setSnapshot]=useState(initial);const [error,setError]=useState('');const [loading,setLoading]=useState(!initial);const wake=useRef<()=>void>(()=>{});
 const refresh=useCallback(()=>wake.current(),[]);
 useEffect(()=>{
  let stopped=false,running=false,queued=false,failures=0,etag='',timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  setSnapshot(initial);setError('');setLoading(!initial);
  const schedule=()=>{clearTimeout(timer);if(!stopped&&!document.hidden&&navigator.onLine) timer=setTimeout(run,Math.min(interval*2**failures,300000)*(0.95+Math.random()*0.1));};
  async function run(){
   clearTimeout(timer);if(stopped||running||document.hidden||!navigator.onLine)return;
   running=true;setLoading(true);const active=new AbortController();controller=active;const timeout=setTimeout(()=>active.abort(),15000);
   try{
    const response=await fetch(url,{cache:'no-store',signal:active.signal,credentials:'same-origin',redirect:'error',headers:{Accept:'application/json',...(etag?{'If-None-Match':etag}:{})}});
    if(response.status!==304){const next=await apiJson<Envelope<T>>(response);if(!next?.data||!next.sync)throw new Error('contract');etag=response.headers.get('etag')||'';if(!stopped)setSnapshot(next);}
    else if(!stopped){const checked=response.headers.get('x-sync-checked-at');if(checked)setSnapshot(prev=>prev?{...prev,sync:{...prev.sync,checkedAt:checked,updatedAt:response.headers.get('x-sync-updated-at')||prev.sync.updatedAt,stale:response.headers.get('x-sync-stale')==='true'}}:prev);}
    failures=0;if(!stopped)setError('');
   }catch(error){if(!stopped&&!document.hidden&&!(active.signal.aborted&&active.signal.reason==='paused')){failures=Math.min(failures+1,5);setError(error instanceof Error&&error.name!=='AbortError'?error.message:'Запит тривав надто довго. Повторимо автоматично.');}}
   finally{clearTimeout(timeout);running=false;if(!stopped){setLoading(false);if(queued){queued=false;timer=setTimeout(run,0);}else schedule();}}
  }
  const resume=()=>{if(document.hidden||!navigator.onLine){clearTimeout(timer);controller?.abort('paused');}else{failures=0;requestRefresh();}};
  const requestRefresh=()=>{if(running)queued=true;else void run();};
  const onSync=(event:Event)=>{const resources=(event as CustomEvent<SyncResource[]>).detail;if(Array.isArray(resources)&&resources.some(resource=>url.startsWith(`/site-api/v1/${resource}`)))requestRefresh();};
  wake.current=requestRefresh;void run();
  window.addEventListener(SITE_SYNC_EVENT,onSync);
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('offline',resume);
  return()=>{window.removeEventListener(SITE_SYNC_EVENT,onSync);stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',resume);};
 // Initial data is a server snapshot. Its identity must not restart a running subscription.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[url,interval]);
 return {snapshot,error,loading,refresh};
}
