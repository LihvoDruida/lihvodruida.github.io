import type { ReactNode } from "react";
import RaidPollCreateClientForm from "@/components/RaidPollCreateClientForm";
import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
import type { DashboardSession } from "@/lib/auth";
import { hierarchyTitle } from "@/lib/permissions";
import {
  RAID_POLL_DAYS,
  RAID_POLL_TIMES,
  pollVoteCounts,
  pollVotersForDay,
  raidPollDayFullLabel,
  raidPollDifficultyLabel,
  raidPollStatusLabel,
  raidPollTitle,
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

export function RaidPollResults({ poll, canManage = false }: { poll: RaidPollItem; canManage?: boolean }) {
  const counts = pollVoteCounts(poll);
  return (
    <section className="panel raid-poll-results">
      <div className="raid-form-section-head">
        <div>
          <h2>{raidPollTitle(poll)}</h2>
          <p>{poll.description}</p>
        </div>
        <span className={`raid-status-pill ${statusClass(poll)}`}>{raidPollStatusLabel(poll)}</span>
      </div>

      <div className="raid-poll-summary-grid">
        <div><strong>{counts.total}</strong><span>Проголосували</span></div>
        <div><strong>{formatDateTime(poll.closesAtMs)}</strong><span>Закриття</span></div>
        <div><strong>{raidPollDifficultyLabel(poll.difficulty)}</strong><span>Складність</span></div>
      </div>

      <div className="raid-poll-results-grid">
        <div className="raid-poll-table-card">
          <h3>Результат за днями</h3>
          <table className="raid-poll-table">
            <thead><tr><th>День</th><th>Голоси</th><th>Нікнейми</th></tr></thead>
            <tbody>
              {RAID_POLL_DAYS.map((day) => {
                const voters = pollVotersForDay(poll, day.value);
                return (
                  <tr key={day.value}>
                    <td>{raidPollDayFullLabel(day.value)}</td>
                    <td><strong>{counts.days[day.value]}</strong></td>
                    <td>{voters.length ? voters.map((vote) => vote.discordName).join(", ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="raid-poll-table-card">
          <h3>Результат за часом</h3>
          <table className="raid-poll-table">
            <thead><tr><th>Час</th><th>Голоси</th></tr></thead>
            <tbody>
              {RAID_POLL_TIMES.map((time) => <tr key={time}><td>{time}</td><td><strong>{counts.times[time]}</strong></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="raid-poll-voters">
        <h3>Усі голоси</h3>
        {poll.votes.length ? poll.votes.map((vote) => (
          <div className="raid-poll-voter" key={vote.discordId}>
            <strong>{vote.discordName}</strong>
            <span>{vote.selectedDays.length ? vote.selectedDays.map(raidPollDayFullLabel).join(", ") : "Дні не вибрано"}</span>
            <span>{vote.selectedTime || "Час не вибрано"}</span>
            <small>{vote.guildName} • {formatDateTime(vote.updatedAt)}</small>
          </div>
        )) : <p className="raid-empty">Голосів поки немає.</p>}
      </div>

      <div className="raid-form-actions">
        <a className="btn subtle" href="/polls">До списку пулів</a>
        {poll.messageUrl ? <a className="btn subtle" href={poll.messageUrl} target="_blank" rel="noreferrer">Відкрити Discord</a> : null}
        {canManage && poll.status === "open" ? (
          <form action={`/api/polls/${encodeURIComponent(poll.id)}/close`} method="post" data-confirm-message="Закрити рейд-пул зараз?">
            <button className="btn danger" type="submit">Закрити голосування</button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
