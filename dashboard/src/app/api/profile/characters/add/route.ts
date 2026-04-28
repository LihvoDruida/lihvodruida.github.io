import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { BNET_CANDIDATES_COOKIE, findCandidateByKey, removeCandidateFromCookie } from "@/lib/battlenetCandidates";
import { addProfileCharacter } from "@/lib/profiles";
import { characterAddStatusFromError } from "@/lib/profileCharacterStatus";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, verifyTrustedOrigin } from "@/lib/security";

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
  const characterKey = String(form.get("characterKey") || "").trim().toLowerCase();
  if (!characterKey) {
    logDashboardEvent("warn", "profile.character.add_invalid_request", request, { profileId: session.profileId });
    return redirectToProfile(request, session.profileId, "character_add_invalid");
  }

  const store = await cookies();
  const candidateCookie = store.get(BNET_CANDIDATES_COOKIE)?.value || "";
  const candidate = findCandidateByKey(candidateCookie, session.profileId, characterKey);

  if (!candidate) {
    logDashboardEvent("warn", "profile.character.add_missing_reauth", request, { profileId: session.profileId, characterKey });
    return redirectToProfile(request, session.profileId, "character_reauth_required");
  }

  try {
    const result = await addProfileCharacter(session.profileId, candidate);
    if (!result.added) {
      const status = result.reason === "duplicate" ? "character_add_duplicate" : "character_add_limit";
      logDashboardEvent("warn", "profile.character.add_skipped", request, { profileId: session.profileId, characterKey, reason: result.reason });
      return redirectToProfile(request, session.profileId, status);
    }

    logDashboardEvent("info", "profile.character.added", request, { profileId: session.profileId, characterKey });
    const response = redirectToProfile(request, session.profileId, "character_added");
    removeCandidateFromCookie(response, candidateCookie, session.profileId, characterKey);
    return response;
  } catch (error) {
    const status = characterAddStatusFromError(error);
    logDashboardEvent("warn", "profile.character.add_failed", request, { profileId: session.profileId, characterKey, status, message: safeErrorMessage(error) });
    return redirectToProfile(request, session.profileId, status);
  }
}
