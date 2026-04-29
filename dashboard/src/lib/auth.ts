import { cookies } from "next/headers";

export type DashboardRole = "admin" | "moderator" | "member";

export type DashboardSession = {
  provider: "discord" | "github" | "token";
  id: string;
  name: string;
  login?: string;
  role: DashboardRole;
  profileId?: string;
  avatar?: string | null;
  avatar_url?: string | null;
  discordRoleIds?: string[];
};

export type SessionUser = DashboardSession;

export const SESSION_COOKIE = "__Host-mistblossom_dashboard_session";
export const LEGACY_SESSION_COOKIE = "mistblossom_dashboard_session";
export const OAUTH_STATE_COOKIE = "__Host-mistblossom_oauth_state";
export const LEGACY_OAUTH_STATE_COOKIE = "mistblossom_oauth_state";
const SESSION_AUDIENCE = "mistblossom-dashboard";
function getSessionMaxAgeSeconds() {
  const parsed = Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 24 * 7);
  if (!Number.isFinite(parsed) || parsed < 60 * 30) return 60 * 60 * 24 * 7;
  return Math.min(Math.floor(parsed), 60 * 60 * 24 * 30);
}

const SESSION_MAX_AGE_SECONDS = getSessionMaxAgeSeconds();

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long.");
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

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createStableProfileId(provider: string, providerUserId: string) {
  const cleanProvider = String(provider || "discord").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "discord";
  const cleanUserId = String(providerUserId || "").trim();
  if (!cleanUserId) throw new Error("Cannot create profile id without user id.");

  const secret = process.env.PROFILE_ID_SECRET || getSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${cleanProvider}:${cleanUserId}`));
  return `id${bytesToHex(new Uint8Array(signature)).slice(0, 24)}`;
}

function normalizeSessionPayload(parsed: any): DashboardSession | null {
  if (!parsed || parsed.aud !== SESSION_AUDIENCE) return null;
  if (parsed.role !== "admin" && parsed.role !== "moderator" && parsed.role !== "member") return null;

  const id = String(parsed.id || "").trim();
  if (!id) return null;

  const issuedAt = Number(parsed.iat || 0);
  const expiresAt = Number(parsed.exp || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  if (issuedAt > now + 60) return null;
  if (expiresAt <= now) return null;

  return {
    provider: parsed.provider === "github" || parsed.provider === "token" ? parsed.provider : "discord",
    id,
    name: String(parsed.name || "Moderator").slice(0, 120),
    login: parsed.login ? String(parsed.login).slice(0, 120) : undefined,
    role: parsed.role,
    profileId: typeof parsed.profileId === "string" && /^id[a-f0-9]{16,40}$/.test(parsed.profileId) ? parsed.profileId : undefined,
    avatar: parsed.avatar || null,
    avatar_url: parsed.avatar_url || parsed.avatar || null,
    discordRoleIds: Array.isArray(parsed.discordRoleIds)
      ? parsed.discordRoleIds.map((roleId: unknown) => String(roleId || "").trim()).filter(Boolean).slice(0, 100)
      : [],
  };
}

export async function createSessionToken(session: DashboardSession) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      aud: SESSION_AUDIENCE,
      provider: session.provider,
      id: session.id,
      name: session.name,
      login: session.login,
      role: session.role,
      profileId: session.profileId || (await createStableProfileId(session.provider, session.id)),
      avatar: session.avatar || null,
      avatar_url: session.avatar_url || session.avatar || null,
      discordRoleIds: Array.from(new Set((session.discordRoleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean))).slice(0, 100),
      iat: now,
      exp: now + SESSION_MAX_AGE_SECONDS,
    })
  );

  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token?: string | null): Promise<DashboardSession | null> {
  if (!token || !token.includes(".")) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = await sign(payload);
  if (!constantTimeEqual(expected, signature)) return null;

  try {
    return normalizeSessionPayload(JSON.parse(base64UrlDecode(payload)));
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DashboardSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value || store.get(LEGACY_SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function setSession(session: DashboardSession) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  store.delete(LEGACY_SESSION_COOKIE);
}

export async function clearSession() {
  const store = await cookies();
  const secureCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  const legacyCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };

  store.set(SESSION_COOKIE, "", secureCookieOptions);
  store.set(LEGACY_SESSION_COOKIE, "", legacyCookieOptions);
  store.set(OAUTH_STATE_COOKIE, "", secureCookieOptions);
  store.set(LEGACY_OAUTH_STATE_COOKIE, "", legacyCookieOptions);
}

function splitIds(value?: string): Set<string> {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function removeAmbiguousRoleIds(...sets: Set<string>[]) {
  const counts = new Map<string, number>();
  for (const set of sets) {
    for (const roleId of set) counts.set(roleId, (counts.get(roleId) || 0) + 1);
  }

  return sets.map((set) => new Set(Array.from(set).filter((roleId) => counts.get(roleId) === 1)));
}

export function resolveDashboardRole(roleIds: string[]): DashboardRole | null {
  const roles = new Set(roleIds.map((roleId) => String(roleId || "").trim()).filter(Boolean));
  const rawAdminRoles = splitIds(process.env.DISCORD_ADMIN_ROLE_IDS);
  const rawModeratorRoles = splitIds(process.env.DISCORD_MODERATOR_ROLE_IDS);
  const rawMemberRoles = splitIds(process.env.DISCORD_MEMBER_ROLE_IDS);
  const [adminRoles, moderatorRoles, memberRoles] = removeAmbiguousRoleIds(rawAdminRoles, rawModeratorRoles, rawMemberRoles);

  for (const role of adminRoles) {
    if (roles.has(role)) return "admin";
  }

  for (const role of moderatorRoles) {
    if (roles.has(role)) return "moderator";
  }

  for (const role of memberRoles) {
    if (roles.has(role)) return "member";
  }

  if (!rawMemberRoles.size && ["1", "true", "yes", "on"].includes(String(process.env.DISCORD_ALLOW_GUILD_MEMBERS || "").toLowerCase())) {
    return "member";
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
    const verified = await verifyToken(session);
    if (!verified) {
      throw new Error("Invalid dashboard token.");
    }
    return createSessionToken(verified);
  }

  return createSessionToken({
    provider: session.provider || "token",
    id: String(session.id || "local"),
    name: String(session.name || session.login || "Local admin"),
    login: session.login || session.name || "Local admin",
    role: session.role === "moderator" ? "moderator" : session.role === "member" ? "member" : "admin",
    avatar: session.avatar || null,
    avatar_url: session.avatar_url || session.avatar || null,
    discordRoleIds: session.discordRoleIds || [],
  });
}

export async function verifyToken(token: string) {
  const expected = String(process.env.ADMIN_DASHBOARD_TOKEN || "").trim();
  const provided = String(token || "").trim();
  if (!expected || !provided) return null;

  const [expectedHash, providedHash] = await Promise.all([
    sha256Base64Url(expected),
    sha256Base64Url(provided),
  ]);

  if (!constantTimeEqual(expectedHash, providedHash)) return null;

  return {
    provider: "token",
    id: "emergency-token",
    name: "Emergency Admin",
    login: "Emergency Admin",
    role: "admin",
    discordRoleIds: [],
  } satisfies DashboardSession;
}
