import DashboardIdentity from "@/components/DashboardIdentity";
import WarcraftLogsBossGraphs from "@/components/WarcraftLogsBossGraphs";
import { getSession, type DashboardSession } from "@/lib/auth";
import { canViewProfile, getProfileById, getProfilePublicName, type DashboardProfile, type ProfileCharacter } from "@/lib/profiles";
import { buildPageMetadata } from "@/lib/seo";
import {
  buildCharacterPerformanceEcosystem,
  type CharacterPerformanceEcosystem,
  type CharacterPerformanceRoleSummary,
} from "@/lib/characterPerformance";
import { normalizeCharacterKey, pickWowAvatarImageUrl } from "@/lib/wowCharacters";
import { wowRoleLabel } from "@/lib/wowRoles";
import {
  buildRaiderIoCharacterDetails,
  fetchRaiderIoCharacterProfile,
  RAIDERIO_CHARACTER_DETAIL_FIELDS,
  type RaiderIoCharacterDetails,
  type RaiderIoDungeonRun,
  type RaiderIoRaidProgress,
  type RaiderIoScoreSegmentKey,
} from "@/lib/raiderIo";
import { fetchWarcraftLogsCharacterSummary, type WarcraftLogsCharacterSummary, type WarcraftLogsEncounterRanking } from "@/lib/warcraftLogs";
import { dateMillis, formatStableNumber, formatStableUkCompactDate } from "@/lib/stableUiText";
import { notFound, redirect } from "next/navigation";

