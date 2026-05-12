import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getDashboardUrl } from "@/lib/oauth";
import { BNET_OAUTH_STATE_COOKIE, exchangeBattleNetCode, fetchBattleNetGuildCharacters, fetchBattleNetUserInfo, normalizeBattleNetRegion } from "@/lib/battlenet";
import { clearBattleNetCandidatesCookie, setBattleNetCandidatesCookie } from "@/lib/battlenetCandidates";
import { saveBattleNetSyncState, upsertProfileFromSession } from "@/lib/profiles";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders, safeErrorMessage } from "@/lib/security";


function getOAuthStateParts(state: string) {
  return String(state || "").split(".");
}

function getRegionFromOAuthState(state: string) {
  const parts = getOAuthStateParts(state);
  return normalizeBattleNetRegion(parts.length >= 3 ? parts[1] : null);
}

function safeNextPath(value: string | null | undefined) {
  const path = String(value || "").trim();
  if (!path || path.length > 1500) return "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (path === "/" || /^\/(?:profile|rules\/accept)(?:[/?#]|$)/.test(path)) return path;
  return "";
}

function getNextPathFromOAuthState(state: string) {
  const parts = getOAuthStateParts(state);
  const encoded = parts.length >= 4 ? parts.slice(3).join(".") : "";
  if (!encoded) return "";
  try {
    return safeNextPath(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return "";
  }
}

function redirectToProfile(profileId: string, status: string, nextPath = "") {
  const targetPath = safeNextPath(nextPath);
  const target = targetPath ? new URL(`${getDashboardUrl()}${targetPath}`) : new URL(`${getDashboardUrl()}/profile/${profileId}`);
  target.searchParams.set("characterStatus", status);
  const response = NextResponse.redirect(target.toString(), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.profileId) {
    return NextResponse.redirect(`${getDashboardUrl()}/login?error=session_required`, 303);
  }

  logDashboardEvent("info", "auth.battlenet.callback", request, { profileId: session.profileId });

  const ip = getClientIp(request);
  const limit = checkRateLimit(`battlenet-oauth-callback:${session.profileId}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return redirectToProfile(session.profileId, "rate_limit");

  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  const store = await cookies();
  const expectedState = store.get(BNET_OAUTH_STATE_COOKIE)?.value || "";
  store.delete(BNET_OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    logDashboardEvent("warn", "auth.battlenet.callback.state_mismatch", request, { profileId: session.profileId, hasCode: Boolean(code), hasState: Boolean(state), hasExpectedState: Boolean(expectedState) });
    return redirectToProfile(session.profileId, "bnet_state");
  }

  try {
    await upsertProfileFromSession(session);
    const region = getRegionFromOAuthState(state);
    const token = await exchangeBattleNetCode(code, region);
    const [scan, account] = await Promise.all([
      fetchBattleNetGuildCharacters(token.access_token, region),
      fetchBattleNetUserInfo(token.access_token, region).catch(() => null),
    ]);
    await saveBattleNetSyncState(session.profileId, scan, account);

    logDashboardEvent("info", "auth.battlenet.callback.success", request, {
      profileId: session.profileId,
      region: scan.region,
      totalCharacters: scan.totalCharacters,
      scannedCharacters: scan.scannedCharacters,
      eligibleCharacters: scan.eligibleCharacters,
      guildCharacters: scan.guildCharacters,
      otherCharacters: scan.otherCharacters,
      concurrency: scan.concurrency,
      failedCharacters: scan.failedCharacters,
      fallbackCharacters: scan.fallbackCharacters,
      durationMs: scan.durationMs,
    });

    const response = redirectToProfile(session.profileId, scan.characters.length ? "bnet_connected" : "bnet_no_characters", getNextPathFromOAuthState(state));
    try {
      if (scan.characters.length) {
        setBattleNetCandidatesCookie(response, session.profileId, scan.region, scan.characters);
      } else {
        clearBattleNetCandidatesCookie(response);
      }
    } catch (cookieError) {
      // Cookie is only a small fallback now; the full candidate list is stored in the profile.
      clearBattleNetCandidatesCookie(response);
      logDashboardEvent("warn", "auth.battlenet.callback.cookie_fallback_failed", request, { profileId: session.profileId, message: safeErrorMessage(cookieError) });
    }
    return response;
  } catch (error) {
    logDashboardEvent("error", "auth.battlenet.callback.failed", request, { profileId: session.profileId, message: safeErrorMessage(error) });
    return redirectToProfile(session.profileId, "bnet_failed", getNextPathFromOAuthState(state));
  }
}
