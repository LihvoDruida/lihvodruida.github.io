import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const COOKIE_NAME = "mbv_dashboard_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

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

export function verifyToken(input: string): boolean {
  const expected = process.env.ADMIN_DASHBOARD_TOKEN || "";
  if (expected.length < 12) return false;
  return safeEqual(input, expected);
}

export async function createSessionCookie(): Promise<void> {
  const now = Date.now();
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${now}.${nonce}`;
  const value = `${payload}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value || "";
  const parts = value.split(".");
  if (parts.length !== 3) return false;

  const [createdAt, nonce, signature] = parts;
  const payload = `${createdAt}.${nonce}`;
  if (!safeEqual(signature, sign(payload))) return false;

  const ageMs = Date.now() - Number(createdAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= MAX_AGE_SECONDS * 1000;
}
