import type { CSSProperties } from "react";
import type { DashboardSession } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import {
  canManageApplications,
  canManageGeneralEmbeds,
  canManageRaids,
  canManageSiteContent,
  canViewProfiles,
  canViewGuildRoster,
  canViewRaidDirectory,
  hierarchyTitle,
  siteStatusLabel,
} from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";
import { getProfileById, getProfilePublicName } from "@/lib/profiles";

export default async function DashboardIdentity({
  user,
  activeSection = "applications",
}: {
  user: DashboardSession | null;
  activeSection?: "applications" | "content" | "discord" | "guild" | "profile" | "profiles" | "raids" | "rules";
}) {
  const guild = await getGuildBranding();
  const profile = user?.profileId ? await getProfileById(user.profileId).catch(() => null) : null;
  const displayName = profile ? getProfilePublicName(profile) : (user?.name || user?.login || "Користувач");
  const avatar = profile?.avatarUrl || user?.avatar_url || user?.avatar || null;
  const canUseApplications = canManageApplications(user);
  const canUseDiscord = canManageGeneralEmbeds(user);
  const canUseRaids = canViewRaidDirectory(user);
  const canCreateRaids = canManageRaids(user);
  const canUseProfiles = canViewProfiles(user);
  const canUseGuildRoster = canViewGuildRoster(user);
  const canUseContent = canManageSiteContent(user);
  const profileHref = user?.profileId ? `/profile/${user.profileId}` : "/profile";
  const mobileNavItems = user
    ? [
        canUseApplications
          ? { href: "/", section: "applications" as const, icon: "✉", label: "Заявки" }
          : null,
        canUseRaids
          ? { href: "/raids", section: "raids" as const, icon: "⚔", label: "Рейди" }
          : null,
        canUseGuildRoster
          ? { href: "/guild", section: "guild" as const, icon: "☘", label: "Склад" }
          : null,
        canUseDiscord
          ? { href: "/discord", section: "discord" as const, icon: "◆", label: "Discord" }
          : null,
        canUseProfiles
          ? { href: "/profiles", section: "profiles" as const, icon: "☷", label: "Профілі" }
          : null,
        canUseContent
          ? { href: "/content", section: "content" as const, icon: "✦", label: "Новини" }
          : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  const hasMobileNav = mobileNavItems.length > 0;

  return (
    <>
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
              {canUseGuildRoster ? (
                <a
                  href="/guild"
                  className={activeSection === "guild" ? "is-active" : undefined}
                  aria-current={activeSection === "guild" ? "page" : undefined}
                >
                  Склад гільдії
                </a>
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
                aria-label={`Відкрити профіль ${displayName || user.name || user.login || "користувача"}`}
                aria-current={activeSection === "profile" ? "page" : undefined}
              >
                <div className="dashboard-user__avatar-wrap">
                  {avatar ? <img className="discord-avatar" src={avatar} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer" /> : <span className="discord-avatar-fallback">{(displayName || user.name || user.login || "A").charAt(0)}</span>}
                  <span className="dashboard-user__status" aria-hidden="true" />
                </div>
                <div>
                  <strong>{displayName}</strong>
                  <span>{hierarchyTitle(user.role)} • {siteStatusLabel(user.role)}</span>
                </div>
              </a>
              <LogoutButton />
            </div>
          </>
        ) : null}
      </header>

      {user && hasMobileNav ? (
        <nav
          className="dashboard-mobile-nav"
          aria-label="Швидка навігація"
          data-items={mobileNavItems.length}
          style={{ "--dashboard-mobile-nav-items": mobileNavItems.length } as CSSProperties}
        >
          {mobileNavItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={activeSection === item.section ? "is-active" : undefined}
              aria-current={activeSection === item.section ? "page" : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <strong>{item.label}</strong>
            </a>
          ))}
        </nav>
      ) : null}
    </>
  );
}
