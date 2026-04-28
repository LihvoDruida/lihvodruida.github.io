import type { DashboardSession } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import { canManageApplications, canManageGeneralEmbeds, hierarchyTitle, siteStatusLabel } from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardIdentity({
  user,
  activeSection = "applications",
}: {
  user: DashboardSession | null;
  activeSection?: "applications" | "content" | "discord" | "profile";
}) {
  const guild = await getGuildBranding();
  const avatar = user?.avatar_url || user?.avatar || null;
  const canUseApplications = canManageApplications(user);
  const canUseDiscord = canManageGeneralEmbeds(user);
  const profileHref = user?.profileId ? `/profile/${user.profileId}` : "/profile";

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-brand">
        <img className="guild-mark" src={guild.iconUrl} alt="" width={44} height={44} loading="eager" referrerPolicy="no-referrer" />
        <div>
          <strong>{guild.name}</strong>
          <span>Secure applications dashboard</span>
        </div>
      </div>

      {user ? (
        <>
          <nav className="dashboard-nav" aria-label="Панель керування">
            {canUseApplications ? (
              <a href="/" className={activeSection === "applications" ? "is-active" : undefined} aria-current={activeSection === "applications" ? "page" : undefined}>Заявки</a>
            ) : null}
            {canUseDiscord ? (
              <a
                href="/discord"
                className={activeSection === "discord" ? "is-active" : undefined}
                aria-current={activeSection === "discord" ? "page" : undefined}
              >
                Discord
              </a>
            ) : null}
            {user.role === "admin" ? (
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
        </>
      ) : null}
    </header>
  );
}
