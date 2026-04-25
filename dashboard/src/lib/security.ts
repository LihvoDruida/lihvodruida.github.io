import { NextRequest, NextResponse } from "next/server";
import { getDashboardUrl } from "@/lib/oauth";

const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;
const inMemoryBuckets = new Map<string, { count: number; resetAt: number }>();

type LogLevel = "debug" | "info" | "warn" | "error";

export function splitCsv(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envFlag(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
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

export function requestContext(request: Request | NextRequest) {
  let path = "unknown";
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = "unknown";
  }

  return {
    method: String(request.method || "GET").toUpperCase(),
    path,
    host: getRequestHost(request),
    ip: getClientIp(request),
    origin: request.headers.get("origin") || null,
    refererHost: (() => {
      const referer = request.headers.get("referer");
      if (!referer) return null;
      try {
        return new URL(referer).host.toLowerCase();
      } catch {
        return "invalid";
      }
    })(),
    secFetchSite: request.headers.get("sec-fetch-site") || null,
    cfRay: request.headers.get("cf-ray") || null,
    userAgent: (request.headers.get("user-agent") || "unknown").slice(0, 180),
  };
}

export function logDashboardEvent(
  level: LogLevel,
  event: string,
  request?: Request | NextRequest,
  details: Record<string, unknown> = {}
) {
  if (level === "debug" && !envFlag("DASHBOARD_DEBUG_LOGS") && !envFlag("SECURITY_DEBUG_LOGS")) {
    return;
  }

  const payload = {
    event,
    time: new Date().toISOString(),
    ...(request ? requestContext(request) : {}),
    ...details,
  };

  const line = `[dashboard:${level}] ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
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
    logDashboardEvent("warn", "request_body_too_large", request, { size, maxBytes });

    return NextResponse.json(
      { error: "Запит завеликий." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  return null;
}

function sameHostUrl(value: string | null, host: string) {
  if (!value) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const urlHost = url.host.toLowerCase();
  if (!isAllowedHost(urlHost) || urlHost !== host) return false;

  return url.protocol === "https:" || isLocalHost(urlHost);
}

export function verifyTrustedOrigin(request: Request | NextRequest) {
  const method = String(request.method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;

  const host = getRequestHost(request);
  const reject = (reason: string) => {
    logDashboardEvent("warn", "trusted_origin_rejected", request, { reason });
    return false;
  };

  if (!isAllowedHost(host)) return reject("host_not_allowed");

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    if (sameHostUrl(originHeader, host)) return true;
    return reject("origin_mismatch");
  }

  // Native form submits behind Cloudflare/Vercel can arrive without Origin.
  // Sec-Fetch-Site is set by modern browsers and still blocks cross-site form attacks.
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "same-origin") return true;

  // Last safe fallback for older browsers or stripped headers.
  // This works only when Referrer-Policy allows a Referer header.
  if (sameHostUrl(request.headers.get("referer"), host)) return true;

  // Local dev tools and local form posts are allowed only outside production.
  if (process.env.NODE_ENV !== "production" && isLocalHost(host)) return true;

  return reject(fetchSite ? `missing_origin_${fetchSite}` : "missing_origin");
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
