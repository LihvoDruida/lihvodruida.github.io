import type {ReactNode} from 'react';

/** Line icons on a 24px grid (stroke = currentColor), matching the dashboard icon style. */
const NETWORKS:Record<string,{label:string;icon:ReactNode}>={
 telegram:{label:'Telegram-канал',icon:<><path d="M21 4 3.4 10.9c-.8.3-.8 1.4 0 1.7l4.6 1.6 1.7 5.3c.2.7 1.1.9 1.6.4l2.6-2.4 4.5 3.3c.6.4 1.4.1 1.6-.6L21.9 5c.2-.7-.4-1.3-.9-1Z"/><path d="m8 14.2 9.5-6.4-6.8 7.4"/></>},
 discord:{label:'Discord',icon:<><path d="M8.2 6.4A14 14 0 0 1 12 6a14 14 0 0 1 3.8.4c2.6.7 3.7 2 3.7 2 1 2 1.5 4.3 1.4 6.7a11 11 0 0 1-3.6 2.6l-1.1-1.8"/><path d="M8.2 6.4S7.1 7.7 6.1 9.7a13 13 0 0 0-1.4 6.7 11 11 0 0 0 3.6 2.6l1.1-1.8"/><path d="M8.5 16.2a11 11 0 0 0 7 0"/><circle cx="9.3" cy="12.4" r="1.2"/><circle cx="14.7" cy="12.4" r="1.2"/></>},
 youtube:{label:'YouTube',icon:<><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10.2 9.2 4.8 2.8-4.8 2.8Z"/></>},
 twitch:{label:'Twitch',icon:<><path d="M5 3h15v11l-4 4h-4l-3 3v-3H5Z"/><path d="M11 8v4M15.5 8v4"/></>},
 tiktok:{label:'TikTok',icon:<><path d="M13.5 3v11.6a3.6 3.6 0 1 1-3.6-3.6"/><path d="M13.5 3c.3 2.7 2.2 4.6 5 4.9"/></>},
};

export function SocialIcon({name}:{name:string}){
 const network=NETWORKS[name];
 return <svg className="social-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{network?.icon}</svg>;
}

/** Icon buttons for the community's social profiles (unknown keys are skipped). */
export function SocialLinks({socials,className='social-links'}:{socials:Record<string,string>;className?:string}){
 const items=Object.entries(socials).filter(([name,url])=>NETWORKS[name]&&/^https:\/\//.test(url));
 return <ul className={className} aria-label="Лігво Друїда в соцмережах">{items.map(([name,url])=><li key={name}>
  <a className="social-link" data-network={name} href={url} target="_blank" rel="noopener noreferrer" aria-label={`${NETWORKS[name].label} Лігва Друїда (відкриється в новій вкладці)`} title={NETWORKS[name].label}><SocialIcon name={name}/></a>
 </li>)}</ul>;
}
