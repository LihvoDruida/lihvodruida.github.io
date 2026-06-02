import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import GuildRosterExplorer from "@/components/GuildRosterExplorer";
import GuildRosterRefreshButton from "@/components/GuildRosterRefreshButton";
import { getSessionUser, isAuthenticated } from "@/lib/auth";
import { loadGuildRosterData } from "@/lib/guildRoster";
import { getOwnProfilePath } from "@/lib/profiles";
import { canViewGuildRoster } from "@/lib/permissions";
import { buildPageMetadata } from "@/lib/seo";
import { getDashboardApiSettings } from "@/lib/dashboardApiSettings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Склад гільдії",
  description:
    "Огляд складу Mistblossom Vanguard: ролі, класи, типи броні, item level, Mythic+ рейтинг і зручні фільтри для учасників.",
  path: "/guild",
  keywords: ["склад гільдії", "рейдери WoW", "Raider.IO", "item level"],
});

function formatDate(value?: string | null) {
  if (!value) return "оновлення очікується";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function GuildRosterPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
    throw new Error("Login required");
  }
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
    throw new Error("Login required");
  }
  if (!canViewGuildRoster(user)) redirect(await getOwnProfilePath(user));

  const [roster, apiSettings] = await Promise.all([
    loadGuildRosterData(),
    getDashboardApiSettings(),
  ]);
  const members = roster.members;

  return (
    <main className="container guild-page">
      <section
        className="dashboard-shell content-shell"
        aria-label="Панель Mistblossom Vanguard"
      >
        <DashboardIdentity user={user} activeSection="guild" />
        <header className="hero panel guild-hero">
          <div className="hero-copy dashboard-hero__copy guild-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Склад гільдії</div>
            <h1>Склад гільдії</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">
              Живий список персонажів гільдії з Raider.IO, item level, ролями,
              класами, спеками та фракціями.
            </p>
          </div>

          <div className="guild-hero-side" aria-label="Огляд складу гільдії">
            <div className="guild-hero-summary">
              <section className="guild-hero-summary__block">
                <span className="guild-hero-summary__label">ГІЛЬДІЯ</span>
                <strong>{roster.stats.guildName}</strong>
                <p>{roster.stats.guildRealm}</p>
              </section>

              <section className="guild-hero-summary__block">
                <span className="guild-hero-summary__label">СКЛАД</span>
                <strong>
                  {roster.stats.memberCount.toLocaleString("uk-UA")} персонажів
                </strong>
                <p>Оновлено: {formatDate(roster.stats.updatedAt)}</p>
              </section>
            </div>

            <div
              className="guild-hero-stats"
              aria-label="Коротка статистика складу"
            >
              <div className="guild-hero-stat-card">
                <span>СЕР. RIO</span>
                <strong>
                  {Math.round(roster.stats.averageRioAll || 0).toLocaleString(
                    "uk-UA",
                  )}
                </strong>
              </div>
              <div className="guild-hero-stat-card">
                <span>СЕР. ILVL</span>
                <strong>
                  {Math.round(
                    roster.stats.averageItemLevel || 0,
                  ).toLocaleString("uk-UA")}
                </strong>
              </div>
              <div className="guild-hero-stat-card">
                <span>МАКС. RIO</span>
                <strong>
                  {Math.round(roster.stats.maxRioAll || 0).toLocaleString(
                    "uk-UA",
                  )}
                </strong>
              </div>
            </div>

            <div className="guild-hero-actions">
              <GuildRosterRefreshButton
                settings={{
                  clientDrivenSyncEnabled:
                    apiSettings.guildRosterClientDrivenSyncEnabled,
                  clientStepDelayMs: apiSettings.guildRosterClientStepDelayMs,
                  clientRequestTimeoutMs:
                    apiSettings.guildRosterClientRequestTimeoutMs,
                  clientMaxSteps: apiSettings.guildRosterClientMaxSteps,
                }}
              />
            </div>
          </div>
        </header>
        <GuildRosterExplorer
          members={members}
          stats={roster.stats}
          source={roster.source}
          error={roster.error}
        />
      </section>
    </main>
  );
}
