import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { profileGenderLabel, setProfileGrammaticalGender } from "@/lib/profiles";
import { syncRaidSignupGenderForProfile } from "@/lib/raids";
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
  const limit = checkRateLimit(`profile-gender:${session.profileId}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  const form = await request.formData();
  const grammaticalGender = String(form.get("grammaticalGender") || "male").trim().toLowerCase();

  try {
    const savedGender = await setProfileGrammaticalGender(session.profileId, grammaticalGender);
    const syncResult = await syncRaidSignupGenderForProfile({
      profileId: session.profileId,
      provider: session.provider,
      providerUserId: session.id,
      grammaticalGender: savedGender,
    }).catch((syncError) => {
      logDashboardEvent("warn", "profile.gender.raid_sync_failed", request, { profileId: session.profileId, message: safeErrorMessage(syncError) });
      return null;
    });
    logDashboardEvent("info", "profile.gender.saved", request, { profileId: session.profileId, grammaticalGender: savedGender, label: profileGenderLabel(savedGender), syncResult });
    return redirectToProfile(request, session.profileId, "profile_gender_saved");
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "profile.gender.failed", request, { profileId: session.profileId, message });
    return redirectToProfile(request, session.profileId, "profile_gender_failed");
  }
}
