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
  mentor: 20,
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

export function isDashboardStaff(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function isDashboardAdmin(session: DashboardSession | null | undefined) {
  return Boolean(session && session.role === "admin");
}

export function canViewRaidDirectory(session: DashboardSession | null | undefined) {
  return Boolean(session);
}

export function canViewGuildRoster(session: DashboardSession | null | undefined) {
  return Boolean(session);
}

export function canViewRaidRoster(session: DashboardSession | null | undefined) {
  return isDashboardStaff(session);
}

export function canViewProfileAccessDetails(session: DashboardSession | null | undefined) {
  return isDashboardStaff(session);
}

export function canViewProfiles(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function hierarchyTitle(role: DashboardRole) {
  if (role === "admin") return "Гільдмайстер";
  if (role === "moderator") return "Офіцер";
  if (role === "mentor") return "Наставник новачків";
  return "Учасник гільдії";
}

export function guildStatusLabel(role: DashboardRole) {
  if (role === "admin") return "Гільдмайстер";
  if (role === "moderator") return "Офіцер";
  if (role === "mentor") return "Наставник";
  return "Учасник";
}

export function dashboardRoleLabel(role: DashboardRole) {
  if (role === "admin") return "Адмін";
  if (role === "moderator") return "Модератор";
  if (role === "mentor") return "Наставник";
  return "Учасник";
}

export function siteStatusLabel(role: DashboardRole) {
  if (role === "admin") return "Повний доступ";
  if (role === "moderator") return "Офіцерський доступ";
  if (role === "mentor") return "Наставник новачків";
  return "Особистий профіль";
}

export function siteStatusDescription(role: DashboardRole) {
  if (role === "admin") {
    return "Повний доступ до профілів, заявок, рейдів, Discord-розділів і матеріалів сайту.";
  }
  if (role === "moderator") {
    return "Офіцерський доступ до заявок, профілів, рейдів і Discord-повідомлень без адмінських розділів.";
  }
  if (role === "mentor") {
    return "Особистий профіль і перегляд заявок без BattleTag та без керування статусами.";
  }
  return "Особистий профіль, персонажі, рейди, запис і правила без адмінських блоків.";
}

export function canViewApplications(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator" || session.role === "mentor"));
}

export function canManageApplications(session: DashboardSession | null | undefined) {
  return Boolean(session && (session.role === "admin" || session.role === "moderator"));
}

export function canViewApplicationSensitiveFields(session: DashboardSession | null | undefined) {
  return canManageApplications(session);
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
  const canReviewApplications = canModerate || role === "mentor";

  return [
    {
      key: "profile",
      title: "Особистий профіль",
      description: "Особисті дані, персонажі Battle.net, роль для рейдів і серверне Discord-ім’я.",
      enabled: true,
    },
    {
      key: "raid-signup",
      title: "Рейди та запис",
      description: "Перегляд опублікованих рейдів, правила і власний запис на участь.",
      enabled: true,
    },
    {
      key: "guild-roster",
      title: "Склад гільдії",
      description: "Перегляд персонажів гільдії, Raider.IO, item level, ролей, класів і фільтрів.",
      enabled: true,
    },
    {
      key: "applications",
      title: "Заявки до гільдії",
      description: role === "mentor"
        ? "Перегляд заявок і даних персонажа без BattleTag та без права приймати рішення."
        : "Перегляд заявок, даних персонажа та рішення по кандидатах.",
      enabled: canReviewApplications,
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
  if (role === "mentor") return splitConfiguredRoleIds(process.env.DISCORD_MENTOR_ROLE_IDS || process.env.DISCORD_NEWCOMER_MENTOR_ROLE_IDS);
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

  if (session.provider === "token") return ["Резервний ключ адміністратора"];

  const roleMap = new Map<string, string>(roles.map((role) => [role.id, role.name]));
  return matchingDiscordRoleIds(session).map((roleId) => roleMap.get(roleId) || `Discord роль ${roleId.slice(-6)}`);
}
