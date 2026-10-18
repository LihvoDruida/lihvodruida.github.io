import {staticMetadata} from '@/lib/seo';
import {PageSeo} from '@/components/PageSeo';
import Link from 'next/link';
import {HeroArt} from '@/components/HeroArt';
import {Suspense} from 'react';
import {articles,data,type Character} from '@/lib/content';
import {ArticleCards,CommunityCards} from '@/components/Shared';
export const dynamic='force-dynamic';
export const metadata=staticMetadata('/');
async function RecentArticles(){const feed=await Promise.all([articles('guides'),articles('news')]).then(parts=>parts.flat().sort((a,b)=>b.date.localeCompare(a.date))).catch(()=>null);return feed?<ArticleCards items={feed.slice(0,6)}/>:<p className="notice" role="status">Матеріали тимчасово недоступні. Спробуй відкрити бібліотеку пізніше.</p>;}
export default function Home(){return <div className="home-page"><PageSeo path="/"/>
 <section className="hero"><HeroArt/><div className="hero-shade"/><div className="hero-content"><div className="hero-kicker"><span/>ТВОЄ МІСЦЕ В АЗЕРОТІ</div><h1>Знаходь своїх.<br/><em>Твори свою історію.</em></h1><p>Гайди, авторські адони та українська спільнота.<br/>Усе, що робить World of Warcraft ближчим.</p><div className="actions"><Link className="button primary" href="/guild/apply">Приєднатися до гільдії <span>↗</span></Link><Link className="button glass" href="/guides">Переглянути гайди</Link></div><div className="hero-footnote"><span>WORLD OF WARCRAFT</span><i/><span>УКРАЇНСЬКОЮ</span><i/><span>ЗІ СВОЇМИ</span></div></div><span className="hero-caption">ЛІГВО ДРУЇДА / СПІЛЬНОТА SEBAS</span></section>
 <div className="content-shell"><section className="section"><div className="section-heading"><div><span className="eyebrow">01 / СПІЛЬНОТИ</span><h2>Різні світи. Спільні цінності.</h2></div><p>Граємо, допомагаємо й зростаємо разом.</p></div><CommunityCards/></section>
 <section className="section"><div className="section-heading"><div><span className="eyebrow">02 / БІБЛІОТЕКА</span><h2>Знання для наступної пригоди</h2></div><Link href="/guides" className="text-link">Усі гайди ↗</Link></div><Suspense fallback={<p className="notice" role="status" aria-busy="true">Завантажуємо матеріали…</p>}><RecentArticles/></Suspense></section>
 <section className="section author-section"><div><span className="eyebrow">03 / ЗА ЛАШТУНКАМИ</span><h2>Створено гравцем.<br/>Для гравців.</h2><p>Я — Sebas. Розвиваю Лігво Друїда, створюю адони, ділюся гайдами та збираю українську ігрову спільноту.</p><div className="actions"><Link className="button" href="/mods">Мої розробки ↗</Link><Link className="subtle-link" href="/donate">Підтримати проєкт</Link></div></div><div className="character-list">{data<Character[]>('characters').map(c=><a href={c.link} key={c.name} target="_blank" rel="noopener noreferrer"><img src={c.avatar} width="52" height="52" loading="lazy" alt=""/><span><strong>{c.name}</strong><small>{c.class} · {c.realm}</small></span><span className="character-arrow">↗</span></a>)}</div></section></div></div>;}
