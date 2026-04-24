import { AdminUser } from "./auth";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function baseUrl(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.DASHBOARD_URL;
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

async function parseJson(response: Response): Promise<any> {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return raw; }
}

export function githubAuthorizeUrl(requestUrl: string, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", requiredEnv("GITHUB_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", `${baseUrl(requestUrl)}/api/auth/github/callback`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGitHubCode(requestUrl: string, code: string): Promise<AdminUser> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requiredEnv("GITHUB_OAUTH_CLIENT_ID"),
      client_secret: requiredEnv("GITHUB_OAUTH_CLIENT_SECRET"),
      code,
      redirect_uri: `${baseUrl(requestUrl)}/api/auth/github/callback`
    })
  });
  const tokenData = await parseJson(tokenResponse);
  if (!tokenResponse.ok || !tokenData?.access_token) throw new Error(tokenData?.error_description || "GitHub OAuth token exchange failed.");

  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "mistblossom-dashboard" }
  });
  const user = await parseJson(userResponse);
  if (!userResponse.ok) throw new Error(user?.message || "GitHub user request failed.");

  return {
    provider: "github",
    id: String(user.id || ""),
    login: String(user.login || ""),
    name: user.name || user.login || "GitHub user",
    email: user.email || "",
    avatar_url: user.avatar_url || ""
  };
}

export function discordAuthorizeUrl(requestUrl: string, state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", requiredEnv("DISCORD_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", `${baseUrl(requestUrl)}/api/auth/discord/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify email guilds.members.read");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeDiscordCode(requestUrl: string, code: string): Promise<AdminUser> {
  const { getAccessConfig, roleFromDiscordRoles } = await import("./access");
  const body = new URLSearchParams();
  body.set("client_id", requiredEnv("DISCORD_OAUTH_CLIENT_ID"));
  body.set("client_secret", requiredEnv("DISCORD_OAUTH_CLIENT_SECRET"));
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", `${baseUrl(requestUrl)}/api/auth/discord/callback`);

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const tokenData = await parseJson(tokenResponse);
  if (!tokenResponse.ok || !tokenData?.access_token) throw new Error(tokenData?.error_description || "Discord OAuth token exchange failed.");

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const user = await parseJson(userResponse);
  if (!userResponse.ok) throw new Error(user?.message || "Discord user request failed.");

  const accessConfig = await getAccessConfig();
  if (!accessConfig.guildId) throw new Error("DISCORD_GUILD_ID is not configured.");

  const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${accessConfig.guildId}/member`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const member = await parseJson(memberResponse);
  if (!memberResponse.ok) throw new Error(member?.message || "Discord guild member request failed.");

  const roleIds = Array.isArray(member?.roles) ? member.roles.map(String) : [];
  const dashboardRole = roleFromDiscordRoles(roleIds, accessConfig);

  return {
    provider: "discord",
    id: String(user.id || ""),
    login: String(user.username || ""),
    name: user.global_name || user.username || "Discord user",
    email: user.email || "",
    avatar_url: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : "",
    role: dashboardRole || undefined,
    role_source: dashboardRole ? "discord-role" : undefined,
    guild_id: accessConfig.guildId,
    discord_role_ids: roleIds
  };
}
