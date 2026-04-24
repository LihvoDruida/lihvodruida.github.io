export type DashboardAccessConfig = {
  guildId: string;
  adminRoleIds: string[];
  moderatorRoleIds: string[];
  viewerRoleIds: string[];
};

function splitIds(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{5,32}$/.test(item));
}

export function getAccessConfig(): DashboardAccessConfig {
  return {
    guildId: process.env.DISCORD_GUILD_ID || "",
    adminRoleIds: splitIds(process.env.DISCORD_ADMIN_ROLE_IDS),
    moderatorRoleIds: splitIds(process.env.DISCORD_MODERATOR_ROLE_IDS),
    viewerRoleIds: splitIds(process.env.DISCORD_VIEWER_ROLE_IDS),
  };
}

export function roleFromDiscordRoles(
  memberRoleIds: string[],
  config: DashboardAccessConfig
): "admin" | "moderator" | "viewer" | null {
  const roles = new Set(memberRoleIds.map(String));

  if (config.adminRoleIds.some((id) => roles.has(id))) return "admin";
  if (config.moderatorRoleIds.some((id) => roles.has(id))) return "moderator";
  if (config.viewerRoleIds.some((id) => roles.has(id))) return "viewer";

  return null;
}
