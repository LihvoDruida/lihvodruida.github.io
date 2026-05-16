import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
import AdminTabs from "@/components/AdminTabs";
import IntegrationStatusPanel from "@/components/IntegrationStatusPanel";
import { buildPageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth";
import { canManageDiscordMembers, canManageGroups, canViewAdminLogs } from "@/lib/permissions";
import { getGuildNicknamePolicy, nicknameTemplateExample } from "@/lib/guildNicknamePolicy";
import { getGeoAccessPolicy } from "@/lib/geoAccessPolicy";

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
  const geoPolicy = await getGeoAccessPolicy();
  const canEditGeoPolicy = canManageGroups(user);

  return (
    <main className="container admin-container">
      <section className="dashboard-shell content-shell admin-page" aria-label="Керування Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="admin" />
        <header className="hero panel admin-hero">
          <div className="hero-copy dashboard-hero__copy guild-hero__copy">
            <span className="eyebrow">Mistblossom Vanguard • Адміністрування</span>
            <h1>Керування</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Один центр для прав доступу, Discord-ролей, серверних ніків і глобального шаблону імен.</p>
          </div>
          <HeroSidePanel
            ariaLabel="Огляд адміністрування"
            summary={[
              { label: "ГРУПА", value: user.groupName || user.role, note: user.isServerOwner ? "Власник сервера" : "Права з поточної сесії" },
              { label: "ШАБЛОН", value: policy.template, note: nicknameTemplateExample(policy.template) },
            ]}
            stats={[
              { label: "ГРУПИ", value: canManageGroups(user) ? "ON" : "—" },
              { label: "DISCORD", value: canManageDiscordMembers(user) ? "ON" : "—" },
              { label: "ЛОГИ", value: canViewAdminLogs(user) ? "ON" : "—" },
              { label: "ГЕО", value: geoPolicy.enabled ? "ON" : "OFF" },
            ]}
          />
        </header>

        <AdminTabs active="overview" />

        <section className="admin-overview-grid" aria-label="Швидкі переходи й стан системи">
          <IntegrationStatusPanel compact className="admin-overview-status-card" />
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

          <article className="panel admin-overview-card admin-overview-card--wide geo-access-card">
            <span aria-hidden="true">🛡</span>
            <div className="geo-access-card__copy">
              <strong>Геообмеження доступу</strong>
              <small>Блокує подання заявок і старт авторизації для вибраних ISO-кодів країн. Перевірка працює по edge-сигналу Cloudflare/Vercel без зовнішніх IP-баз.</small>
            </div>
            <form className="geo-access-form" action="/api/admin/security/geo-access" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
              <label className="geo-access-toggle">
                <input type="checkbox" name="enabled" defaultChecked={geoPolicy.enabled} disabled={!canEditGeoPolicy} />
                <span>Увімкнути геообмеження</span>
              </label>
              <label className="geo-access-toggle">
                <input type="checkbox" name="blockApplications" defaultChecked={geoPolicy.blockApplications} disabled={!canEditGeoPolicy} />
                <span>Забороняти подання заявок</span>
              </label>
              <label className="geo-access-toggle">
                <input type="checkbox" name="blockAuth" defaultChecked={geoPolicy.blockAuth} disabled={!canEditGeoPolicy} />
                <span>Забороняти авторизацію</span>
              </label>
              <label className="geo-access-toggle geo-access-toggle--muted">
                <input type="checkbox" name="blockUnknownCountries" defaultChecked={geoPolicy.blockUnknownCountries} disabled={!canEditGeoPolicy} />
                <span>Блокувати невідому країну <small>Обережно: може зачепити VPN, privacy relay або погано проксовані запити.</small></span>
              </label>
              <label className="geo-access-countries">
                <span>Коди країн</span>
                <input name="blockedCountries" defaultValue={geoPolicy.blockedCountries.join(", ")} placeholder="RU, BY" disabled={!canEditGeoPolicy} />
              </label>
              <button className="btn primary" type="submit" disabled={!canEditGeoPolicy}>Зберегти геообмеження</button>
            </form>
            <small className="geo-access-note">Поточний стан: {geoPolicy.enabled ? "увімкнено" : "вимкнено"}; заявки: {geoPolicy.blockApplications ? "блокуються" : "не блокуються"}; авторизація: {geoPolicy.blockAuth ? "блокується" : "не блокується"}.</small>
          </article>
        </section>
      </section>
    </main>
  );
}
