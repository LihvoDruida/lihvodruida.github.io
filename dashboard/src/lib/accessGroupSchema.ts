import type { DashboardRole } from "@/lib/auth";

export const DEFAULT_ADMIN_GROUP_ID = "1";
export const DEFAULT_MODERATOR_GROUP_ID = "2";
export const DEFAULT_MENTOR_GROUP_ID = "3";
export const DEFAULT_MEMBER_GROUP_ID = "99";

export const FIXED_GROUP_IDS = new Set([DEFAULT_ADMIN_GROUP_ID, DEFAULT_MODERATOR_GROUP_ID, DEFAULT_MEMBER_GROUP_ID]);

export const DASHBOARD_PERMISSION_KEYS = [
  "dashboard.view",
  "applications.view",
  "applications.manage",
  "applications.sensitive.view",
  "discord.embeds.manage",
  "discord.rules.manage",
  "raids.view",
  "raids.manage",
  "raids.roster.view",
  "guild.roster.view",
  "profiles.view",
  "profiles.access.view",
  "rules.stats.view",
  "content.manage",
  "groups.view",
  "groups.manage",
] as const;

export type DashboardPermissionKey = typeof DASHBOARD_PERMISSION_KEYS[number];

export type AccessGroup = {
  id: string;
  name: string;
  role: DashboardRole;
  rank: number;
  lockedId: boolean;
  protectedGroup: boolean;
  discordRoleIds: string[];
  permissions: DashboardPermissionKey[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export const PERMISSION_META: Record<DashboardPermissionKey, { title: string; description: string; category: string }> = {
  "dashboard.view": { title: "Вхід у панель", description: "Дозволяє користувачу заходити в dashboard.", category: "База" },
  "applications.view": { title: "Перегляд заявок", description: "Показує сторінку заявок до гільдії.", category: "Заявки" },
  "applications.manage": { title: "Керування заявками", description: "Дозволяє приймати, відхиляти та міняти статуси.", category: "Заявки" },
  "applications.sensitive.view": { title: "BattleTag і приватні поля", description: "Показує BattleTag та контактні поля в заявках.", category: "Заявки" },
  "discord.embeds.manage": { title: "Discord оголошення", description: "Створення та публікація звичайних Discord-повідомлень.", category: "Discord" },
  "discord.rules.manage": { title: "Discord правила", description: "Керування повідомленнями правил і кнопками прийняття.", category: "Discord" },
  "raids.view": { title: "Перегляд рейдів", description: "Доступ до списку рейдів і власного запису.", category: "Рейди" },
  "raids.manage": { title: "Керування рейдами", description: "Створення, редагування, публікація та закриття рейдів.", category: "Рейди" },
  "raids.roster.view": { title: "Склад рейду", description: "Показує повний склад, ролі та службові дані рейду.", category: "Рейди" },
  "guild.roster.view": { title: "Склад гільдії", description: "Перегляд гільдійного roster, класів, ролей, ilvl і Raider.IO.", category: "Гільдія" },
  "profiles.view": { title: "Профілі учасників", description: "Перегляд каталогу профілів інших учасників.", category: "Профілі" },
  "profiles.access.view": { title: "Дані доступу профілю", description: "Показує службові блоки доступу в профілях.", category: "Профілі" },
  "rules.stats.view": { title: "Статистика правил", description: "Перегляд статистики прийняття правил.", category: "Discord" },
  "content.manage": { title: "Новини та гайди", description: "Керування матеріалами сайту.", category: "Контент" },
  "groups.view": { title: "Перегляд груп", description: "Доступ до сторінки груп і прав.", category: "Адміністрування" },
  "groups.manage": { title: "Керування групами", description: "Додавання груп, зміна назв, однієї Discord-ролі та прав.", category: "Адміністрування" },
};
