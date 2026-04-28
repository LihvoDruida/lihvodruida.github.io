import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { BNET_CANDIDATES_COOKIE, findCandidateByKey, removeCandidateFromCookie } from "@/lib/battlenetCandidates";
import { addProfileCharacter } from "@/lib/profiles";
import { forbiddenResponse, logDashboardEvent, noStoreHeaders, safeErrorMessage, verifyTrustedOrigin } from "@/lib/security";

function redirectToProfile(request: NextRequest, profileId: string, status: string) {
  const response = NextResponse.redirect(new URL(`/profile/${profileId}?characterStatus=${encodeURIComponent(status)}`, request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse();

  const session = await getSession();
  if (!session?.profileId) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const characterKey = String(form.get("characterKey") || "");
  const store = await cookies();
  const candidateCookie = store.get(BNET_CANDIDATES_COOKIE)?.value || "";
  const candidate = findCandidateByKey(candidateCookie, session.profileId, characterKey);

  if (!candidate) {
    logDashboardEvent("warn", "profile.character.add_missing_reauth", request, { profileId: session.profileId, characterKey });
    return redirectToProfile(request, session.profileId, "character_reauth_required");
  }

  try {
    await addProfileCharacter(session.profileId, candidate);
    logDashboardEvent("info", "profile.character.added", request, { profileId: session.profileId, characterKey });
    const response = redirectToProfile(request, session.profileId, "character_added");
    removeCandidateFromCookie(response, candidateCookie, session.profileId, characterKey);
    return response;
  } catch (error) {
    logDashboardEvent("warn", "profile.character.add_failed", request, { profileId: session.profileId, characterKey, message: safeErrorMessage(error) });
    return redirectToProfile(request, session.profileId, "character_add_failed");
  }
}
