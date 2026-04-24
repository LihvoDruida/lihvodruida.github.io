import { AdminRole } from "./auth";

export type DashboardRole = "admin" | "moderator";

export type AccessConfig = {
  guildId: string;
  adminRoleIds: string[];
  moderatorRoleIds: string[];
};

function splitIds(value?: string): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getAccessConfig(): Promise<AccessConfig> {
  return {
    guildId: String(process.env.DISCORD_GUILD_ID || "").trim(),
    adminRoleIds: splitIds(process.env.DISCORD_ADMIN_ROLE_IDS),
    moderatorRoleIds: splitIds(process.env.DISCORD_MODERATOR_ROLE_IDS),
  };
}

export function roleFromDiscordRoles(roleIds: string[], config: AccessConfig): AdminRole | null {
  const roles = new Set(roleIds.map(String));

  if (config.adminRoleIds.some((roleId) => roles.has(roleId))) {
    return "admin";
  }

  if (config.moderatorRoleIds.some((roleId) => roles.has(roleId))) {
    return "moderator";
  }

  return null;
}

export function resolveDashboardRole(roleIds: string[]): DashboardRole | null {
  const roles = new Set(roleIds.map(String));
  const adminRoles = splitIds(process.env.DISCORD_ADMIN_ROLE_IDS);
  const moderatorRoles = splitIds(process.env.DISCORD_MODERATOR_ROLE_IDS);

  if (adminRoles.some((roleId) => roles.has(roleId))) return "admin";
  if (moderatorRoles.some((roleId) => roles.has(roleId))) return "moderator";
  return null;
}

export function assertCanModerate(session: { role?: string } | null): void {
  if (!session || (session.role !== "admin" && session.role !== "moderator")) {
    throw new Error("Access denied");
  }
}

export function assertAdmin(session: { role?: string } | null): void {
  if (!session || session.role !== "admin") {
    throw new Error("Admin access required");
  }
}
