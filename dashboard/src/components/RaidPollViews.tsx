import type { CSSProperties, ReactNode } from "react";
import RaidPollCreateClientForm from "@/components/RaidPollCreateClientForm";
import RaidPollDeleteButton from "@/components/RaidPollDeleteButton";
import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
import type { DashboardSession } from "@/lib/auth";
import { hierarchyTitle } from "@/lib/permissions";
import {
  RAID_POLL_DAYS,
  RAID_POLL_TIMES,
  pollAbsentVotersForDay,
  pollVoteCounts,
  pollVotersForDay,
  raidPollAvailabilityLabel,
  raidPollClassColor,
  raidPollDayFullLabel,
  raidPollDifficultyLabel,
  raidPollRoleLabel,
  raidPollStatusLabel,
  raidPollTitle,
  raidPollVoteSchedule,
  type RaidPollDay,
  type RaidPollItem,
} from "@/lib/raidPolls";

export type PollChannelOption = { id: string; name: string };

function formatDateTime(isoOrMs: string | number | null | undefined) {
  if (!isoOrMs) return "—";
  const date = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (!Number.isFinite(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: process.env.RAID_TIME_ZONE || process.env.NEXT_PUBLIC_RAID_TIME_ZONE || "Europe/Kyiv",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

function statusClass(poll: RaidPollItem) {
  return poll.status === "closed" ? "closed" : "published";
}

export function RaidPollPageShell({ user, title, description, children }: { user?: DashboardSession | null; title: string; description: string; children: ReactNode }) {
  return (
    <main className="container raid-page raid-poll-page">
      <section className="dashboard-shell content-shell raid-shell" aria-label="Панель рейд-пулів Mistblossom Vanguard">
        {user ? <DashboardIdentity user={user} activeSection="raids" /> : null}
        <header className="hero panel dashboard-hero raid-dashboard-hero">
          <div className="hero-copy dashboard-hero__copy guild-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Рейд-пули</div>
            <div className="content-hero-status-row">
              <span className="content-mode-pill content-mode-pill--library">{user ? hierarchyTitle(user.role) : "Учасник"}</span>
              <span className="content-hero-path">Discord голосування • Firebase sync • сайт-результати</span>
            </div>
            <h1>{title}</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">{description}</p>
          </div>
          <HeroSidePanel
            ariaLabel="Огляд рейд-пулів"
            summary={[
              { label: "ДЖЕРЕЛО", value: "Сайт", note: "Створення тільки через dashboard" },
              { label: "DISCORD", value: "Vote UI", note: "Бот лише публікує та приймає голоси" },
            ]}
            stats={[
              { label: "DAYS", value: "7" },
              { label: "TIME", value: "19-21" },
              { label: "LIVE", value: "SYNC" },
            ]}
          />
        </header>
        {children}
      </section>
    </main>
  );
}

export function RaidPollCreateForm({ channels, discordEnabled }: { channels: PollChannelOption[]; discordEnabled: boolean }) {
  return <RaidPollCreateClientForm channels={channels} defaultChannelId={channels[0]?.id || ""} disabled={!discordEnabled} />;
}

export function RaidPollListCard({ poll, canManage = false }: { poll: RaidPollItem; canManage?: boolean }) {
  const counts = pollVoteCounts(poll);
  return (
    <article className="raid-list-card raid-poll-card">
      <div className="raid-list-card-main">
        <div className="raid-list-card-topline">
          <span className={`raid-status-pill ${statusClass(poll)}`}>{raidPollStatusLabel(poll)}</span>
          <span>{raidPollDifficultyLabel(poll.difficulty)}</span>
        </div>
        <h3><a href={`/polls/${encodeURIComponent(poll.id)}`}>{poll.title}</a></h3>
        <p>{poll.description}</p>
        <div className="raid-list-card-meta">
          <span>Закриття: {formatDateTime(poll.closesAtMs)}</span>
          <span>Голосів: {counts.total}</span>
          <span>ID: {poll.id}</span>
        </div>
      </div>
      <div className="raid-list-card-actions">
        <a className="btn subtle" href={`/polls/${encodeURIComponent(poll.id)}`}>Деталі</a>
        {poll.messageUrl ? <a className="btn subtle" href={poll.messageUrl} target="_blank" rel="noreferrer">Discord</a> : null}
        {canManage && poll.status === "open" ? (
          <form action={`/api/polls/${encodeURIComponent(poll.id)}/close`} method="post" data-confirm-message="Закрити рейд-пул зараз?">
            <button className="btn danger" type="submit">Закрити</button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function pollDays(poll: RaidPollItem) {
  const active = poll.days?.length ? poll.days : RAID_POLL_DAYS.map((day) => day.value);
  return RAID_POLL_DAYS.filter((day) => active.includes(day.value));
}

function bestTimeForDay(poll: RaidPollItem, day: RaidPollDay) {
  const counts = pollVoteCounts(poll).dayTimes[day];
  const best = RAID_POLL_TIMES
    .map((time) => ({ time, count: counts[time] || 0 }))
    .sort((a, b) => b.count - a.count || RAID_POLL_TIMES.indexOf(a.time) - RAID_POLL_TIMES.indexOf(b.time))[0];
  return best && best.count > 0 ? `${best.time} · ${best.count}` : "—";
}

function voteDisplayName(vote: RaidPollItem["votes"][number]) {
  return vote.characterName || vote.discordName || "Гравець";
}

function VoteCharacterBadge({ vote }: { vote: RaidPollItem["votes"][number] }) {
  const classColor = raidPollClassColor(vote.characterClass);
  const style = { "--raid-poll-class-color": classColor } as CSSProperties;
  return (
    <span className="raid-poll-character-badge" style={style}>
      <strong>{voteDisplayName(vote)}</strong>
      <small>{[vote.characterClass, vote.characterRole ? raidPollRoleLabel(vote.characterRole) : null].filter(Boolean).join(" • ") || vote.discordName}</small>
    </span>
  );
}

export function RaidPollResults({ poll, canManage = false }: { poll: RaidPollItem; canManage?: boolean }) {
  const counts = pollVoteCounts(poll);
  const activeDays = pollDays(poll);
  return (
    <section className="panel raid-poll-results raid-poll-results--smart">
      <div className="raid-form-section-head raid-poll-detail-head">
        <div>
          <h2>{raidPollTitle(poll)}</h2>
          <p>{poll.description}</p>
        </div>
        <span className={`raid-status-pill ${statusClass(poll)}`}>{raidPollStatusLabel(poll)}</span>
      </div>

      <div className="raid-poll-summary-grid raid-poll-summary-grid--smart">
        <div><strong>{counts.total}</strong><span>Проголосували</span></div>
        <div><strong>{formatDateTime(poll.closesAtMs)}</strong><span>Закриття</span></div>
        <div><strong>{raidPollDifficultyLabel(poll.difficulty)}</strong><span>Складність</span></div>
        <div><strong>{activeDays.map((day) => day.label).join(" • ")}</strong><span>Дні пулу</span></div>
      </div>

      <div className="raid-poll-smart-layout">
        <div className="raid-poll-table-card raid-poll-table-card--wide">
          <div className="raid-poll-card-headline">
            <h3>Розумна матриця день / час</h3>
            <p>Для кожного дня видно доступних, тих хто поставив «Не можу», найсильніший час і конкретних персонажів.</p>
          </div>
          <div className="raid-poll-day-matrix">
            {activeDays.map((day) => {
              const available = pollVotersForDay(poll, day.value);
              const absent = pollAbsentVotersForDay(poll, day.value);
              return (
                <article className="raid-poll-day-card" key={day.value}>
                  <header>
                    <span>{day.emoji}</span>
                    <div>
                      <strong>{raidPollDayFullLabel(day.value)}</strong>
                      <small>Найкращий час: {bestTimeForDay(poll, day.value)}</small>
                    </div>
                  </header>
                  <div className="raid-poll-day-stats">
                    <span><strong>{counts.days[day.value]}</strong> можуть</span>
                    <span><strong>{counts.absent[day.value]}</strong> не можуть</span>
                  </div>
                  <div className="raid-poll-time-row" aria-label={`Голоси за часом для ${day.fullLabel}`}>
                    {RAID_POLL_TIMES.map((time) => (
                      <span key={time} className={counts.dayTimes[day.value][time] ? "has-votes" : ""}>{time}<b>{counts.dayTimes[day.value][time]}</b></span>
                    ))}
                  </div>
                  <div className="raid-poll-day-voters">
                    {available.length ? available.map((vote) => {
                      const schedule = raidPollVoteSchedule(vote);
                      return <span key={vote.discordId}>{voteDisplayName(vote)} <b>{raidPollAvailabilityLabel(schedule[day.value])}</b></span>;
                    }) : <em>Доступних поки немає</em>}
                  </div>
                  {absent.length ? (
                    <div className="raid-poll-day-absent">
                      <strong>Не можуть:</strong> {absent.map(voteDisplayName).join(", ")}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="raid-poll-table-card raid-poll-discord-sync-card">
          <div className="raid-poll-card-headline">
            <h3>Discord sync</h3>
            <p>Публічний embed оновлюється після кожного interaction. Сайт оновлює RSC-дані у фоні без повного перезавантаження вкладки.</p>
          </div>
          <div className="raid-poll-sync-metrics">
            <span><strong>{poll.messageId ? "ON" : "—"}</strong>Message</span>
            <span><strong>{poll.updatedAt ? formatDateTime(poll.updatedAt) : "—"}</strong>Оновлено</span>
          </div>
          {poll.messageUrl ? <a className="btn subtle" href={poll.messageUrl} target="_blank" rel="noreferrer">Відкрити Discord</a> : null}
        </aside>
      </div>

      <div className="raid-poll-voters raid-poll-voters--cards">
        <h3>Усі голоси</h3>
        {poll.votes.length ? poll.votes.map((vote) => {
          const schedule = raidPollVoteSchedule(vote);
          return (
            <div className="raid-poll-voter raid-poll-voter--smart" key={vote.discordId}>
              <VoteCharacterBadge vote={vote} />
              <div className="raid-poll-vote-schedule">
                {activeDays.map((day) => (
                  <span key={day.value} className={schedule[day.value] === "absent" ? "is-absent" : schedule[day.value] ? "is-ready" : ""}>
                    <strong>{day.label}</strong>
                    {raidPollAvailabilityLabel(schedule[day.value])}
                  </span>
                ))}
              </div>
              <small>{vote.guildName} • Discord: {vote.discordName} • {formatDateTime(vote.updatedAt)}</small>
            </div>
          );
        }) : <p className="raid-empty">Голосів поки немає.</p>}
      </div>

      <div className="raid-form-actions">
        <a className="btn subtle" href="/polls">До списку пулів</a>
        {poll.messageUrl ? <a className="btn subtle" href={poll.messageUrl} target="_blank" rel="noreferrer">Відкрити Discord</a> : null}
        {canManage && poll.status === "open" ? (
          <form action={`/api/polls/${encodeURIComponent(poll.id)}/close`} method="post" data-confirm-message="Закрити рейд-пул зараз?">
            <button className="btn danger" type="submit">Закрити голосування</button>
          </form>
        ) : null}
        {canManage ? <RaidPollDeleteButton pollId={poll.id} pollTitle={poll.title} /> : null}
      </div>
    </section>
  );
}
