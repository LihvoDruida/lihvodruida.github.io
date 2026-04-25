import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAUTH_STATE_COOKIE } from "@/lib/auth";
import { buildDiscordOAuthUrl, randomState } from "@/lib/oauth";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders } from "@/lib/security";

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
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  const response = NextResponse.redirect(buildDiscordOAuthUrl(state));
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}
