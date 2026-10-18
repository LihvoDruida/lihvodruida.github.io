'use client';
import {useEffect,useState} from 'react';
import {useLiveSnapshot} from './useLiveSnapshot';
import {isPublicStreamers,type PublicStreamers} from '@/lib/streamers-contract';
export function LiveStreams(){
 const {snapshot,error}=useLiveSnapshot<PublicStreamers>('/site-api/v1/streamers',30000);
 const [now,setNow]=useState(0),[expanded,setExpanded]=useState(true);
 useEffect(()=>{const update=()=>setNow(Date.now());update();const timer=setInterval(update,10000);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};},[]);
 const items=snapshot&&isPublicStreamers(snapshot.data)?snapshot.data.items.filter(i=>Date.parse(i.expiresAt)>now&&Date.parse(i.expiresAt)<=now+310000):[];
 if(!now||!items.length)return null;
 return <aside className="live-streams" aria-label="Трансляції учасників гільдії"><div className="live-streams__heading"><span role="status"><i aria-hidden="true"/> Наживо зараз · {items.length}</span><button type="button" aria-expanded={expanded} aria-controls="guild-live-streams" aria-label={expanded?'Згорнути трансляції':'Показати трансляції'} onClick={()=>setExpanded(v=>!v)}>{expanded?'−':'+'}</button></div>
  <div id="guild-live-streams" hidden={!expanded} className="live-streams__list">{items.map(item=><a className="live-streams__card" key={item.id+item.live.id} href={item.live.url} target="_blank" rel="noopener noreferrer"><span className={`live-streams__platform live-streams__platform--${item.platform}`}>{item.platform==='twitch'?'Twitch':'YouTube'} · LIVE</span><strong>{item.memberName}</strong><span className="live-streams__title">{item.live.title}</span><small>Дивитися трансляцію ↗</small></a>)}{error&&<small role="status">Оновлення затримується. Статус показано за останньою перевіркою.</small>}</div>
 </aside>;
}
