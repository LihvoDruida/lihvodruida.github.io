import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getDashboardUrl } from "@/lib/oauth";
import { BNET_OAUTH_STATE_COOKIE, exchangeBattleNetCode, fetchBattleNetGuildCharacters, fetchBattleNetUserInfo, normalizeBattleNetRegion } from "@/lib/battlenet";
import { clearBattleNetCandidatesCookie, setBattleNetCandidatesCookie } from "@/lib/battlenetCandidates";
import { saveBattleNetSyncState, upsertProfileFromSession } from "@/lib/profiles";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders, safeErrorMessage } from "@/lib/security";


function getRegionFromOAuthState(state: string) {
  const parts = String(state || "").split(".");
  return normalizeBattleNetRegion(parts.length >= 3 ? parts[1] : null);
}

function redirectToProfile(profileId: string, status: string) {
  const response = NextResponse.redirect(`${getDashboardUrl()}/profile/${profileId}?characterStatus=${encodeURIComponent(status)}`, 303);
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
      durationMs: scan.durationMs,
    });

    const response = redirectToProfile(session.profileId, scan.eligibleCharacters ? "bnet_connected" : "bnet_no_guild_characters");
    if (scan.characters.length) {
      setBattleNetCandidatesCookie(response, session.profileId, scan.region, scan.characters);
    } else {
      clearBattleNetCandidatesCookie(response);
    }
    return response;
  } catch (error) {
    logDashboardEvent("error", "auth.battlenet.callback.failed", request, { profileId: session.profileId, message: safeErrorMessage(error) });
    return redirectToProfile(session.profileId, "bnet_failed");
  }
}
