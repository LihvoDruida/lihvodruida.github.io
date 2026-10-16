'use client';
import { useMemo, useState } from 'react';
import { safeUrl, type Guild } from '@/lib/contracts';
import { raidSeasonView } from '@/lib/raid-season-view';
const names = { normal: 'Звичайний', heroic: 'Героїчний', mythic: 'Міфічний' } as const;
export function GuildRaidProgress({ guild }: {
    guild: Guild;
}) {
    const [season, setSeason] = useState('');
    const view = useMemo(() => raidSeasonView(guild, season), [guild, season]), history = guild.metadata.raid_history;
    const date = (value?: string | null) => { const n = Date.parse(value || ''); return Number.isFinite(n) ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeZone: 'Europe/Kyiv' }).format(n) : null; };
    return <section className="section" aria-label="Рейдовий прогрес за сезонами"><div className="section-heading"><div><span className="eyebrow">РЕЙДОВИЙ ПРОГРЕС</span><h2>Крок за кроком, бос за босом</h2></div>{view.groups.length > 0 && <label className="compact-label">Сезон<select aria-label="Сезон" value={view.selected?.id || ''} onChange={event => setSeason(event.target.value)}>{view.groups.map(([label, seasons]) => <optgroup label={label} key={label}>{seasons.map(item => <option key={item.id} value={item.id}>{item.label}{item.id === guild.raid_seasons?.current_season_id ? ' · актуальний' : ''}</option>)}</optgroup>)}</select></label>}</div>
 {(view.pending > 0 || history?.state === 'partial' || history?.state === 'pending' || guild.raid_seasons?.partial) && <p className="notice" role="status">Історія рейдів оновлюється у фоні. {view.pending > 0 ? `Неперевірених рейдів у цьому сезоні: ${view.pending}.` : 'Частина історичних даних ще перевіряється.'} Відсутні дані позначено рискою.</p>}
 <div className="raid-grid">{view.cards.map(({ slug, name, total, progress, ranking }) => <article className="raid-card" key={slug} data-raid={slug}><span className="eyebrow">{view.selected?.label || 'РЕЙД'}</span><h3>{name}</h3>{(Object.keys(names) as Array<keyof typeof names>).map(difficulty => {
                const count = progress?.[`${difficulty}_bosses_killed`];
                return <div className={`progress-row ${difficulty}`} key={difficulty}><div><span>{names[difficulty]}</span><strong>{count === undefined ? '—' : count}/{total || '—'}</strong></div>{count !== undefined && <progress value={count} max={Math.max(1, total)} aria-label={`${names[difficulty]}: ${count} з ${total}`}/>}</div>;
            })}{!progress && <small className="muted">Дані цього рейду ще не отримано або API тимчасово недоступний.</small>}{progress?.stale && <small className="muted">Збережені дані{date(progress.updated_at) ? ` від ${date(progress.updated_at)}` : ''}; повторну перевірку заплановано.</small>}{progress && !progress.stale && date(progress.updated_at) && <small className="muted">Перевірено: {date(progress.updated_at)}</small>}{(ranking?.mythic?.world || 0) > 0 && <small className="muted">Міфічний: #{ranking?.mythic?.world} у світі{ranking?.mythic?.realm ? ` · #${ranking.mythic.realm} на реалмі` : ''}</small>}</article>)}</div>
 {!view.cards.length && <div className="empty-state">Перелік рейдів цього сезону ще не підтверджено. Історія перевіряється плановою синхронізацією.</div>}
 <p className="muted"><a href={safeUrl(guild.guild.profile_url, 'https://raider.io')} target="_blank" rel="noopener noreferrer">Джерело прогресу: Raider.IO ↗</a> · Дані гільдії для рейду; це не сума персональних досягнень і не знімок на дату закриття сезону.</p></section>;
}
