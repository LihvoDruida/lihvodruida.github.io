'use client';
import {useEffect,useRef,useTransition} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {useLiveSnapshot} from './useLiveSnapshot';
import {isSiteSync,SITE_SYNC_EVENT,type SiteSync,type SyncResource} from '@/lib/sync-contract';
export function SiteSyncController(){
 const {snapshot,error,loading,refresh}=useLiveSnapshot<SiteSync>('/site-api/v1/sync',15000);
 const previous=useRef<SiteSync['resources']|null>(null),router=useRouter(),path=usePathname();const [,transition]=useTransition();
 useEffect(()=>{
  if(!snapshot||!isSiteSync(snapshot.data))return;
  const next=snapshot.data.resources,changed=(['content','guild','applications'] as const).filter(resource=>previous.current?.[resource]!==next[resource]);previous.current=next;
  if(!changed.length)return;
  window.dispatchEvent(new CustomEvent<SyncResource[]>(SITE_SYNC_EVENT,{detail:changed}));
  if(changed.includes('content')&&(path==='/'||/^\/(news|guides)(\/|$)/.test(path||'')))transition(()=>router.refresh());
 },[snapshot,path,router]);
 if(!error)return null;
 return <div className="site-sync-notice" role="status"><span>Оновлення даних тимчасово недоступне. {error}</span><button className="subtle-button" type="button" onClick={refresh} disabled={loading}>Повторити</button></div>;
}
