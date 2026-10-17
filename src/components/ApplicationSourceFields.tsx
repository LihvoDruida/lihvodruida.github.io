'use client';
import {useState} from 'react';
import {applicationSourceGroups} from '@/lib/application-sources';

export function ApplicationSourceFields(){
 const [source,setSource]=useState(''),[platform,setPlatform]=useState('');
 const selected=applicationSourceGroups.flatMap(g=>g.items).find(s=>s.value===source);
 const customPlatform=platform.startsWith('Інш');
 const detail=selected?.detail||(customPlatform?'Уточни платформу та джерело':'');
 const detailRequired=!!selected?.requireDetail||customPlatform;
 return <div className="form-grid">
  <label>Звідки дізнався про нас?<select name="sourceCreator" required value={source} onChange={e=>{setSource(e.target.value);setPlatform('');}}>
   <option value="">Обери джерело</option>
   {applicationSourceGroups.map(group=><optgroup label={group.label} key={group.label}>{group.items.map(s=><option key={s.value}>{s.value}</option>)}</optgroup>)}
  </select></label>
  {selected?.platform&&<input type="hidden" name="sourcePlatform" value={selected.platform}/>}
  {selected?.platforms&&<label>Платформа<select name="sourcePlatform" required value={platform} onChange={e=>setPlatform(e.target.value)}>
   <option value="">Обери платформу</option>{selected.platforms.map(p=><option key={p}>{p}</option>)}
  </select></label>}
  {detail&&<label key={source}>{detail}{!detailRequired&&' (необов’язково)'}<input name="sourceOther" required={detailRequired} maxLength={160} placeholder={selected?.placeholder||'Назва платформи, сайту або спільноти'}/></label>}
 </div>;
}
