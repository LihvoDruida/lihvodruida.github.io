import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAUTH_STATE_COOKIE } from "@/lib/auth";
import { buildDiscordOAuthUrl, randomState } from "@/lib/oauth";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders } from "@/lib/security";

const LOGIN_NEXT_COOKIE = "__Host-mistblossom_next";

function safeNextPath(value: string | null) {
  const path = String(value || "").trim();
  if (!path || path.length > 1500) return "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (path === "/" || /^\/(?:raids|profile|rules\/accept)(?:[/?#]|$)/.test(path)) return path;
  return "";
}

export async function GET(request: NextRequest) {
  logDashboardEvent("info", "auth.discord.start", request);

  const ip = getClientIp(request);
  const limit = checkRateLimit(`discord-oauth-start:${ip}`, 20, 10 * 60 * 1000);

  if (!limit.ok) {
    logDashboardEvent("warn", "auth.discord.start.rate_limited", request, { resetAt: limit.resetAt });
    const response = NextResponse.redirect(new URL("/login?error=rate_limit", request.url), 303);
    for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
    return response;
  }

  const state = randomState();
  const nextPath = safeNextPath(new URL(request.url).searchParams.get("next"));
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  if (nextPath) {
    store.set(LOGIN_NEXT_COOKIE, nextPath, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
  } else {
    store.delete(LOGIN_NEXT_COOKIE);
  }

  const response = NextResponse.redirect(buildDiscordOAuthUrl(state));
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}
