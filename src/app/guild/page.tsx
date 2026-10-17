import {communityLogo} from '@/lib/site-assets';
import Link from 'next/link';
import {data,type ProfessionData} from '@/lib/content';
import {guildLanding,guildMetadata,guildSchema} from '@/lib/guild-profile';
import {breadcrumbItems} from '@/lib/seo';
import {GuildView} from '@/components/GuildView';
import {StructuredData} from '@/components/StructuredData';
import {Breadcrumbs} from '@/components/Breadcrumbs';
export const generateMetadata=guildMetadata;
export const dynamic='force-dynamic';
export default async function Guild(){
 const g=await guildLanding();
 const professions=data<ProfessionData>('professions').characters.map(p=>({name:p.name,realm:p.realm,items:p.professions.primaries.map(x=>{const t=x.tiers.at(-1);return `${x.name}${t?` · ${t.name}: ${t.learned_points}/${t.max_points}`:''}`;})}));
 return <div className="content-shell">
  <StructuredData value={guildSchema(g)}/><Breadcrumbs items={breadcrumbItems('/guild')}/>
  <header className="guild-hero"><div className="guild-emblem"><img {...communityLogo(g.community.logo,120)} width="120" height="120" alt={`Емблема гільдії ${g.name}`}/></div><div><span className="eyebrow">WORLD OF WARCRAFT / УКРАЇНСЬКА ГІЛЬДІЯ</span><h1>{g.name}</h1><p>Українська гільдія WoW: рейди, Mythic+ та свої люди по той бік екрана.</p><div className="chips">{g.realm&&<span>EU · {g.realm}</span>}{(g.snapshot?.data.guild.faction?.name||g.snapshot?.data.guild.faction?.type)&&<span>{g.snapshot?.data.guild.faction?.name||g.snapshot?.data.guild.faction?.type}</span>}<span>Спілкуємося українською</span></div></div><div className="guild-hero-actions"><Link className="button primary" href="/guild/apply">Вступити до гільдії ↗</Link><a className="subtle-link" href={g.community.discord} target="_blank" rel="noopener noreferrer">Наш Discord ↗</a></div></header>
  <section className="guild-intro" aria-labelledby="guild-about"><div><span className="eyebrow">ЗНАЙДИ СВОЇХ В АЗЕРОТІ</span><h2 id="guild-about">Українська гільдія для рейдів та Mythic+</h2><p>Шукаєш гільдію в World of Warcraft, де можна грати й спілкуватися українською? {g.name}{g.realm?` на європейському реалмі ${g.realm}`:''} об’єднує гравців для рейдів, міфічних ключів і спільної гри без токсичності.</p><p>На цій сторінці можна познайомитися зі складом, переглянути підтверджений рейдовий прогрес і заплановані події. Щоб розповісти про свого персонажа та час гри, <Link className="text-link" href="/guild/apply">подай заявку до гільдії</Link>. Знайомство й обговорення участі продовжимо в Discord.</p></div><aside className="panel"><h3>Твоя наступна пригода — з нами</h3><ul><li>Рейди World of Warcraft разом зі спільнотою.</li><li>Mythic+ і пошук компанії для ключів.</li><li>Українське спілкування та знайомство в Discord.</li></ul><Link className="text-link" href="/guides">Гайди WoW українською →</Link></aside></section>
  <GuildView initial={g.snapshot} professions={professions}/>
  <section className="section guild-faq" aria-labelledby="guild-questions"><span className="eyebrow">ПЕРЕД ВСТУПОМ</span><h2 id="guild-questions">Про гільдію та знайомство</h2>
   <details className="terms-section"><summary>Як вступити до української гільдії {g.name}?</summary><p>Заповни <Link className="text-link" href="/guild/apply">заявку на вступ</Link>: вкажи персонажа, реалм, зручний час і контакт у Discord. Збережи номер заявки, щоб перевіряти її статус. Офіцери розглянуть заявку та зв’яжуться з тобою.</p></details>
   <details className="terms-section"><summary>На якому сервері грає гільдія?</summary><p>{g.name} грає в європейському регіоні World of Warcraft{g.realm?` на реалмі ${g.realm}`:''}. Якщо твій персонаж на іншому реалмі, вкажи це в заявці й обговори можливості участі з офіцерами.</p></details>
   <details className="terms-section"><summary>Чим займається спільнота?</summary><p>Граємо разом у WoW: рейди, Mythic+ і спільні пригоди. Актуальні опубліковані рейди та доступний прогрес показані вище. Конкретний склад і час узгоджуємо в Discord.</p></details>
   <details className="terms-section"><summary>Де познайомитися перед поданням заявки?</summary><p>Приєднуйся до <a className="text-link" href={g.community.discord} target="_blank" rel="noopener noreferrer">Discord гільдії</a>. Там можна поставити запитання, розповісти про себе та дізнатися більше про спільну гру.</p></details>
  </section>
 </div>;
}
