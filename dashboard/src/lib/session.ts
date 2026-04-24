import { cookies } from "next/headers";

export type DashboardRole = "admin" | "moderator";

export type DashboardSession = {
  provider: "discord" | "github" | "token";
  id: string;
  name: string;
  role: DashboardRole;
  avatar?: string | null;
};

const SESSION_COOKIE = "mistblossom_dashboard_session";

function secret() {
  const value = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (value.length < 16) throw new Error("SESSION_SECRET must be set and at least 16 characters long.");
  return value;
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJson(value: unknown) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeJson<T>(value: string): T {
  return JSON.parse(decodeURIComponent(escape(atob(value.replace(/-/g, "+").replace(/_/g, "/")))));
}

async function sign(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64url(new Uint8Array(sig));
}

export async function createSessionToken(session: DashboardSession) {
  const payload = encodeJson({ ...session, iat: Date.now() });
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token?: string | null): Promise<DashboardSession | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if ((await sign(payload)) !== signature) return null;

  try {
    const parsed = decodeJson<any>(payload);
    if (parsed.role !== "admin" && parsed.role !== "moderator") return null;
    return {
      provider: parsed.provider || "discord",
      id: String(parsed.id || ""),
      name: String(parsed.name || "Moderator"),
      role: parsed.role,
      avatar: parsed.avatar || null,
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
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