export const metadata = buildPageMetadata({
  title: "Статистика персонажа",
  description: "Окрема сторінка персонажа з Raider.IO, Mythic+ та Warcraft Logs.",
  path: "/profile",
  keywords: ["персонаж", "Raider.IO", "Warcraft Logs", "Mythic+", "профіль"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeDecodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function characterArtworkUrl(character: Pick<ProfileCharacter, "renderUrl" | "avatarUrl" | "mediaUrl">) {
  return character.renderUrl || pickWowAvatarImageUrl(character.avatarUrl, character.mediaUrl);
}

function characterAvatarUrl(character?: Pick<ProfileCharacter, "renderUrl" | "avatarUrl" | "mediaUrl"> | null) {
  if (!character) return null;
  return pickWowAvatarImageUrl(character.avatarUrl, character.renderUrl, character.mediaUrl);
}

function roundNumber(value: number | null | undefined, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return formatStableNumber(value, digits);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${formatStableNumber(value, value % 1 ? 1 : 0)}%`;
}

function formatRunLevel(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `+${Math.round(value)}` : "—";
}

function formatRunUpgrades(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value <= 0) return "В таймер";
  return `+${Math.round(value)} chest`;
}

function formatMetricAmount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return formatStableNumber(value / 1000, value >= 100_000 ? 0 : 1) + "k";
  return formatStableNumber(value, 0);
}

function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  const seconds = Math.round(value > 10_000 ? value / 1000 : value);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function newestDate(...values: Array<string | null | undefined>) {
  const timestamps = values.map(dateMillis).filter((value): value is number => typeof value === "number");
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function roleScoreLabel(key: RaiderIoScoreSegmentKey) {
  if (key === "all") return "Загальний";
  if (key === "healer") return "Хіл";
  if (key === "tank") return "Танк";
  return "DPS";
}

function accessBadge(character: ProfileCharacter) {
  if (character.isMain) return "Мейн";
  if (character.verifiedGuild) return "Гільдійний";
  return "Інший";
}

function externalSnapshotDate(character: ProfileCharacter, rio: RaiderIoCharacterDetails, wcl: WarcraftLogsCharacterSummary) {
  return newestDate(character.lastSeenAt, character.raiderIo?.updatedAt, rio.snapshot?.updatedAt, wcl.updatedAt);
}

function CharacterHero({ profile, character, viewer }: { profile: DashboardProfile; character: ProfileCharacter; viewer: DashboardSession }) {
  const publicName = getProfilePublicName(profile);
  const artwork = characterArtworkUrl(character);
  const avatar = characterAvatarUrl(character);
  const realmLabel = character.realmName || character.realmSlug || "Реалм —";
  const classLabel = [character.activeSpecName, character.className].filter(Boolean).join(" • ") || "Клас невідомий";

  return (
    <header className="profile-character-detail-hero">
      <div className="profile-character-detail-hero__visual" aria-hidden="true">
        {artwork ? <img src={artwork} alt="" loading="eager" referrerPolicy="no-referrer" /> : <span>{character.name.charAt(0)}</span>}
      </div>
      <div className="profile-character-detail-hero__body">
        <div className="profile-character-detail-hero__crumbs">
          <a href={`/profile/${encodeURIComponent(profile.profileId)}`}>Профіль</a>
          <span aria-hidden="true">/</span>
          <span>{character.name}</span>
        </div>
        <div className="profile-character-detail-hero__title-row">
          {avatar ? <img className="profile-character-detail-hero__avatar" src={avatar} alt="" width={64} height={64} loading="lazy" referrerPolicy="no-referrer" /> : null}
          <div>
            <span className="eyebrow">{publicName} • {accessBadge(character)}</span>
            <h1>{character.name}</h1>
            <p>{realmLabel} • {classLabel} • {wowRoleLabel(character.activeSpecRole)}</p>
          </div>
        </div>
        <div className="profile-character-detail-hero__actions">
          <a className="btn btn-ghost btn-sm" href={`/profile/${encodeURIComponent(profile.profileId)}`}>Назад до профілю</a>
          {viewer.profileId === profile.profileId ? <a className="btn btn-ghost btn-sm" href={`/profile/${encodeURIComponent(profile.profileId)}/settings`}>Налаштування</a> : null}
          {character.profileUrl && character.profileUrl !== "#" ? <a className="btn btn-ghost btn-sm" href={character.profileUrl} target="_blank" rel="noreferrer">Battle.net</a> : null}
        </div>
      </div>
    </header>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="profile-character-stat-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

function RaiderIoOverview({ details, stored }: { details: RaiderIoCharacterDetails; stored: ProfileCharacter["raiderIo"] }) {
  const snapshot = details.snapshot || stored || null;
  const scoreKeys: RaiderIoScoreSegmentKey[] = ["all", "healer", "dps", "tank"];

  return (
    <article className="panel profile-card profile-character-detail-panel profile-character-detail-panel--rio">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">Raider.IO</span>
          <h2>Mythic+ рейтинг</h2>
        </div>
        {snapshot?.profileUrl ? <a className="btn btn-ghost btn-sm" href={snapshot.profileUrl} target="_blank" rel="noreferrer">Відкрити RIO</a> : null}
      </div>

      <div className="profile-character-role-scores">
        {scoreKeys.map((key) => {
          const segment = snapshot?.currentScores?.[key] || null;
          return <StatCard key={key} label={roleScoreLabel(key)} value={roundNumber(segment?.score)} hint={key === "all" ? "Поточний сезон" : "Рольовий score"} />;
        })}
      </div>
    </article>
  );
}

function DungeonRunRow({ run }: { run: RaiderIoDungeonRun }) {
  const body = (
    <>
      <span className="profile-character-run__level">{formatRunLevel(run.level)}</span>
      <span className="profile-character-run__name"><strong>{run.dungeon}</strong><small>{[run.shortName, formatStableUkCompactDate(run.completedAt)].filter(Boolean).join(" • ")}</small></span>
      <span className="profile-character-run__score"><strong>{roundNumber(run.score)}</strong><small>{formatRunUpgrades(run.upgrades)}</small></span>
    </>
  );

  if (run.url) {
    return <a className="profile-character-run" href={run.url} target="_blank" rel="noreferrer">{body}</a>;
  }
  return <div className="profile-character-run">{body}</div>;
}

function DungeonRunsPanel({ title, eyebrow, runs, emptyText }: { title: string; eyebrow: string; runs: RaiderIoDungeonRun[]; emptyText: string }) {
  return (
    <article className="panel profile-card profile-character-detail-panel">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <span className="profile-count-pill">{runs.length}</span>
      </div>
      {runs.length ? <div className="profile-character-run-list">{runs.map((run, index) => <DungeonRunRow key={`${run.dungeon}-${run.level}-${run.completedAt || index}`} run={run} />)}</div> : <EmptyBlock title="Даних поки немає" text={emptyText} />}
    </article>
  );
}

function RaidProgressRow({ raid }: { raid: RaiderIoRaidProgress }) {
  const total = raid.totalBosses || "—";
  return (
    <div className="profile-character-raid-progress">
      <span><strong>{raid.name}</strong><small>{raid.summary || "Прогрес не вказано"}</small></span>
      <span><strong>{raid.normalKills ?? "—"}/{total}</strong><small>Normal</small></span>
      <span><strong>{raid.heroicKills ?? "—"}/{total}</strong><small>Heroic</small></span>
      <span><strong>{raid.mythicKills ?? "—"}/{total}</strong><small>Mythic</small></span>
    </div>
  );
}

function RaidProgressPanel({ raids }: { raids: RaiderIoRaidProgress[] }) {
  return (
    <article className="panel profile-card profile-character-detail-panel">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">Raider.IO</span>
          <h2>Рейдовий прогрес</h2>
        </div>
        <span className="profile-count-pill">{raids.length}</span>
      </div>
      {raids.length ? <div className="profile-character-raid-list">{raids.map((raid) => <RaidProgressRow key={raid.slug} raid={raid} />)}</div> : <EmptyBlock title="Рейдовий прогрес не знайдено" text="Raider.IO поки не має актуального рейдового прогресу для цього персонажа." />}
    </article>
  );
}

function WarcraftLogsStatus({ summary }: { summary: WarcraftLogsCharacterSummary }) {
  if (summary.status === "ready") return null;

  const message = summary.status === "not_configured"
    ? "Warcraft Logs ще не підключений. Додай ключі в панелі керування."
    : summary.status === "not_found"
      ? "Warcraft Logs не знайшов персонажа. Перевір реалм, імʼя або наявність публічних логів."
      : summary.error || "Warcraft Logs тимчасово не відповів.";

  return <div className="profile-character-service-note" role="status">{message}</div>;
}

function EncounterRankingRow({ ranking }: { ranking: WarcraftLogsEncounterRanking }) {
  return (
    <div className="profile-character-log-ranking">
      <span><strong>{ranking.encounterName}</strong><small>{[ranking.spec, ranking.metric?.toUpperCase(), ranking.startTime ? formatStableUkCompactDate(ranking.startTime) : null].filter(Boolean).join(" • ")}</small></span>
      <span><strong>{formatPercent(ranking.percentile)}</strong><small>Parse</small></span>
      <span><strong>{formatMetricAmount(ranking.bestAmount)}</strong><small>{ranking.metric?.toUpperCase() || "Best"}</small></span>
      <span><strong>{ranking.totalKills ?? "—"}</strong><small>{ranking.fastestKillMs ? `Fast ${formatDuration(ranking.fastestKillMs)}` : "Kills"}</small></span>
    </div>
  );
}

function WarcraftLogsPanel({ summary }: { summary: WarcraftLogsCharacterSummary }) {
  return (
    <article className="panel profile-card profile-character-detail-panel profile-character-detail-panel--wcl">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">Warcraft Logs</span>
          <h2>Рейдові логи</h2>
        </div>
        <a className="btn btn-ghost btn-sm" href={summary.profileUrl} target="_blank" rel="noreferrer">Відкрити WCL</a>
      </div>

      <WarcraftLogsStatus summary={summary} />

      <div className="profile-character-role-scores profile-character-role-scores--three">
        <StatCard label="Найкращий середній parse" value={formatPercent(summary.bestPerformanceAverage)} hint="За рейдовими босами" />
        <StatCard label="Медіана parse" value={formatPercent(summary.medianPerformanceAverage)} hint="Стабільний рівень" />
        <StatCard label="All Stars" value={roundNumber(summary.allStarsPoints)} hint={summary.allStarsRank ? `Місце ${formatStableNumber(summary.allStarsRank)}` : "Публічний рейтинг"} />
      </div>

      <WarcraftLogsBossGraphs summary={summary} />

      {summary.encounterRankings.length ? (
        <div className="profile-character-log-list profile-character-log-list--rankings">
          {summary.encounterRankings.map((ranking, index) => <EncounterRankingRow key={`${ranking.encounterName}-${ranking.metric || "metric"}-${index}`} ranking={ranking} />)}
        </div>
      ) : (
        <EmptyBlock title="Рейдові боси не знайдені" text="Щойно зʼявляться публічні рейдові логи, тут будуть боси, parse %, HPS/DPS та останні пули." />
      )}
    </article>
  );
}


function ecosystemToneClass(tone: CharacterPerformanceEcosystem["signals"][number]["tone"]) {
  if (tone === "good") return "profile-performance-signal--good";
  if (tone === "warn") return "profile-performance-signal--warn";
  return "profile-performance-signal--neutral";
}

function PerformanceRoleRow({ role }: { role: CharacterPerformanceRoleSummary }) {
  return (
    <div className="profile-performance-role-row">
      <span><strong>{role.title}</strong><small>{role.bosses} босів • {role.pulls} пулів</small></span>
      <span><strong>{formatPercent(role.bestAverage)}</strong><small>Кращий середній</small></span>
      <span><strong>{formatMetricAmount(role.maxAmount)}</strong><small>Макс. {role.metric}</small></span>
      <span><strong>{formatMetricAmount(role.averageAmount)}</strong><small>Середнє≤10</small></span>
      <span><strong>{formatPercent(role.consistencyScore)}</strong><small>Стабільність</small></span>
    </div>
  );
}

function CharacterPerformancePanel({ ecosystem }: { ecosystem: CharacterPerformanceEcosystem }) {
  return (
    <article className="panel profile-card profile-character-detail-panel profile-performance-panel">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">Ефективність</span>
          <h2>Raider.IO × Warcraft Logs</h2>
          <p>Зведена оцінка персонажа з рейдових логів, Mythic+ і нашого розрахунку HPS/DPS.</p>
        </div>
        <span className="profile-count-pill">Довіра {roundNumber(ecosystem.dataConfidence)}%</span>
      </div>

      <div className="profile-performance-signals">
        {ecosystem.signals.map((item) => (
          <div key={item.key} className={`profile-performance-signal ${ecosystemToneClass(item.tone)}`}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.hint}</span>
          </div>
        ))}
      </div>

      <div className="profile-performance-sample">
        <strong>Покриття даних</strong>
        <span>{ecosystem.sampleSummary}</span>
      </div>

      {ecosystem.roles.length ? (
        <div className="profile-performance-role-list" aria-label="Рольові підсумки Warcraft Logs">
          {ecosystem.roles.map((role) => <PerformanceRoleRow key={role.key} role={role} />)}
        </div>
      ) : (
        <EmptyBlock title="Рольові пули ще не зібрані" text="Коли Warcraft Logs поверне рейдові пули, тут зʼявляться окремі середні HPS/DPS, максимуми та стабільність." />
      )}
    </article>
  );
}

function EmptyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="profile-empty-characters profile-empty-characters--compact profile-character-detail-empty">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export default async function CharacterProfilePage({
  params,
}: {
  params: Promise<{ profileId: string; characterKey: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
    throw new Error("Unauthorized");
  }

  const { profileId, characterKey } = await params;
  const profile = await getProfileById(profileId);
  if (!profile || !canViewProfile(session, profileId, profile)) notFound();

  const normalizedCharacterKey = normalizeCharacterKey(safeDecodePathSegment(characterKey));
  const character = profile.characters.find((item) => normalizeCharacterKey(item.key) === normalizedCharacterKey);
  if (!character) notFound();

  const [freshRaiderIo, warcraftLogs] = await Promise.all([
    fetchRaiderIoCharacterProfile({
      region: character.region || profile.battlenet?.region || "eu",
      realmSlug: character.realmSlug,
      name: character.normalizedName || character.name,
      fields: RAIDERIO_CHARACTER_DETAIL_FIELDS,
    }).catch(() => null),
    fetchWarcraftLogsCharacterSummary({
      region: character.region || profile.battlenet?.region || "eu",
      realmSlug: character.realmSlug,
      name: character.name,
    }),
  ]);

  const raiderIo = buildRaiderIoCharacterDetails(freshRaiderIo || character.raiderIo || null);
  const snapshot = raiderIo.snapshot || character.raiderIo || null;
  const currentScore = snapshot?.currentScore ?? character.raiderIo?.currentScore ?? null;
  const itemLevel = character.itemLevel ?? snapshot?.itemLevelEquipped ?? null;
  const updatedAt = externalSnapshotDate(character, raiderIo, warcraftLogs);
  const ecosystem = buildCharacterPerformanceEcosystem({
    rio: raiderIo,
    wcl: warcraftLogs,
    itemLevel,
  });

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-shell profile-account-page profile-character-detail-page" aria-label={`Статистика персонажа ${character.name}`}>
        <DashboardIdentity user={session} activeSection="profile" />

        <div className="profile-account-layout profile-character-detail-layout">
          <div className="profile-account-main profile-character-detail-main">
            <CharacterHero profile={profile} character={character} viewer={session} />

            <section id="character-overview" className="profile-character-detail-stats" aria-label="Коротка статистика персонажа">
              <StatCard label="Рівень предметів" value={roundNumber(itemLevel)} hint="Battle.net / Raider.IO" />
              <StatCard label="Raider.IO" value={roundNumber(currentScore)} hint="Поточний сезон" />
              <StatCard label="WCL parse" value={formatPercent(warcraftLogs.bestPerformanceAverage)} hint={warcraftLogs.status === "ready" ? "Warcraft Logs" : "Потрібне підключення WCL"} />
              <StatCard label="Ефективність" value={roundNumber(ecosystem.overallScore)} hint="Власний індекс" />
              <StatCard label="Оновлено" value={formatStableUkCompactDate(updatedAt)} hint="Зовнішні дані" />
            </section>

            <section id="character-ecosystem" aria-label="Зведена екосистема персонажа">
              <CharacterPerformancePanel ecosystem={ecosystem} />
            </section>

            <section id="character-rio" className="profile-character-detail-grid" aria-label="Raider.IO статистика">
              <RaiderIoOverview details={raiderIo} stored={character.raiderIo || null} />
              <DungeonRunsPanel title="Найкращі ключі" eyebrow="Raider.IO" runs={raiderIo.bestRuns} emptyText="Поки немає списку найкращих ключів." />
              <DungeonRunsPanel title="Останні ключі" eyebrow="Raider.IO" runs={raiderIo.recentRuns} emptyText="Поки немає останніх ключів." />
              <DungeonRunsPanel title="Найвищі ключі" eyebrow="Raider.IO" runs={raiderIo.highestRuns} emptyText="Поки немає списку найвищих ключів." />
              <DungeonRunsPanel title="Поточний тиждень" eyebrow="Raider.IO" runs={raiderIo.weeklyHighestRuns} emptyText="Поки немає ключів за поточний тиждень." />
              <DungeonRunsPanel title="Минулий тиждень" eyebrow="Raider.IO" runs={raiderIo.previousWeekHighestRuns} emptyText="Поки немає ключів за минулий тиждень." />
              <RaidProgressPanel raids={raiderIo.raidProgression} />
            </section>

            <section id="character-wcl" aria-label="Warcraft Logs статистика">
              <WarcraftLogsPanel summary={warcraftLogs} />
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
