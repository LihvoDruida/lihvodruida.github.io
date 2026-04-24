export type DashboardRole = "admin" | "moderator";

export type DiscordUser = {
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type DashboardSession = {
  provider: "discord";
  id: string;
  name: string;
  role: DashboardRole;
  avatar?: string | null;
};

function splitIds(value?: string): Set<string> {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function resolveDashboardRole(roleIds: string[]): DashboardRole | null {
  const roles = new Set(roleIds.map(String));
  const adminRoles = splitIds(process.env.DISCORD_ADMIN_ROLE_IDS);
  const moderatorRoles = splitIds(process.env.DISCORD_MODERATOR_ROLE_IDS);

  for (const role of adminRoles) {
    if (roles.has(role)) return "admin";
  }

  for (const role of moderatorRoles) {
    if (roles.has(role)) return "moderator";
  }

  return null;
}

export function assertCanModerate(session: DashboardSession | null): asserts session is DashboardSession {
  if (!session || (session.role !== "admin" && session.role !== "moderator")) {
    throw new Error("Access denied");
  }
}

export function assertAdmin(session: DashboardSession | null): asserts session is DashboardSession {
  if (!session || session.role !== "admin") {
    throw new Error("Admin access required");
  }
}
