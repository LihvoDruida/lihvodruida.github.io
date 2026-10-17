import {communityLogo} from '@/lib/site-assets';
import {staticMetadata} from '@/lib/seo';
import {PageSeo} from '@/components/PageSeo';
import Link from 'next/link';
import {data} from '@/lib/content';
import {PageHeading} from '@/components/Shared';
import {ApplicationForm} from '@/components/ApplicationForm';
export const dynamic='force-dynamic';
export const metadata=staticMetadata('/guild/apply');
export default function Apply(){return <div className="content-shell"><PageSeo path="/guild/apply" kind="WebPage"/><PageHeading eyebrow="MISTBLOSSOM VANGUARD / ПРИЄДНАТИСЯ" title="Вступити до Mistblossom Vanguard" description="Заявка до української гільдії World of Warcraft. Розкажи про себе, персонажа й зручний час для гри — познайомимось у Discord."/><div className="apply-layout"><ApplicationForm endpoint="/site-api/v1/applications" realms={[...new Set(data<string[]>('realms'))]}/><aside className="apply-aside"><img {...communityLogo('/assets/img/guild-logo.webp',104)} width="104" height="104" alt=""/><h2>У гільдії важливі люди</h2><p>Ми — українська спільнота для спільних рейдів, Mythic+ та гри у своє задоволення.</p><ol><li><strong>Заповни заявку</strong><span>Персонаж, час гри та контакт.</span></li><li><strong>Збережи номер</strong><span>Він допоможе знайти статус.</span></li><li><strong>Познайомимось у Discord</strong><span>Офіцери зв’яжуться з тобою.</span></li></ol><a className="button" href="https://discord.gg/stNeSaVkhM" target="_blank" rel="noopener noreferrer">Приєднатися до Discord ↗</a><Link className="text-link" href="/guild/applications">Уже подавав заявку? Перевір статус →</Link></aside></div></div>;}
