import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
import HomeDashboardLiveSync from "@/components/HomeDashboardLiveSync";
import { getSessionUser, isAuthenticated } from "@/lib/auth";
import { absoluteDashboardUrl, buildPageMetadata, dashboardBaseUrl } from "@/lib/seo";
import {
  isRaidClosed,
  listRaids,
  raidActiveRosterSize,
  raidDifficultyLabel,
  raidTitle,
  type RaidItem,
} from "@/lib/raids";
import {
  listRaidPolls,
  pollVoteCounts,
  raidPollDifficultyLabel,
  raidPollSlotSummary,
  raidPollStatusLabel,
  raidPollUniqueDayRecommendations,
} from "@/lib/raidPolls";
import { RAID_POLL_DAYS, type RaidPollDay, type RaidPollItem } from "@/lib/raidPollShared";

export const metadata = buildPageMetadata({
  title: "Головна",
  description: "Гільдійний календар рейдів Mistblossom Vanguard, швидкий імпорт у Google Calendar та live-результати рейд-голосувань.",
  path: "/",
  keywords: ["календар рейдів", "WoW raid calendar", "рейд голосування", "Google Calendar"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RAID_TIME_ZONE = process.env.RAID_TIME_ZONE || process.env.NEXT_PUBLIC_RAID_TIME_ZONE || "Europe/Kyiv";
const MONTH_LABEL = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: RAID_TIME_ZONE });
const DATE_LABEL = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeZone: RAID_TIME_ZONE });
const DATE_TIME_LABEL = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short", timeZone: RAID_TIME_ZONE });

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

type CalendarDay = {
  date: Date;
  key: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  raids: RaidItem[];
};

function parseMonth(value?: string | null) {
  const now = new Date();
  const fallback = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return fallback;
  const [year, month] = value.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return fallback;
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthParam(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseRaidDate(raid: Pick<RaidItem, "date" | "time">) {
  const [year, month, day] = String(raid.date || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const [hour = 20, minute = 0] = String(raid.time || "20:00").split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number.isFinite(hour) ? hour : 20, Number.isFinite(minute) ? minute : 0));
}

function buildCalendarDays(month: Date, raids: RaidItem[]): CalendarDay[] {
  const raidMap = new Map<string, RaidItem[]>();
  for (const raid of raids) {
    if (!raid.date) continue;
    const list = raidMap.get(raid.date) || [];
    list.push(raid);
    raidMap.set(raid.date, list);
  }

  const firstDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const firstWeekday = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(firstDay.getUTCDate() - firstWeekday);
  const todayKey = dateKey(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const key = dateKey(date);
    const dayRaids = (raidMap.get(key) || []).slice().sort((a, b) => String(a.time).localeCompare(String(b.time)));
    return {
      date,
      key,
      dayNumber: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month.getUTCMonth(),
      isToday: key === todayKey,
      raids: dayRaids,
    };
  });
}

function formatDateTime(value?: string | number | null) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return DATE_TIME_LABEL.format(date);
}

function formatPollDays(days: RaidPollDay[]) {
  const dayMap = new Map(RAID_POLL_DAYS.map((day) => [day.value, day.label]));
  return days.length ? days.map((day) => dayMap.get(day) || day).join(" • ") : "Усі дні";
}

function eventStatusLabel(raid: RaidItem) {
  if (raid.status === "draft") return "Чернетка";
  if (isRaidClosed(raid)) return "Закрито";
  return "Опубліковано";
}

function upcomingRaidSort(a: RaidItem, b: RaidItem) {
  return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
}

function homeRevision(raids: RaidItem[], polls: RaidPollItem[]) {
  const raidPart = raids.map((raid) => `${raid.id}:${raid.status}:${raid.updatedAt || raid.closedAt || raid.publishedAt || ""}:${raid.signups.length}`).join("|");
  const pollPart = polls.map((poll) => `${poll.id}:${poll.status}:${poll.updatedAt || poll.closedAt || ""}:${poll.votes.length}`).join("|");
  return `${raidPart}::${pollPart}`;
}

