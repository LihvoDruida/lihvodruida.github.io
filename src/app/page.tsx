import {staticMetadata} from '@/lib/seo';
import {PageSeo} from '@/components/PageSeo';
import Link from 'next/link';
import {HeroArt} from '@/components/HeroArt';
import {Suspense} from 'react';
import {articles} from '@/lib/content';
import {ownerCharacters,staticOwnerCharacters,type OwnerCharacter} from '@/lib/owner';
import {ArticleCards,CommunityCards} from '@/components/Shared';
export const dynamic='force-dynamic';
export const metadata=staticMetadata('/');
async function RecentArticles(){const feed=await Promise.all([articles('guides'),articles('news')]).then(parts=>parts.flat().sort((a,b)=>b.date.localeCompare(a.date))).catch(()=>null);return feed?<ArticleCards items={feed.slice(0,6)}/>:<p className="notice" role="status">Матеріали тимчасово недоступні. Спробуй відкрити бібліотеку пізніше.</p>;}
/** Owner's characters: main first, then the order chosen in the panel profile settings. */
function CharacterCards({items}:{items:OwnerCharacter[]}){return <ul className="character-list" aria-label="Персонажі автора">{items.map(c=>{
 const meta=[c.itemLevel?`ilvl ${c.itemLevel}`:null,c.rio?`RIO ${c.rio}`:null].filter(Boolean).join(' · ');
 const body=<><img src={c.avatarUrl||'/assets/img/guild-logo.webp'} data-fallback="/assets/img/guild-logo.webp" width="52" height="52" loading="lazy" alt=""/><span className="character-copy"><strong>{c.name}{c.isMain&&<span className="character-tag">Мейн</span>}{c.edition==='forever'&&<span className="character-tag forever">Forever</span>}</strong><small>{[c.specName,c.className].filter(Boolean).join(' ')||'Клас невідомий'} · {c.realm}</small>{meta&&<small className="character-meta">{meta}</small>}</span>{c.link&&<span className="character-arrow" aria-hidden="true">↗</span>}</>;
 return <li key={`${c.edition}:${c.name}:${c.realm}`}>{c.link?<a href={c.link} target="_blank" rel="noopener noreferrer">{body}</a>:<div>{body}</div>}</li>;})}</ul>;}
async function OwnerCharacterList(){const {items}=await ownerCharacters();return <CharacterCards items={items}/>;}
export default function Home(){return <div className="home-page"><PageSeo path="/"/>
 <section className="hero"><HeroArt/><div className="hero-shade"/><div className="hero-content"><div className="hero-kicker"><span/>ТВОЄ МІСЦЕ В АЗЕРОТІ</div><h1>Знаходь своїх.<br/><em>Твори свою історію.</em></h1><p>Гайди, авторські адони та українська спільнота.<br/>Усе, що робить World of Warcraft ближчим.</p><div className="actions"><Link className="button primary" href="/guild/apply">Приєднатися до гільдії <span>↗</span></Link><Link className="button glass" href="/guides">Переглянути гайди</Link></div><div className="hero-footnote"><span>WORLD OF WARCRAFT</span><i/><span>УКРАЇНСЬКОЮ</span><i/><span>ЗІ СВОЇМИ</span></div></div><span className="hero-caption">ЛІГВО ДРУЇДА / СПІЛЬНОТА SEBAS</span></section>
 <div className="content-shell"><section className="section"><div className="section-heading"><div><span className="eyebrow">01 / СПІЛЬНОТИ</span><h2>Різні світи. Спільні цінності.</h2></div><p>Граємо, допомагаємо й зростаємо разом.</p></div><CommunityCards/></section>
 <section className="section"><div className="section-heading"><div><span className="eyebrow">02 / БІБЛІОТЕКА</span><h2>Знання для наступної пригоди</h2></div><Link href="/guides" className="text-link">Усі гайди ↗</Link></div><Suspense fallback={<p className="notice" role="status" aria-busy="true">Завантажуємо матеріали…</p>}><RecentArticles/></Suspense></section>
 <section className="section author-section"><div><span className="eyebrow">03 / ЗА ЛАШТУНКАМИ</span><h2>Створено гравцем.<br/>Для гравців.</h2><p>Я — Sebas. Розвиваю Лігво Друїда, створюю адони, ділюся гайдами та збираю українську ігрову спільноту.</p><div className="actions"><Link className="button" href="/mods">Мої розробки ↗</Link><Link className="subtle-link" href="/donate">Підтримати проєкт</Link></div></div><Suspense fallback={<CharacterCards items={staticOwnerCharacters()}/>}><OwnerCharacterList/></Suspense></section></div></div>;}
