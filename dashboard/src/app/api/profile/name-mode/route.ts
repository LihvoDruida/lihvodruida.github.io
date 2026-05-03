import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setProfilePublicNameMode } from "@/lib/profiles";
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
  const limit = checkRateLimit(`profile-name-mode:${session.profileId}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  const form = await request.formData();
  const publicNameMode = String(form.get("publicNameMode") || "name").trim();

  try {
    const savedMode = await setProfilePublicNameMode(session.profileId, publicNameMode);
    logDashboardEvent("info", "profile.name_mode.saved", request, { profileId: session.profileId, publicNameMode: savedMode });
    return redirectToProfile(request, session.profileId, "profile_name_mode_saved");
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "profile.name_mode.failed", request, { profileId: session.profileId, message });
    return redirectToProfile(request, session.profileId, "profile_name_failed");
  }
}
