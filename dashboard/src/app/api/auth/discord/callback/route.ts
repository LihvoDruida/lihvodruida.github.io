import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { applyAccessGroupToSession, resolveAccessGroupFromDiscord } from "@/lib/accessGroups";
import { fetchDiscordGuildSnapshot } from "@/lib/discordAdmin";
import { LEGACY_OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE, createStableProfileId } from "@/lib/auth";
import { setSession } from "@/lib/session";
import { exchangeDiscordCode, fetchDiscordGuildMember, fetchDiscordUser, getDashboardUrl } from "@/lib/oauth";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders } from "@/lib/security";
import { upsertProfileFromSession } from "@/lib/profiles";

const LOGIN_NEXT_COOKIE = "__Host-mistblossom_next";

function safeNextPath(value: string | null | undefined) {
  const path = String(value || "").trim();
  if (!path || path.length > 1500) return "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (path === "/" || /^\/(?:raids|profile|rules\/accept)(?:[/?#]|$)/.test(path)) return path;
  return "";
}

function loginRedirect(error: string) {
  const response = NextResponse.redirect(`${getDashboardUrl()}/login?error=${encodeURIComponent(error)}`, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function GET(request: NextRequest) {
  logDashboardEvent("info", "auth.discord.callback", request);

  const ip = getClientIp(request);
  const limit = checkRateLimit(`discord-oauth-callback:${ip}`, 30, 10 * 60 * 1000);
  if (!limit.ok) {
    logDashboardEvent("warn", "auth.discord.callback.rate_limited", request, { resetAt: limit.resetAt });
    return loginRedirect("rate_limit");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value || store.get(LEGACY_OAUTH_STATE_COOKIE)?.value || "";
  const nextPath = safeNextPath(store.get(LOGIN_NEXT_COOKIE)?.value);
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(LEGACY_OAUTH_STATE_COOKIE);
  store.delete(LOGIN_NEXT_COOKIE);

  if (!code || !state || state !== expectedState) {
    logDashboardEvent("warn", "auth.discord.callback.state_mismatch", request, { hasCode: Boolean(code), hasState: Boolean(state), hasExpectedState: Boolean(expectedState) });
    return loginRedirect("oauth_state");
  }

  try {
    const token = await exchangeDiscordCode(code);
    const [user, member] = await Promise.all([
      fetchDiscordUser(token.access_token),
      fetchDiscordGuildMember(token.access_token),
    ]);

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : null;

    const discordRoleIds = Array.isArray(member.roles) ? member.roles.map((roleId: unknown) => String(roleId || "").trim()).filter(Boolean) : [];
    const guild = await fetchDiscordGuildSnapshot().catch(() => null);
    const resolved = await resolveAccessGroupFromDiscord(discordRoleIds, String(user.id), guild?.ownerId || null);
    if (!resolved.group.permissions.includes("dashboard.view")) {
      logDashboardEvent("warn", "auth.discord.callback.access_denied", request, { userId: user.id });
      return loginRedirect("access_denied");
    }

    const session = applyAccessGroupToSession({
      provider: "discord" as const,
      id: String(user.id),
      profileId: await createStableProfileId("discord", String(user.id)),
      name: user.global_name || user.username || String(user.id),
      role: resolved.group.role,
      avatar: avatarUrl,
      avatar_url: avatarUrl,
      discordRoleIds,
    }, resolved.group, resolved.isServerOwner);
    const role = session.role;

    const profileWrite = await upsertProfileFromSession(session).catch((error) => {
      logDashboardEvent("error", "auth.discord.profile_upsert_failed", request, { userId: user.id, role, message: error instanceof Error ? error.message : String(error) });
      return { stored: false, reason: "write-failed" };
    });

    logDashboardEvent("info", "auth.discord.callback.success", request, { userId: user.id, profileId: session.profileId, role, profileStored: profileWrite.stored });

    await setSession(session);

    const redirectPath = nextPath || (role === "member" ? `/profile/${session.profileId}` : "/");
    const response = NextResponse.redirect(`${getDashboardUrl()}${redirectPath}`, 303);
    for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
    return response;
  } catch (error) {
    logDashboardEvent("error", "auth.discord.callback.failed", request, { message: error instanceof Error ? error.message : String(error) });
    return loginRedirect("discord_oauth");
  }
}
