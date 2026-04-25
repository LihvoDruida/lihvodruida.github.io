import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  getCanonicalDashboardOrigin,
  getRequestHost,
  isAllowedHost,
  isLocalHost,
  logDashboardEvent,
  noStoreHeaders,
  verifyTrustedOrigin,
} from "@/lib/security";

const isDevelopment = process.env.NODE_ENV !== "production";

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function contentSecurityPolicy(nonce: string) {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", isDevelopment ? "'unsafe-eval'" : ""]
    .filter(Boolean)
    .join(" ");

  const styleSrc = ["'self'", `'nonce-${nonce}'`, "'unsafe-inline'"].join(" ");
  const upgrade = isDevelopment ? "" : "upgrade-insecure-requests";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `script-src ${scriptSrc}`,
    `script-src-elem ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net https://render.worldofwarcraft.com https://cdnassets.raider.io https://raider.io",
    "font-src 'self' data:",
    "connect-src 'self' https://discord.com https://discordapp.com https://cdn.discordapp.com https://media.discordapp.net https://api.github.com https://raider.io https://*.raider.io https://render.worldofwarcraft.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' https:",
    "object-src 'none'",
    upgrade,
  ].filter(Boolean).join("; ");
}

function shouldRequireCloudflareProxy(host: string) {
  if (isDevelopment || isLocalHost(host)) return false;
  return String(process.env.SECURITY_REQUIRE_CLOUDFLARE || "").toLowerCase() === "true";
}

function hasCloudflareSignal(request: NextRequest) {
  return Boolean(
    request.headers.get("cf-ray") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("cf-visitor")
  );
}

export function middleware(request: NextRequest) {
  const host = getRequestHost(request);

  if (!isAllowedHost(host)) {
    logDashboardEvent("warn", "middleware.host_rejected", request, { blockedHost: host });

    if (request.method === "GET" || request.method === "HEAD") {
      const target = new URL(request.nextUrl.pathname + request.nextUrl.search, getCanonicalDashboardOrigin());
      return NextResponse.redirect(target, 308);
    }

    return new NextResponse("Blocked host", { status: 421, headers: noStoreHeaders() });
  }

  if (shouldRequireCloudflareProxy(host) && !hasCloudflareSignal(request)) {
    logDashboardEvent("warn", "middleware.cloudflare_required", request);
    return forbiddenResponse("Запит має проходити через Cloudflare.");
  }

  const isDiscordInteractionEndpoint = request.nextUrl.pathname === "/api/discord/interactions";

  if (!isDiscordInteractionEndpoint && !verifyTrustedOrigin(request)) {
    return forbiddenResponse("Недовірене джерело запиту.");
  }

  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Nonce", nonce);
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Vary", "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url");

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
