import { NextRequest, NextResponse } from "next/server";
import { getDashboardUrl } from "@/lib/oauth";

const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;
const inMemoryBuckets = new Map<string, { count: number; resetAt: number }>();

export function splitCsv(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAllowedDashboardHosts() {
  const configured = splitCsv(process.env.DASHBOARD_ALLOWED_HOSTS);
  const explicitDashboardUrl = process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL;

  if (!explicitDashboardUrl) {
    return configured;
  }

  try {
    const host = new URL(explicitDashboardUrl).host;
    return Array.from(new Set([...configured, host]));
  } catch {
    return configured;
  }
}

export function getCanonicalDashboardOrigin() {
  return new URL(getDashboardUrl()).origin;
}

export function getRequestHost(request: Request | NextRequest) {
  return String(request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

export function isLocalHost(host: string) {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}

export function isAllowedHost(host: string) {
  if (!host) return false;
  const normalized = host.toLowerCase();
  if (isLocalHost(normalized)) return process.env.NODE_ENV !== "production";

  const allowed = getAllowedDashboardHosts().map((item) => item.toLowerCase());
  return allowed.length === 0 ? true : allowed.includes(normalized);
}

export function getClientIp(request: Request | NextRequest) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";

  return request.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = inMemoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    inMemoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { ok: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Забагато запитів. Спробуй трохи пізніше." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    }
  );
}

export function assertRequestBodySize(request: Request | NextRequest, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const raw = request.headers.get("content-length");
  if (!raw) return null;

  const size = Number(raw);
  if (Number.isFinite(size) && size > maxBytes) {
    return NextResponse.json(
      { error: "Запит завеликий." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  return null;
}

export function verifyTrustedOrigin(request: Request | NextRequest) {
  const method = String(request.method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;

  const host = getRequestHost(request);
  if (!isAllowedHost(host)) return false;

  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if (origin.protocol !== "https:" && !isLocalHost(origin.host)) return false;
  return isAllowedHost(origin.host) && origin.host.toLowerCase() === host;
}

export function forbiddenResponse(message = "Запит заблоковано політикою безпеки.") {
  return NextResponse.json(
    { error: message },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}

export function unauthorizedResponse(message = "Потрібна авторизація.") {
  return NextResponse.json(
    { error: message },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export function safeErrorMessage(error: unknown, fallback = "Операція не виконана.") {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message) return fallback;

  return message
    .replace(/ghp_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/Bot\s+[A-Za-z0-9._-]+/g, "Bot [redacted]")
    .slice(0, 240);
}

export function noStoreHeaders(extra?: HeadersInit) {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    ...extra,
  };
}
