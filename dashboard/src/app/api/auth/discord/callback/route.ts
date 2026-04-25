import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveDashboardRole } from "@/lib/access";
import { setSession } from "@/lib/session";
import { exchangeDiscordCode, fetchDiscordGuildMember, fetchDiscordUser, getDashboardUrl } from "@/lib/oauth";
import { checkRateLimit, getClientIp, noStoreHeaders } from "@/lib/security";

function loginRedirect(error: string) {
  const response = NextResponse.redirect(`${getDashboardUrl()}/login?error=${encodeURIComponent(error)}`, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`discord-oauth-callback:${ip}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return loginRedirect("rate_limit");

  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  const store = await cookies();
  const expectedState = store.get("__Host-mistblossom_oauth_state")?.value || store.get("mistblossom_oauth_state")?.value || "";
  store.delete("__Host-mistblossom_oauth_state");
  store.delete("mistblossom_oauth_state");

  if (!code || !state || state !== expectedState) {
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
      return loginRedirect("access_denied");
    }

    await setSession({
      provider: "discord",
      id: String(user.id),
      name: user.global_name || user.username || String(user.id),
      role,
      avatar: avatarUrl,
      avatar_url: avatarUrl,
    });

    const response = NextResponse.redirect(`${getDashboardUrl()}/`, 303);
    for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
    return response;
  } catch {
    return loginRedirect("discord_oauth");
  }
}
