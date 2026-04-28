import type { DashboardRole, DashboardSession } from "@/lib/auth";
import type { DiscordRoleOption } from "@/lib/discordAdmin";

export type DashboardCapability = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
};

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
    return "Може керувати всіма розділами панелі, включно з правилами Discord і матеріалами сайту.";
  }
  if (role === "moderator") {
    return "Може працювати із заявками, звичайними Discord embed і переглядати статистику правил без права редагування правил та матеріалів сайту.";
  }
  return "Може переглядати лише власну сторінку профілю. Адмінські дані, заявки й Discord-інструменти приховані.";
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
      description: "Перегляд власної унікальної сторінки профілю та статусу доступу.",
      enabled: true,
    },
    {
      key: "applications",
      title: "Заявки до гільдії",
      description: "Перегляд заявок, Raider.IO даних, прийняття та відхилення кандидатів.",
      enabled: canModerate,
    },
    {
      key: "general-embeds",
      title: "Звичайні Discord embed",
      description: "Створення, редагування за Discord message link і тегання вибраних ролей.",
      enabled: canModerate,
    },
    {
      key: "rules-embeds",
      title: "Discord правила",
      description: isAdmin
        ? "Створення та редагування rules embed, кнопки прийняття, ролі й статистика правил."
        : "Перегляд статистики звичайних правил і підписантів правил рейду без редагування embed.",
      enabled: canModerate,
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
  return matchingDiscordRoleIds(session).map((roleId) => roleMap.get(roleId) || `Discord role · ${roleId.slice(-6)}`);
}
