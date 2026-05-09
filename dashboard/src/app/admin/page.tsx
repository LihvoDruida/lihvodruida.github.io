import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import AdminTabs from "@/components/AdminTabs";
import IntegrationStatusPanel from "@/components/IntegrationStatusPanel";
import { buildPageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth";
import { canManageDiscordMembers, canManageGroups, canViewAdminLogs } from "@/lib/permissions";
import { getGuildNicknamePolicy, nicknameTemplateExample } from "@/lib/guildNicknamePolicy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Керування",
  description: "Центр керування Mistblossom: групи доступу, Discord-ролі, серверні ніки та глобальний шаблон ніку.",
  path: "/admin",
  keywords: ["керування", "Discord", "права", "ролі"],
});

export default async function AdminOverviewPage() {
  const user = await getSession();
  if (!user) { redirect("/login"); throw new Error("Login required"); }
  if (!canManageGroups(user) && !canManageDiscordMembers(user) && !canViewAdminLogs(user)) {
    redirect(user.profileId ? `/profile/${user.profileId}` : "/profile");
    throw new Error("Access denied");
  }

  const policy = await getGuildNicknamePolicy();

  return (
    <main className="container admin-container">
      <section className="dashboard-shell content-shell admin-page" aria-label="Керування Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="admin" />
        <header className="hero panel admin-hero">
          <div>
            <span className="eyebrow">Адміністрування</span>
            <h1>Керування</h1>
            <p>Один центр для прав доступу, Discord-ролей, серверних ніків і глобального шаблону імен.</p>
          </div>
          <div className="hero-actions">
            <span className="status-pill">Група: {user.groupName || user.role}</span>
            {user.isServerOwner ? <span className="status-pill good">Власник сервера</span> : null}
          </div>
        </header>

        <AdminTabs active="overview" />

        <section className="admin-system-status-panel" aria-label="Стан системи">
          <IntegrationStatusPanel compact />
        </section>

        <section className="admin-overview-grid" aria-label="Швидкі переходи">
          <a className="panel admin-overview-card" href="/admin/groups">
            <span aria-hidden="true">🧩</span>
            <strong>Групи та права доступу</strong>
            <small>Групи, Discord role ID, ранги та точні дозволи в панелі.</small>
          </a>
          <a className="panel admin-overview-card" href="/admin/discord">
            <span aria-hidden="true">◆</span>
            <strong>Discord-учасники</strong>
            <small>Видача/зняття ролей, перейменування та контроль шаблону ніку.</small>
          </a>
          <a className="panel admin-overview-card" href="/admin/logs">
            <span aria-hidden="true">▦</span>
            <strong>Журнал дій</strong>
            <small>Останні дії, результати Discord API, помилки та статистика.</small>
          </a>
          <article className="panel admin-overview-card admin-overview-card--wide">
            <span aria-hidden="true">✦</span>
            <strong>Поточний шаблон ніку</strong>
            <small><code>{policy.template}</code></small>
            <small>Приклад: {nicknameTemplateExample(policy.template)}</small>
          </article>
        </section>
      </section>
    </main>
  );
}
