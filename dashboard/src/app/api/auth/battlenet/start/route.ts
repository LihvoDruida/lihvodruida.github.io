import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { randomState } from "@/lib/oauth";
import { BNET_OAUTH_STATE_COOKIE, buildBattleNetOAuthUrl, getEnabledBattleNetRegions, normalizeBattleNetRegion } from "@/lib/battlenet";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders } from "@/lib/security";


function safeNextPath(value: string | null) {
  const path = String(value || "").trim();
  if (!path || path.length > 1500) return "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (path === "/" || /^\/(?:profile|rules\/accept)(?:[/?#]|$)/.test(path)) return path;
  return "";
}

function encodeNextPath(path: string) {
  return Buffer.from(path, "utf8").toString("base64url");
}

function redirectWithNoStore(target: string) {
  const response = NextResponse.redirect(target, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return redirectWithNoStore(new URL("/login", request.url).toString());

  logDashboardEvent("info", "auth.battlenet.start", request, { profileId: session.profileId, role: session.role });

  const ip = getClientIp(request);
  const limit = checkRateLimit(`battlenet-oauth-start:${session.profileId || session.id}:${ip}`, 12, 10 * 60 * 1000);
  if (!limit.ok) {
    return redirectWithNoStore(new URL(`/profile/${session.profileId || ""}?characterStatus=rate_limit`, request.url).toString());
  }

  const url = new URL(request.url);
  const requestedRegion = normalizeBattleNetRegion(url.searchParams.get("region"));
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const enabledRegions = getEnabledBattleNetRegions();
  const region = enabledRegions.includes(requestedRegion) ? requestedRegion : enabledRegions[0];
  const state = `${randomState()}.${region}.${session.profileId || session.id}${nextPath ? `.${encodeNextPath(nextPath)}` : ""}`;
  const store = await cookies();
  store.set(BNET_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return redirectWithNoStore(buildBattleNetOAuthUrl(state, region));
}
