import type { DashboardSession } from "@/lib/auth";
import {
  canManageDiscordMembers,
  canManageGroups,
  canViewAdminLogs,
} from "@/lib/permissions";

export type AdminTabKey = "overview" | "groups" | "discord" | "logs";

export default function AdminTabs({
  active,
  user,
}: {
  active: AdminTabKey;
  user?: DashboardSession | null;
}) {
  const canOpenGroups = canManageGroups(user);
  const canOpenDiscord = canManageDiscordMembers(user);
  const canOpenLogs = canViewAdminLogs(user);
  const tabs = [
    {
      key: "overview" as const,
      href: "/admin",
      icon: "⚙",
      label: "Керування",
      description: "загальний центр",
      visible: canOpenGroups || canOpenDiscord || canOpenLogs,
    },
    {
      key: "groups" as const,
      href: "/admin/groups",
      icon: "🧩",
      label: "Групи та права доступу",
      description: "ролі й дозволи",
      visible: canOpenGroups,
    },
    {
      key: "discord" as const,
      href: "/admin/discord",
      icon: "◆",
      label: "Discord-учасники",
      description: "ролі, ніки, шаблон",
      visible: canOpenDiscord,
    },
    {
      key: "logs" as const,
      href: "/admin/logs",
      icon: "▦",
      label: "Журнал дій",
      description: "результати й помилки",
      visible: canOpenLogs,
    },
  ].filter((tab) => tab.visible);

  if (!tabs.length) return null;

  return (
    <nav className="admin-tabs panel" aria-label="Розділи керування">
      {tabs.map((tab) => (
        <a key={tab.key} href={tab.href} className={active === tab.key ? "is-active" : undefined} aria-current={active === tab.key ? "page" : undefined}>
          <span aria-hidden="true">{tab.icon}</span>
          <strong>{tab.label}</strong>
          <small>{tab.description}</small>
        </a>
      ))}
    </nav>
  );
}
