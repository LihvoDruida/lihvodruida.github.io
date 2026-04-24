import { cookies } from "next/headers";

export type DashboardRole = "admin" | "moderator";

export type DashboardSession = {
  provider: "discord" | "github" | "token";
  id: string;
  name: string;
  login?: string;
  role: DashboardRole;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type SessionUser = DashboardSession;

const SESSION_COOKIE = "mistblossom_dashboard_session";

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (secret.length < 16) {
    throw new Error("SESSION_SECRET must be set and at least 16 characters long.");
  }
  return secret;
}

function base64UrlEncode(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

async function sign(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createSessionToken(session: DashboardSession) {
  const payload = base64UrlEncode(
    JSON.stringify({
      ...session,
      iat: Date.now(),
    })
  );

  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token?: string | null): Promise<DashboardSession | null> {
  if (!token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = await sign(payload);
  if (expected !== signature) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    if (parsed.role !== "admin" && parsed.role !== "moderator") return null;

    return {
      provider: parsed.provider || "discord",
      id: String(parsed.id || ""),
      name: String(parsed.name || "Moderator"),
      role: parsed.role,
      avatar: parsed.avatar || null,
      avatar_url: parsed.avatar_url || parsed.avatar || null,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DashboardSession | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSession(session: DashboardSession) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

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

/**
 * Backward-compatible exports for older dashboard pages/routes.
 */
export async function isAuthenticated() {
  return !!(await getSession());
}

export async function getSessionUser() {
  return getSession();
}

export function canModerate(user: DashboardSession | null | undefined) {
  return !!user && (user.role === "admin" || user.role === "moderator");
}

export async function createSessionCookie(session: (Partial<DashboardSession> & { login?: string }) | string) {
  if (typeof session === "string") {
    const expected = String(process.env.ADMIN_DASHBOARD_TOKEN || "").trim();

    if (!expected || session !== expected) {
      throw new Error("Invalid dashboard token.");
    }

    return createSessionToken({
      provider: "token",
      id: "emergency-token",
      name: "Emergency Admin",
      login: "Emergency Admin",
      role: "admin",
    });
  }

  return createSessionToken({
    provider: session.provider || "token",
    id: String(session.id || "local"),
    name: String(session.name || session.login || "Local admin"),
    login: session.login || session.name || "Local admin",
    role: session.role === "moderator" ? "moderator" : "admin",
    avatar: session.avatar || null,
    avatar_url: session.avatar_url || session.avatar || null,
  });
}

export async function verifyToken(token: string) {
  const expected = String(process.env.ADMIN_DASHBOARD_TOKEN || "").trim();
  if (!expected || token !== expected) return null;

  return {
    provider: "token",
    id: "emergency-token",
    name: "Emergency Admin",
    role: "admin",
  } satisfies DashboardSession;
}
