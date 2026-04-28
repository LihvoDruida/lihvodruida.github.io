import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { removeProfileCharacter } from "@/lib/profiles";
import { characterRemoveStatusFromError } from "@/lib/profileCharacterStatus";
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
  const limit = checkRateLimit(`profile-character-remove:${session.profileId}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  const form = await request.formData();
  const characterKey = String(form.get("characterKey") || "").trim().toLowerCase();

  try {
    await removeProfileCharacter(session.profileId, characterKey);
    logDashboardEvent("info", "profile.character.removed", request, { profileId: session.profileId, characterKey });
    return redirectToProfile(request, session.profileId, "character_removed");
  } catch (error) {
    const status = characterRemoveStatusFromError(error);
    logDashboardEvent("warn", "profile.character.remove_failed", request, { profileId: session.profileId, characterKey, status, message: safeErrorMessage(error) });
    return redirectToProfile(request, session.profileId, status);
  }
}
