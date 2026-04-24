import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveDashboardRole } from "@/lib/access";
import { setSession } from "@/lib/session";
import { exchangeDiscordCode, fetchDiscordGuildMember, fetchDiscordUser, getDashboardUrl } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  const store = await cookies();
  const expectedState = store.get("mistblossom_oauth_state")?.value || "";
  store.delete("mistblossom_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(`${getDashboardUrl()}/login?error=oauth_state`);
  }

  try {
    const token = await exchangeDiscordCode(code);
    const [user, member] = await Promise.all([
      fetchDiscordUser(token.access_token),
      fetchDiscordGuildMember(token.access_token),
    ]);

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${String(user.avatar).startsWith("a_") ? "gif" : "png"}?size=128`
      : null;

    const role = resolveDashboardRole(member.roles || []);
    if (!role) {
      return NextResponse.redirect(`${getDashboardUrl()}/login?error=access_denied`);
    }

    await setSession({
      provider: "discord",
      id: String(user.id),
      name: user.global_name || user.username || String(user.id),
      role,
      avatar: avatarUrl,
      avatar_url: avatarUrl,
    });

    return NextResponse.redirect(`${getDashboardUrl()}/`);
  } catch {
    return NextResponse.redirect(`${getDashboardUrl()}/login?error=discord_oauth`);
  }
}
