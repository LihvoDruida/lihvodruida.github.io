import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveDashboardRole } from "@/lib/access";
import { LEGACY_OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE } from "@/lib/auth";
import { setSession } from "@/lib/session";
import { exchangeDiscordCode, fetchDiscordGuildMember, fetchDiscordUser, getDashboardUrl } from "@/lib/oauth";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders } from "@/lib/security";

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
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(LEGACY_OAUTH_STATE_COOKIE);

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

    const role = resolveDashboardRole(member.roles || []);
    if (!role) {
      logDashboardEvent("warn", "auth.discord.callback.access_denied", request, { userId: user.id });
      return loginRedirect("access_denied");
    }

    logDashboardEvent("info", "auth.discord.callback.success", request, { userId: user.id, role });

    await setSession({
      provider: "discord",
      id: String(user.id),
      name: user.global_name || user.username || String(user.id),
      role,
      avatar: avatarUrl,
      avatar_url: avatarUrl,
      discordRoleIds: Array.isArray(member.roles) ? member.roles.map((roleId: unknown) => String(roleId || "").trim()).filter(Boolean) : [],
    });

    const response = NextResponse.redirect(`${getDashboardUrl()}/`, 303);
    for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
    return response;
  } catch (error) {
    logDashboardEvent("error", "auth.discord.callback.failed", request, { message: error instanceof Error ? error.message : String(error) });
    return loginRedirect("discord_oauth");
  }
}
