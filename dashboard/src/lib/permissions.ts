import type { DashboardRole, DashboardSession } from "@/lib/auth";
import type { DiscordRoleOption } from "@/lib/discordAdmin";

export type DashboardCapability = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
};

export function hierarchyTitle(role: DashboardRole) {
  return role === "admin" ? "Гільдмайстер" : "Офіцер";
}

export function dashboardRoleLabel(role: DashboardRole) {
  return role === "admin" ? "Адмін" : "Модератор";
}

export function siteStatusLabel(role: DashboardRole) {
  return role === "admin" ? "Повний доступ" : "Офіцерський доступ";
}

export function siteStatusDescription(role: DashboardRole) {
  return role === "admin"
    ? "Може керувати всіма розділами панелі, включно з правилами Discord і матеріалами сайту."
    : "Може працювати із заявками та звичайними Discord embed без доступу до правил і матеріалів сайту.";
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

export function canManageSiteContent(session: DashboardSession | null | undefined) {
  return Boolean(session && session.role === "admin");
}

export function dashboardCapabilities(role: DashboardRole): DashboardCapability[] {
  const isAdmin = role === "admin";

  return [
    {
      key: "applications",
      title: "Заявки до гільдії",
      description: "Перегляд заявок, Raider.IO даних, прийняття та відхилення кандидатів.",
      enabled: true,
    },
    {
      key: "general-embeds",
      title: "Звичайні Discord embed",
      description: "Створення, редагування за Discord message link і тегання вибраних ролей.",
      enabled: true,
    },
    {
      key: "rules-embeds",
      title: "Discord правила",
      description: "Створення та редагування rules embed, кнопки прийняття, ролі й статистика правил.",
      enabled: isAdmin,
    },
    {
      key: "site-content",
      title: "Новини та гайди сайту",
      description: "Створення, редагування й видалення Markdown-матеріалів основного сайту.",
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
  return role === "admin"
    ? splitConfiguredRoleIds(process.env.DISCORD_ADMIN_ROLE_IDS)
    : splitConfiguredRoleIds(process.env.DISCORD_MODERATOR_ROLE_IDS);
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
  return matchingDiscordRoleIds(session).map((roleId) => roleMap.get(roleId) || `Discord role · ${roleId.slice(-6)}`);
}
