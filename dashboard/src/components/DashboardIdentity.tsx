import type { DashboardSession } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import { canManageGeneralEmbeds, hierarchyTitle, siteStatusLabel } from "@/lib/permissions";
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
  const canUseDiscord = canManageGeneralEmbeds(user);

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
            <a href="/" className={activeSection === "applications" ? "is-active" : undefined} aria-current={activeSection === "applications" ? "page" : undefined}>Заявки</a>
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
            <a
              href="/profile"
              className={activeSection === "profile" ? "is-active" : undefined}
              aria-current={activeSection === "profile" ? "page" : undefined}
            >
              Профіль
            </a>
          </nav>

          <div className="dashboard-user">
            <div className="dashboard-user__avatar-wrap">
              {avatar ? <img className="discord-avatar" src={avatar} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer" /> : <span className="discord-avatar-fallback">{(user.name || user.login || "A").charAt(0)}</span>}
              <span className="dashboard-user__status" aria-hidden="true" />
            </div>
            <div>
              <strong>{user.name}</strong>
              <span>{hierarchyTitle(user.role)} • {siteStatusLabel(user.role)}</span>
            </div>
            <LogoutButton />
          </div>
        </>
      ) : null}
    </header>
  );
}
