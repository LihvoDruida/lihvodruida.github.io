import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addGuildMemberRoles, fetchDiscordGuildSnapshot, getDiscordGuildId, updateGuildMemberNickname } from "@/lib/discordAdmin";
import { buildProfileDiscordNicknamePlan, getProfileById, markProfileDiscordNicknameSynced } from "@/lib/profiles";
import { markRulesOnboardingCompleted, parseRulesRoleToken, rulesOnboardingStatus } from "@/lib/rulesOnboarding";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, verifyTrustedOrigin } from "@/lib/security";

function redirectTo(request: NextRequest, status: string) {
  const response = NextResponse.redirect(new URL(`/rules/accept?status=${encodeURIComponent(status)}`, request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

function redirectToToken(request: NextRequest, token: string, status: string) {
  const url = new URL("/rules/accept", request.url);
  if (token) url.searchParams.set("rt", token);
  url.searchParams.set("status", status);
  const response = NextResponse.redirect(url, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse();
  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session?.profileId) return NextResponse.redirect(new URL("/login?error=session_required", request.url), 303);

  const ip = getClientIp(request);
  const limit = checkRateLimit(`rules-accept-complete:${session.profileId}:${ip}`, 10, 10 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  const form = await request.formData();
  const token = String(form.get("rt") || "").trim();
  const roleIds = parseRulesRoleToken(token);
  if (!roleIds.length) return redirectToToken(request, token, "missing_role_token");

  try {
    const profile = await getProfileById(session.profileId);
    const onboarding = rulesOnboardingStatus(profile);
    if (!profile || !onboarding.complete) {
      logDashboardEvent("warn", "rules.onboarding.incomplete", request, { profileId: session.profileId, missing: onboarding.missing.map((step) => step.key) });
      return redirectToToken(request, token, "incomplete");
    }
    if (profile.provider !== "discord" || !/^\d{16,25}$/.test(profile.providerUserId)) {
      return redirectToToken(request, token, "not_discord_profile");
    }

    const guildId = getDiscordGuildId();
    if (!guildId) return redirectToToken(request, token, "discord_not_configured");

    const guild = await fetchDiscordGuildSnapshot().catch(() => null);
    const nicknamePlan = buildProfileDiscordNicknamePlan(profile);
    const nickname = nicknamePlan.value;
    let nicknameSynced = false;

    if (nickname && guild?.ownerId !== profile.providerUserId) {
      try {
        await updateGuildMemberNickname({
          guildId,
          userId: profile.providerUserId,
          nickname,
          reason: `Mistblossom rules registration nickname: ${profile.profileId}`,
        });
        await markProfileDiscordNicknameSynced(profile.profileId, nickname, nicknamePlan).catch(() => null);
        nicknameSynced = true;
      } catch (error) {
        logDashboardEvent("warn", "rules.onboarding.nickname_failed", request, { profileId: profile.profileId, message: safeErrorMessage(error) });
      }
    }

    await addGuildMemberRoles({
      guildId,
      userId: profile.providerUserId,
      roleIds,
      reason: `Rules onboarding completed by ${profile.displayName || profile.providerUserId}`,
    });
    await markRulesOnboardingCompleted(profile.profileId, { roleIds, nickname: nicknameSynced ? nickname : null });

    logDashboardEvent("info", "rules.onboarding.completed", request, { profileId: profile.profileId, roles: roleIds.length, nicknameSynced });
    return redirectToToken(request, token, nicknameSynced ? "completed" : "completed_nickname_manual");
  } catch (error) {
    logDashboardEvent("error", "rules.onboarding.complete_failed", request, { profileId: session.profileId, message: safeErrorMessage(error) });
    return redirectTo(request, "failed");
  }
}
