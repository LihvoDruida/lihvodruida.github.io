import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchDiscordGuildSnapshot, getDiscordGuildId, updateGuildMemberNickname } from "@/lib/discordAdmin";
import { buildProfileDiscordNicknamePlan, getProfileById, markProfileDiscordNicknameSynced } from "@/lib/profiles";
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
  const limit = checkRateLimit(`profile-discord-nickname:${session.profileId}:${ip}`, 10, 10 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  try {
    const profile = await getProfileById(session.profileId);
    if (!profile) return redirectToProfile(request, session.profileId, "discord_nick_profile_missing");
    if (profile.provider !== "discord" || !/^\d{16,25}$/.test(profile.providerUserId)) {
      return redirectToProfile(request, session.profileId, "discord_nick_not_discord");
    }

    const guildId = getDiscordGuildId();
    if (!guildId) return redirectToProfile(request, session.profileId, "discord_nick_failed");

    const guild = await fetchDiscordGuildSnapshot().catch(() => null);
    if (guild?.ownerId && guild.ownerId === profile.providerUserId) {
      return redirectToProfile(request, session.profileId, "discord_nick_owner");
    }

    const nicknamePlan = buildProfileDiscordNicknamePlan(profile);
    const nickname = nicknamePlan.value;
    if (!nickname) return redirectToProfile(request, session.profileId, "discord_nick_name_missing");

    await updateGuildMemberNickname({
      guildId,
      userId: profile.providerUserId,
      nickname,
      reason: `Mistblossom profile nickname sync: ${profile.profileId}`,
    });
    await markProfileDiscordNicknameSynced(profile.profileId, nickname, nicknamePlan).catch(() => null);

    logDashboardEvent("info", "profile.discord_nickname.synced", request, {
      profileId: profile.profileId,
      nickname,
      characters: nicknamePlan.characterNames,
      truncated: nicknamePlan.truncated,
    });
    return redirectToProfile(request, session.profileId, nicknamePlan.truncated ? "discord_nick_synced_short" : "discord_nick_synced");
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "profile.discord_nickname.failed", request, { profileId: session.profileId, message });
    if (/Discord API\s+403|Missing Permissions|50013/i.test(message)) {
      return redirectToProfile(request, session.profileId, "discord_nick_hierarchy");
    }
    return redirectToProfile(request, session.profileId, "discord_nick_failed");
  }
}
