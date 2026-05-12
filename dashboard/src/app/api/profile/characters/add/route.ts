import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { BNET_CANDIDATES_COOKIE, findCandidateByKey, removeCandidateFromCookie } from "@/lib/battlenetCandidates";
import { addProfileCharacter, getProfileBattleNetCandidates, removeProfileBattleNetCandidates } from "@/lib/profiles";
import { characterAddStatusFromError } from "@/lib/profileCharacterStatus";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, verifyTrustedOrigin } from "@/lib/security";
import { normalizeCharacterKey } from "@/lib/wowCharacters";

function redirectToProfile(request: NextRequest, profileId: string, status: string) {
  const response = NextResponse.redirect(new URL(`/profile/${profileId}?characterStatus=${encodeURIComponent(status)}`, request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse();

  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session?.profileId) return NextResponse.redirect(new URL("/login", request.url), 303);

  const ip = getClientIp(request);
  const limit = checkRateLimit(`profile-character-add:${session.profileId}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  const form = await request.formData();
  const characterKey = normalizeCharacterKey(form.get("characterKey"));
  if (!characterKey) {
    logDashboardEvent("warn", "profile.character.add_invalid_request", request, { profileId: session.profileId });
    return redirectToProfile(request, session.profileId, "character_add_invalid");
  }

  const store = await cookies();
  const candidateCookie = store.get(BNET_CANDIDATES_COOKIE)?.value || "";
  const storedCandidates = await getProfileBattleNetCandidates(session.profileId).catch(() => []);
  const candidate = storedCandidates.find((item) => normalizeCharacterKey(item.key) === characterKey)
    || findCandidateByKey(candidateCookie, session.profileId, characterKey);

  if (!candidate) {
    logDashboardEvent("warn", "profile.character.add_missing_reauth", request, { profileId: session.profileId, characterKey });
    return redirectToProfile(request, session.profileId, "character_reauth_required");
  }

  try {
    const result = await addProfileCharacter(session.profileId, candidate);
    if (!result.added) {
      logDashboardEvent("warn", "profile.character.add_skipped", request, { profileId: session.profileId, characterKey, reason: result.reason });
      return redirectToProfile(request, session.profileId, "character_add_duplicate");
    }

    logDashboardEvent("info", "profile.character.added", request, { profileId: session.profileId, characterKey });
    const response = redirectToProfile(request, session.profileId, "character_added");
    await removeProfileBattleNetCandidates(session.profileId, [characterKey]).catch((cleanupError) => {
      logDashboardEvent("warn", "profile.character.candidate_cleanup_failed", request, { profileId: session.profileId, characterKey, message: safeErrorMessage(cleanupError) });
    });
    removeCandidateFromCookie(response, candidateCookie, session.profileId, characterKey);
    return response;
  } catch (error) {
    const status = characterAddStatusFromError(error);
    logDashboardEvent("warn", "profile.character.add_failed", request, { profileId: session.profileId, characterKey, status, message: safeErrorMessage(error) });
    return redirectToProfile(request, session.profileId, status);
  }
}
