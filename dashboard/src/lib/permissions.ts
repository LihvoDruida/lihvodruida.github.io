import type { DashboardRole, DashboardSession } from "@/lib/auth";
import type { DiscordRoleOption } from "@/lib/discordAdmin";

export type DashboardCapability = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
};

export const DASHBOARD_ROLE_ORDER: Record<DashboardRole, number> = {
  member: 10,
  moderator: 50,
  admin: 100,
};

export function dashboardRoleRank(role: DashboardRole | null | undefined) {
  return role ? DASHBOARD_ROLE_ORDER[role] || 0 : 0;
}

export function canAccessDashboardRole(viewer: DashboardSession | null | undefined, targetRole: DashboardRole | null | undefined) {
  if (!viewer || !targetRole) return false;
  return dashboardRoleRank(viewer.role) >= dashboardRoleRank(targetRole);
}

export function canViewProfiles(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function hierarchyTitle(role: DashboardRole) {
  if (role === "admin") return "Гільдмайстер";
  if (role === "moderator") return "Офіцер";
  return "Учасник гільдії";
}

export function dashboardRoleLabel(role: DashboardRole) {
  if (role === "admin") return "Адмін";
  if (role === "moderator") return "Модератор";
  return "Учасник";
}

export function siteStatusLabel(role: DashboardRole) {
  if (role === "admin") return "Повний доступ";
  if (role === "moderator") return "Офіцерський доступ";
  return "Особистий профіль";
}

export function siteStatusDescription(role: DashboardRole) {
  if (role === "admin") {
    return "Може керувати всією панеллю: профілями, заявками, Discord-розділами та матеріалами сайту.";
  }
  if (role === "moderator") {
    return "Може працювати із заявками, звичайними Discord-повідомленнями та переглядати статистику. Розділи адміна залишаються закритими.";
  }
  return "Має доступ лише до власного профілю, своїх персонажів і власних дій.";
}

export function canManageApplications(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function canManageGeneralEmbeds(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function canManageRulesEmbeds(session: DashboardSession | null | undefined) {
  return Boolean(session && session.role === "admin");
}

export function canManageRaids(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function canViewRulesStats(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function canManageSiteContent(session: DashboardSession | null | undefined) {
  return Boolean(session && session.role === "admin");
}

export function dashboardCapabilities(role: DashboardRole): DashboardCapability[] {
  const isAdmin = role === "admin";
  const canModerate = role === "admin" || role === "moderator";

  return [
    {
      key: "profile",
      title: "Особистий профіль",
      description: "Кожен бачить свій профіль. Офіцери й адміни можуть відкривати лише профілі ролей не вище свого рівня.",
      enabled: true,
    },
    {
      key: "applications",
      title: "Заявки до гільдії",
      description: "Перегляд заявок, даних персонажа та рішення по кандидатах.",
      enabled: canModerate,
    },
    {
      key: "general-embeds",
      title: "Звичайні Discord-повідомлення",
      description: "Створення і редагування звичайних Discord-повідомлень, а також згадування вибраних ролей.",
      enabled: canModerate,
    },
    {
      key: "raids",
      title: "Рейди",
      description: "Створення рейдових оголошень, Discord-кнопки запису та автоматична побудова складу.",
      enabled: canModerate,
    },
    {
      key: "rules-embeds",
      title: "Discord правила",
      description: isAdmin
        ? "Керування повідомленнями правил, кнопками прийняття, ролями та статистикою."
        : "Перегляд статистики правил без права змінювати самі повідомлення.",
      enabled: canModerate,
    },
    {
      key: "site-content",
      title: "Новини та гайди сайту",
      description: "Створення, редагування та видалення матеріалів сайту.",
      enabled: isAdmin,
    },
  ];
}

export function splitConfiguredRoleIds(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function configuredRoleIdsForDashboardRole(role: DashboardRole) {
  if (role === "admin") return splitConfiguredRoleIds(process.env.DISCORD_ADMIN_ROLE_IDS);
  if (role === "moderator") return splitConfiguredRoleIds(process.env.DISCORD_MODERATOR_ROLE_IDS);
  return splitConfiguredRoleIds(process.env.DISCORD_MEMBER_ROLE_IDS);
}

export function matchingDiscordRoleIds(session: DashboardSession | null | undefined) {
  if (!session) return [] as string[];

  const configured = new Set<string>(configuredRoleIdsForDashboardRole(session.role));
  const userRoleIds = Array.from(new Set<string>((session.discordRoleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean)));
  const matched = userRoleIds.filter((roleId) => configured.has(roleId));

  return matched.length ? matched : Array.from(configured);
}

export function matchingDiscordRoleLabels(
  session: DashboardSession | null | undefined,
  roles: DiscordRoleOption[] = []
) {
  if (!session) return [] as string[];

  if (session.provider === "token") return ["Резервний адмін-токен"];

  const roleMap = new Map<string, string>(roles.map((role) => [role.id, role.name]));
  return matchingDiscordRoleIds(session).map((roleId) => roleMap.get(roleId) || `Discord роль ${roleId.slice(-6)}`);
}
