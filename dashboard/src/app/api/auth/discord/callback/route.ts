import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { applyAccessGroupToSession, resolveAccessGroupFromDiscord } from "@/lib/accessGroups";
import { fetchDiscordGuildSnapshot } from "@/lib/discordAdmin";
import { LEGACY_OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE, createStableProfileId, parseOAuthStateToken } from "@/lib/auth";
import { setSession } from "@/lib/session";
import { exchangeDiscordCode, fetchDiscordGuildMember, fetchDiscordUser, getDashboardUrl } from "@/lib/oauth";
import { checkRateLimit, getClientIp, logDashboardEvent, noStoreHeaders } from "@/lib/security";
import { upsertProfileFromSession } from "@/lib/profiles";

const LOGIN_NEXT_COOKIE = "__Host-mistblossom_next";

const OAUTH_NONCE_COOKIE_MAX_AGE = 60 * 10;
const MAX_PARALLEL_OAUTH_FLOWS = 8;

function parseRememberedOAuthNonces(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.nonces) ? parsed.nonces : [];
    return Array.from(new Set(list.map((item: unknown) => String(item || "").trim()).filter(Boolean))).slice(-MAX_PARALLEL_OAUTH_FLOWS);
  } catch {
    // Old deployments stored the whole state string directly in the cookie.
    return [raw];
  }
}

function serializeRememberedOAuthNonces(nonces: string[]) {
  return JSON.stringify({ v: 1, nonces: Array.from(new Set(nonces.map((item) => String(item || "").trim()).filter(Boolean))).slice(-MAX_PARALLEL_OAUTH_FLOWS) });
}

function expireOAuthCookie(response: NextResponse, name: string, secure: boolean) {
  response.cookies.set(name, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function rememberRemainingOAuthNonces(response: NextResponse, nonces: string[]) {
  const clean = Array.from(new Set(nonces.map((item) => String(item || "").trim()).filter(Boolean))).slice(-MAX_PARALLEL_OAUTH_FLOWS);
  if (clean.length) {
    response.cookies.set(OAUTH_STATE_COOKIE, serializeRememberedOAuthNonces(clean), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_NONCE_COOKIE_MAX_AGE,
    });
  } else {
    expireOAuthCookie(response, OAUTH_STATE_COOKIE, true);
  }
  expireOAuthCookie(response, LEGACY_OAUTH_STATE_COOKIE, false);
  expireOAuthCookie(response, LOGIN_NEXT_COOKIE, true);
}

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
  const rawStateCookie = store.get(OAUTH_STATE_COOKIE)?.value || store.get(LEGACY_OAUTH_STATE_COOKIE)?.value || "";
  const rememberedNonces = parseRememberedOAuthNonces(rawStateCookie);
  const parsedState = await parseOAuthStateToken(state);
  const legacyStateMatches = Boolean(state && rememberedNonces.includes(state));
  const nonceMatches = Boolean(parsedState?.nonce && rememberedNonces.includes(parsedState.nonce));
  const nextPath = safeNextPath(parsedState?.nextPath || store.get(LOGIN_NEXT_COOKIE)?.value);
  const remainingNonces = parsedState?.nonce
    ? rememberedNonces.filter((item) => item !== parsedState.nonce && item !== state)
    : rememberedNonces.filter((item) => item !== state);

  if (!code || !state || (!legacyStateMatches && !nonceMatches)) {
    logDashboardEvent("warn", "auth.discord.callback.state_mismatch", request, {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasExpectedState: rememberedNonces.length > 0,
      parsedState: Boolean(parsedState),
      rememberedStates: rememberedNonces.length,
    });
    const response = loginRedirect("oauth_state");
    rememberRemainingOAuthNonces(response, remainingNonces);
    return response;
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
      const response = loginRedirect("access_denied");
      rememberRemainingOAuthNonces(response, remainingNonces);
      return response;
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
    rememberRemainingOAuthNonces(response, remainingNonces);
    return response;
  } catch (error) {
    logDashboardEvent("error", "auth.discord.callback.failed", request, { message: error instanceof Error ? error.message : String(error) });
    const response = loginRedirect("discord_oauth");
    rememberRemainingOAuthNonces(response, remainingNonces);
    return response;
  }
}
