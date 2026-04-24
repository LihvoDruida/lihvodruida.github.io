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

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (secret.length < 16) {
    throw new Error("SESSION_SECRET must be set and at least 16 characters long.");
  }
  return secret;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createSessionToken(session: DashboardSession) {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
    ...session,
    iat: Date.now(),
  })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token?: string | null): Promise<DashboardSession | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(payload);
  if (expected !== sig) return null;

  try {
    const raw = decodeURIComponent(escape(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))));
    const parsed = JSON.parse(raw);
    if (parsed.role !== "admin" && parsed.role !== "moderator") return null;
    return {
      provider: parsed.provider,
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
