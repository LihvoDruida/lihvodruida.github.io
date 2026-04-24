import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const COOKIE_NAME = "mbv_dashboard_session";
const OAUTH_STATE_COOKIE = "mbv_dashboard_oauth_state";
const MAX_AGE_SECONDS = 60 * 60 * 8;
const STATE_MAX_AGE_SECONDS = 60 * 10;

export type AdminRole = "admin" | "moderator" | "unauthorized";

export type AdminUser = {
  provider: "github" | "discord" | "token";
  id: string;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  role?: AdminRole;
  role_source?: "discord-role" | "emergency-token";
  guild_id?: string;
  discord_role_ids?: string[];
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("SESSION_SECRET must be at least 24 characters.");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function encodePayload(data: unknown): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

function decodePayload<T>(value: string): T | null {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { return null; }
}

export function canModerate(user: Partial<AdminUser> | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "moderator";
}

export function isAdmin(user: Partial<AdminUser> | null | undefined): boolean {
  return user?.role === "admin";
}

export function verifyToken(input: string): boolean {
  const expected = process.env.ADMIN_DASHBOARD_TOKEN || process.env.ADMIN_PASSWORD || "";
  if (expected.length < 12) return false;
  return safeEqual(input, expected);
}

export function isAllowedAdmin(user: Partial<AdminUser>): boolean {
  return user.role === "admin" || user.role === "moderator" || user.role === "unauthorized";
}

export async function createSessionCookie(user: AdminUser = { provider: "token", id: "local", login: "Emergency admin", role: "admin", role_source: "emergency-token" }): Promise<void> {
  const role = user.role || (user.provider === "token" ? "admin" : undefined);
  if (!role) throw new Error("User has no dashboard role.");
  const payload = encodePayload({ user: { ...user, role }, createdAt: Date.now(), nonce: randomBytes(16).toString("base64url") });
  const value = `${payload}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<AdminUser | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value || "";
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload))) return null;

  const data = decodePayload<{ user?: AdminUser; createdAt?: number }>(payload);
  const createdAt = Number(data?.createdAt || 0);
  const ageMs = Date.now() - createdAt;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;

  return data?.user || null;
}

export async function isAuthenticated(): Promise<boolean> {
  return !!(await getSessionUser());
}

export async function createOAuthStateCookie(provider: "github" | "discord"): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const payload = encodePayload({ provider, state, createdAt: Date.now() });
  const value = `${payload}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS
  });
  return state;
}

export async function verifyOAuthState(provider: "github" | "discord", state: string): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(OAUTH_STATE_COOKIE)?.value || "";
  jar.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;

  const data = decodePayload<{ provider?: string; state?: string; createdAt?: number }>(payload);
  const ageMs = Date.now() - Number(data?.createdAt || 0);
  return data?.provider === provider && data?.state === state && Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= STATE_MAX_AGE_SECONDS * 1000;
}
