import type { CSSProperties } from "react";
import type { DashboardSession } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import {
  canViewApplications,
  canManageGeneralEmbeds,
  canManageRaids,
  canManageSiteContent,
  canViewProfiles,
  canViewGuildRoster,
  canViewRaidDirectory,
  canManageGroups,
  canManageDiscordMembers,
  hierarchyTitle,
  siteStatusLabel,
} from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";
import MobileNavSafeAreaSync from "@/components/MobileNavSafeAreaSync";
import DashboardDesktopNav from "@/components/DashboardDesktopNav";
import SectionIcon, { type SectionIconName } from "@/components/SectionIcon";
import { getProfileById, getProfilePublicName } from "@/lib/profiles";
import { getGuildNicknamePolicy } from "@/lib/guildNicknamePolicy";

export default async function DashboardIdentity({
  user,
  activeSection = "home",
}: {
  user: DashboardSession | null;
  activeSection?: "home" | "admin" | "applications" | "content" | "discord" | "guild" | "profile" | "profiles" | "raids" | "rules";
}) {
  const [guild, nicknamePolicy] = await Promise.all([
    getGuildBranding(),
    getGuildNicknamePolicy().catch(() => ({ template: "{name} [{main}, {alt}, {alt}]" })),
  ]);
  const profile = user?.profileId ? await getProfileById(user.profileId).catch(() => null) : null;
  const displayName = profile ? getProfilePublicName(profile, nicknamePolicy.template) : (user?.name || user?.login || "Користувач");
  const avatar = profile?.avatarUrl || user?.avatar_url || user?.avatar || null;
  const canUseApplications = canViewApplications(user);
  const canUseDiscord = canManageGeneralEmbeds(user);
  const canUseRaids = canViewRaidDirectory(user);
  const canCreateRaids = canManageRaids(user);
  const canUseProfiles = canViewProfiles(user);
  const canUseGuildRoster = canViewGuildRoster(user);
  const canUseContent = canManageSiteContent(user);
  const canUseAdmin = canManageGroups(user) || canManageDiscordMembers(user);
  const profileHref = user?.profileId ? `/profile/${user.profileId}` : "/profile";
  const navItems = user
    ? [
        { href: "/", section: "home" as const, icon: "home" as SectionIconName, label: "Головна", desktopLabel: "Головна" },
        canUseApplications
          ? { href: "/applications", section: "applications" as const, icon: "applications" as SectionIconName, label: "Заявки", desktopLabel: "Заявки" }
          : null,
        canUseRaids
          ? { href: "/raids", section: "raids" as const, icon: "raids" as SectionIconName, label: "Рейди", desktopLabel: canCreateRaids ? "Рейди" : "Мої рейди" }
          : null,
        canUseGuildRoster
          ? { href: "/guild", section: "guild" as const, icon: "guild" as SectionIconName, label: "Склад", desktopLabel: "Склад гільдії" }
          : null,
        canUseDiscord
          ? { href: "/discord", section: "discord" as const, icon: "discord" as SectionIconName, label: "Discord", desktopLabel: "Discord" }
          : null,
        canUseProfiles
          ? { href: "/profiles", section: "profiles" as const, icon: "profiles" as SectionIconName, label: "Профілі", desktopLabel: "Профілі" }
          : null,
        canUseContent
          ? { href: "/content", section: "content" as const, icon: "content" as SectionIconName, label: "Новини", desktopLabel: "Новини / гайди" }
          : null,
        canUseAdmin
          ? { href: "/admin", section: "admin" as const, icon: "admin" as SectionIconName, label: "Керування", desktopLabel: "Керування" }
          : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  const hasMobileNav = navItems.length > 0;

  return (
    <>
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <div className="dashboard-brand__crest" aria-hidden="true">
            <SectionIcon name="guild" className="dashboard-section-icon dashboard-section-icon--brand" />
          </div>
          <img className="guild-mark" src={guild.iconUrl} alt="" width={44} height={44} loading="eager" referrerPolicy="no-referrer" />
          <div>
            <strong>{guild.name}</strong>
            <span>{user?.role === "member" ? "Особиста панель" : user?.role === "mentor" ? "Панель наставника" : "Панель гільдії"}</span>
          </div>
        </div>

        {user ? (
          <>
            <DashboardDesktopNav
              items={navItems}
              activeSection={activeSection}
            />

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
                  <span>{user.groupName || hierarchyTitle(user.role)} • {user.isServerOwner ? "Власник сервера" : siteStatusLabel(user.role)}</span>
                </div>
              </a>
              <LogoutButton />
            </div>
          </>
        ) : null}
      </header>

      {user && hasMobileNav ? (
        <>
          <MobileNavSafeAreaSync />
          <div
            className="dashboard-mobile-nav-shell"
            data-items={navItems.length}
          >
            <nav
              className="dashboard-mobile-nav"
              aria-label="Швидка навігація"
              data-items={navItems.length}
              style={{ "--dashboard-mobile-nav-items": navItems.length } as CSSProperties}
            >
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={activeSection === item.section ? "is-active" : undefined}
                  aria-current={activeSection === item.section ? "page" : undefined}
                >
                  <span className="dashboard-mobile-nav__icon" aria-hidden="true"><SectionIcon name={item.icon} className="dashboard-section-icon" /></span>
                  <strong>{item.label}</strong>
                </a>
              ))}
            </nav>
          </div>
        </>
      ) : null}
    </>
  );
}
