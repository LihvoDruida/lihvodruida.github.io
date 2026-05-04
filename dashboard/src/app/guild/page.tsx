import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import GuildRosterExplorer from "@/components/GuildRosterExplorer";
import GuildRosterRefreshButton from "@/components/GuildRosterRefreshButton";
import { getSessionUser, isAuthenticated } from "@/lib/auth";
import { loadGuildRosterData } from "@/lib/guildRoster";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Склад гільдії",
  description: "Огляд складу Mistblossom Vanguard: ролі, класи, типи броні, item level, Mythic+ рейтинг і зручні фільтри для учасників.",
  path: "/guild",
  keywords: ["склад гільдії", "рейдери WoW", "Raider.IO", "item level"],
});

function formatDate(value?: string | null) {
  if (!value) return "оновлення очікується";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function GuildRosterPage() {
  if (!(await isAuthenticated())) redirect("/login");
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const roster = await loadGuildRosterData();

  return (
    <main className="container guild-page">
      <section className="dashboard-shell" aria-label="Панель Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="guild" />
        <header className="hero panel guild-hero">
          <div className="hero-copy dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Склад гільдії</div>
            <h1>Склад гільдії</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">
              Живий список персонажів гільдії з Raider.IO, item level, ролями, класами, спеками та фракціями.
            </p>
            <div className="guild-hero-meta">
              <span>{roster.stats.guildName}</span>
              <span>{roster.stats.guildRealm}</span>
              <span>{roster.stats.memberCount} персонажів</span>
              <span>Оновлено: {formatDate(roster.stats.updatedAt)}</span>
            </div>
            <GuildRosterRefreshButton />
          </div>

          <div className="guild-hero-score" aria-label="Коротка статистика складу">
            <div>
              <span>СЕР. RIO</span>
              <strong>{Math.round(roster.stats.averageRioAll || 0).toLocaleString("uk-UA")}</strong>
            </div>
            <div>
              <span>СЕР. ILVL</span>
              <strong>{Math.round(roster.stats.averageItemLevel || 0).toLocaleString("uk-UA")}</strong>
            </div>
            <div>
              <span>МАКС. RIO</span>
              <strong>{Math.round(roster.stats.maxRioAll || 0).toLocaleString("uk-UA")}</strong>
            </div>
          </div>
        </header>
      </section>

      <GuildRosterExplorer members={roster.members} stats={roster.stats} source={roster.source} error={roster.error} />
    </main>
  );
}
