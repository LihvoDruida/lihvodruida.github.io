import type { DashboardSession } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import { dashboardRaidRulesUrl } from "@/lib/raids";
import {
  canManageApplications,
  canManageGeneralEmbeds,
  canManageRaids,
  canManageSiteContent,
  canViewProfiles,
  canViewRaidDirectory,
  hierarchyTitle,
  siteStatusLabel,
} from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardIdentity({
  user,
  activeSection = "applications",
}: {
  user: DashboardSession | null;
  activeSection?: "applications" | "content" | "discord" | "profile" | "profiles" | "raids" | "rules";
}) {
  const guild = await getGuildBranding();
  const avatar = user?.avatar_url || user?.avatar || null;
  const canUseApplications = canManageApplications(user);
  const canUseDiscord = canManageGeneralEmbeds(user);
  const canUseRaids = canViewRaidDirectory(user);
  const canCreateRaids = canManageRaids(user);
  const canUseProfiles = canViewProfiles(user);
  const canUseContent = canManageSiteContent(user);
  const profileHref = user?.profileId ? `/profile/${user.profileId}` : "/profile";
  const rulesHref = dashboardRaidRulesUrl();

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-brand">
        <img className="guild-mark" src={guild.iconUrl} alt="" width={44} height={44} loading="eager" referrerPolicy="no-referrer" />
        <div>
          <strong>{guild.name}</strong>
          <span>{user?.role === "member" ? "Особиста панель" : "Панель гільдії"}</span>
        </div>
      </div>

      {user ? (
        <>
          <nav className="dashboard-nav" aria-label="Панель керування">
            {canUseApplications ? (
              <a href="/" className={activeSection === "applications" ? "is-active" : undefined} aria-current={activeSection === "applications" ? "page" : undefined}>Заявки</a>
            ) : null}
            {canUseRaids ? (
              <a
                href="/raids"
                className={activeSection === "raids" ? "is-active" : undefined}
                aria-current={activeSection === "raids" ? "page" : undefined}
              >
                {canCreateRaids ? "Рейди" : "Мої рейди"}
              </a>
            ) : null}
            <a
              href={profileHref}
              className={activeSection === "profile" ? "is-active" : undefined}
              aria-current={activeSection === "profile" ? "page" : undefined}
            >
              Профіль
            </a>
            <a href={rulesHref} target="_blank" rel="noreferrer">Правила</a>
            {canUseDiscord ? (
              <a
                href="/discord"
                className={activeSection === "discord" ? "is-active" : undefined}
                aria-current={activeSection === "discord" ? "page" : undefined}
              >
                Discord
              </a>
            ) : null}
            {canUseProfiles ? (
              <a
                href="/profiles"
                className={activeSection === "profiles" ? "is-active" : undefined}
                aria-current={activeSection === "profiles" ? "page" : undefined}
              >
                Профілі
              </a>
            ) : null}
            {canUseContent ? (
              <a
                href="/content"
                className={activeSection === "content" ? "is-active" : undefined}
                aria-current={activeSection === "content" ? "page" : undefined}
              >
                Новини / гайди
              </a>
            ) : null}
          </nav>

          <div className="dashboard-user">
            <a
              className={`dashboard-user__profile-link${activeSection === "profile" ? " is-active" : ""}`}
              href={profileHref}
              aria-label={`Відкрити профіль ${user.name || user.login || "користувача"}`}
              aria-current={activeSection === "profile" ? "page" : undefined}
            >
              <div className="dashboard-user__avatar-wrap">
                {avatar ? <img className="discord-avatar" src={avatar} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer" /> : <span className="discord-avatar-fallback">{(user.name || user.login || "A").charAt(0)}</span>}
                <span className="dashboard-user__status" aria-hidden="true" />
              </div>
              <div>
                <strong>{user.name}</strong>
                <span>{hierarchyTitle(user.role)} • {siteStatusLabel(user.role)}</span>
              </div>
            </a>
            <LogoutButton />
          </div>

          <nav className="dashboard-mobile-nav" aria-label="Швидка навігація">
            {canUseApplications ? (
              <a href="/" className={activeSection === "applications" ? "is-active" : undefined} aria-current={activeSection === "applications" ? "page" : undefined}><span aria-hidden="true">✉</span><strong>Заявки</strong></a>
            ) : null}
            {canUseRaids ? (
              <a href="/raids" className={activeSection === "raids" ? "is-active" : undefined} aria-current={activeSection === "raids" ? "page" : undefined}><span aria-hidden="true">⚔</span><strong>Рейди</strong></a>
            ) : null}
            <a href={profileHref} className={activeSection === "profile" ? "is-active" : undefined} aria-current={activeSection === "profile" ? "page" : undefined}><span aria-hidden="true">👤</span><strong>Профіль</strong></a>
            <a href={rulesHref} target="_blank" rel="noreferrer"><span aria-hidden="true">✓</span><strong>Правила</strong></a>
            {canUseDiscord ? (
              <a href="/discord" className={activeSection === "discord" ? "is-active" : undefined} aria-current={activeSection === "discord" ? "page" : undefined}><span aria-hidden="true">◆</span><strong>Discord</strong></a>
            ) : null}
            {canUseProfiles ? (
              <a href="/profiles" className={activeSection === "profiles" ? "is-active" : undefined} aria-current={activeSection === "profiles" ? "page" : undefined}><span aria-hidden="true">☷</span><strong>Профілі</strong></a>
            ) : null}
            {canUseContent ? (
              <a href="/content" className={activeSection === "content" ? "is-active" : undefined} aria-current={activeSection === "content" ? "page" : undefined}><span aria-hidden="true">✦</span><strong>Новини</strong></a>
            ) : null}
          </nav>
        </>
      ) : null}
    </header>
  );
}