function googleCalendarUrl() {
  const feedUrl = absoluteDashboardUrl("/api/calendar/raids.ics");
  const webcalUrl = feedUrl.replace(/^https:/i, "webcal:").replace(/^http:/i, "webcal:");
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ cid: webcalUrl }).toString()}`;
}

function RaidCalendarEvent({ raid }: { raid: RaidItem }) {
  const roster = raidActiveRosterSize(raid);
  return (
    <a className={`home-calendar-event home-calendar-event--${raid.difficulty} home-calendar-event--${raid.status}`} href={`/raids/${encodeURIComponent(raid.id)}`}>
      <strong>{raid.time}</strong>
      <span>{raid.title}</span>
      <em>{raidDifficultyLabel(raid.difficulty)} • {roster} запис.</em>
    </a>
  );
}

function PollResultCard({ poll, relatedPolls }: { poll: RaidPollItem; relatedPolls: RaidPollItem[] }) {
  const counts = pollVoteCounts(poll);
  const recommendations = raidPollUniqueDayRecommendations(poll, relatedPolls, 2);
  return (
    <article className={`home-poll-card home-poll-card--${poll.status}`}>
      <div className="home-poll-card__status">
        <span>{poll.status === "open" ? "Відкрите" : "Закрите"}</span>
        <strong>{raidPollStatusLabel(poll)}</strong>
      </div>
      <div className="home-poll-card__body">
        <header>
          <span className={`home-difficulty home-difficulty--${poll.difficulty}`}>{raidPollDifficultyLabel(poll.difficulty)}</span>
          <h3>{poll.title}</h3>
          <p>{formatPollDays(poll.days)}</p>
        </header>
        <dl className="home-poll-metrics">
          <div>
            <dt>Старт</dt>
            <dd>{formatDateTime(poll.createdAt)}</dd>
          </div>
          <div>
            <dt>{poll.status === "open" ? "Закриття" : "Завершено"}</dt>
            <dd>{poll.status === "open" ? formatDateTime(poll.closesAtMs) : formatDateTime(poll.closedAt || poll.closesAtMs)}</dd>
          </div>
          <div>
            <dt>Голосів</dt>
            <dd>{counts.total}</dd>
          </div>
        </dl>
        <div className="home-poll-slots">
          {recommendations.length ? recommendations.map((slot, index) => (
            <span key={`${poll.id}-${slot.day}-${slot.time}`}>
              <b>{index + 1}</b>{raidPollSlotSummary(slot)}
            </span>
          )) : <em>Недостатньо голосів для розрахунку рекомендованих слотів.</em>}
        </div>
      </div>
      <footer>
        <a className="btn subtle" href={`/polls/${encodeURIComponent(poll.id)}`}>Деталі</a>
        {poll.messageUrl ? <a className="btn subtle" href={poll.messageUrl} target="_blank" rel="noreferrer">Discord</a> : null}
      </footer>
    </article>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isAuthenticated())) {
    redirect("/login");
    throw new Error("Login required");
  }
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
    throw new Error("Login required");
  }

  const params = await searchParams;
  const selectedMonth = parseMonth(params.month);
  const [raids, polls] = await Promise.all([
    listRaids(160).catch(() => []),
    listRaidPolls(120).catch(() => []),
  ]);

  const visibleRaids = raids.filter((raid) => raid.status !== "draft");
  const monthDays = buildCalendarDays(selectedMonth, visibleRaids);
  const now = Date.now();
  const upcomingRaids = visibleRaids
    .filter((raid) => {
      const date = parseRaidDate(raid);
      return date ? date.getTime() >= now - 6 * 60 * 60 * 1000 : false;
    })
    .sort(upcomingRaidSort)
    .slice(0, 4);
  const openPolls = polls.filter((poll) => poll.status === "open");
  const publishedPolls = polls.filter((poll) => poll.channelId && poll.messageId);
  const spotlightPolls = [...openPolls, ...polls.filter((poll) => poll.status === "closed")].slice(0, 6);
  const currentMonthRaidCount = monthDays.filter((day) => day.inMonth).reduce((sum, day) => sum + day.raids.length, 0);
  const calendarFeedUrl = absoluteDashboardUrl("/api/calendar/raids.ics");

  return (
    <main className="container home-page">
      <section className="dashboard-shell content-shell home-shell" aria-label="Головна панель Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="home" />

        <header className="hero panel dashboard-hero home-hero">
          <div className="hero-copy dashboard-hero__copy guild-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Рейдовий центр</div>
            <div className="content-hero-status-row">
              <span className="content-mode-pill content-mode-pill--library">World of Warcraft</span>
              <span className="content-hero-path">Календар • Google Calendar • Live голосування</span>
            </div>
            <h1>Гільдійний календар</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Єдина стартова сторінка після входу: майбутні рейди, календар місяця, імпорт у Google Calendar і живі результати рейд-голосувань.</p>
            <div className="home-hero-actions">
              <a className="btn primary" href="/raids">Відкрити рейди</a>
              <a className="btn subtle" href="/polls">Голосування</a>
            </div>
          </div>
          <HeroSidePanel
            ariaLabel="Огляд рейдового календаря"
            summary={[
              { label: "РЕЙДИ", value: `${visibleRaids.length} подій`, note: "Опубліковані та закриті рейди" },
              { label: "ГОЛОСУВАННЯ", value: `${openPolls.length} live`, note: "Автооновлення без перезавантаження" },
            ]}
            stats={[
              { label: "МІСЯЦЬ", value: currentMonthRaidCount.toLocaleString("uk-UA") },
              { label: "ІМПОРТ", value: "ICS" },
              { label: "SYNC", value: "LIVE" },
            ]}
          />
        </header>

        <HomeDashboardLiveSync initialRevision={homeRevision(visibleRaids, polls)} />

        <section className="home-calendar-toolbar panel" aria-label="Керування календарем">
          <div>
            <span className="home-kicker">Онлайн календар</span>
            <h2>{MONTH_LABEL.format(selectedMonth)}</h2>
            <p>Календар побудований з опублікованих рейдів. Закриті рейди лишаються в історії місяця.</p>
          </div>
          <div className="home-calendar-actions">
            <a className="btn subtle" href={`/?month=${monthParam(new Date())}`}>Сьогодні</a>
            <a className="btn subtle home-calendar-nav" href={`/?month=${monthParam(addMonths(selectedMonth, -1))}`} aria-label="Попередній місяць">‹</a>
            <a className="btn subtle home-calendar-nav" href={`/?month=${monthParam(addMonths(selectedMonth, 1))}`} aria-label="Наступний місяць">›</a>
          </div>
        </section>

        <section className="home-layout">
          <section className="panel home-calendar-panel" aria-label="Календар рейдів">
            <div className="home-calendar-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="home-calendar-grid">
              {monthDays.map((day) => (
                <article className={`home-calendar-day${day.inMonth ? "" : " is-muted"}${day.isToday ? " is-today" : ""}`} key={day.key}>
                  <header>
                    <time dateTime={day.key}>{day.dayNumber}</time>
                    {day.isToday ? <span>сьогодні</span> : null}
                  </header>
                  <div className="home-calendar-events">
                    {day.raids.length ? day.raids.slice(0, 3).map((raid) => <RaidCalendarEvent key={raid.id} raid={raid} />) : null}
                    {day.raids.length > 3 ? <a className="home-calendar-more" href={`/raids?date=${encodeURIComponent(day.key)}`}>+{day.raids.length - 3} ще</a> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="home-side-stack">
            <section className="panel home-import-card" aria-label="Імпорт календаря">
              <span className="home-kicker">Google Calendar</span>
              <h2>Імпорт рейдів</h2>
              <p>Додай рейдовий календар у Google Calendar або завантаж `.ics` файл для ручного імпорту.</p>
              <div className="home-import-actions">
                <a className="btn primary" href={googleCalendarUrl()} target="_blank" rel="noreferrer">Додати в Google</a>
                <a className="btn subtle" href="/api/calendar/raids.ics" download="mistblossom-raids.ics">Завантажити .ics</a>
              </div>
              <code>{calendarFeedUrl}</code>
            </section>

            <section className="panel home-upcoming-card" aria-label="Найближчі рейди">
              <span className="home-kicker">Найближче</span>
              <h2>Рейди</h2>
              <div className="home-upcoming-list">
                {upcomingRaids.length ? upcomingRaids.map((raid) => {
                  const raidDate = parseRaidDate(raid);
                  return (
                    <a className={`home-upcoming-item home-upcoming-item--${raid.difficulty}`} href={`/raids/${encodeURIComponent(raid.id)}`} key={raid.id}>
                      <span>{raidDate ? DATE_LABEL.format(raidDate) : raid.date}</span>
                      <strong>{raidTitle(raid)}</strong>
                      <em>{raid.time} • {eventStatusLabel(raid)} • {raidActiveRosterSize(raid)} запис.</em>
                    </a>
                  );
                }) : <p className="home-empty-text">Найближчих рейдів поки немає.</p>}
              </div>
            </section>
          </aside>
        </section>

        <section className="panel home-polls-section" aria-label="Живі результати голосувань">
          <div className="home-section-head">
            <div>
              <span className="home-kicker">Live raid polls</span>
              <h2>Динамічні результати голосувань</h2>
              <p>Показуємо назву, дати, статус, кількість голосів і рекомендовані слоти з моменту створення голосування. Сторінка сама підтягує оновлення.</p>
            </div>
            <a className="btn subtle" href="/polls">Усі голосування</a>
          </div>
          <div className="home-polls-grid">
            {spotlightPolls.length ? spotlightPolls.map((poll) => <PollResultCard key={poll.id} poll={poll} relatedPolls={publishedPolls} />) : <p className="home-empty-text">Голосувань ще немає.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
