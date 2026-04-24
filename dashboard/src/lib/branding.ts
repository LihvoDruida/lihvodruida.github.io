export type GuildBranding = {
  name: string;
  iconUrl: string;
};

const FALLBACK_GUILD_NAME = "Mistblossom Vanguard";
const FALLBACK_GUILD_ICON = "/favicon.ico";

let cachedBranding: {
  value: GuildBranding;
  expiresAt: number;
} | null = null;

function buildDiscordGuildIconUrl(guildId: string, iconHash: string) {
  const ext = iconHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=128`;
}

export async function getGuildBranding(): Promise<GuildBranding> {
  const now = Date.now();

  if (cachedBranding && cachedBranding.expiresAt > now) {
    return cachedBranding.value;
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId || !botToken) {
    return {
      name: process.env.DISCORD_GUILD_NAME || FALLBACK_GUILD_NAME,
      iconUrl: FALLBACK_GUILD_ICON,
    };
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Discord guild API ${response.status}`);
    }

    const guild = await response.json();

    const value: GuildBranding = {
      name: guild?.name || process.env.DISCORD_GUILD_NAME || FALLBACK_GUILD_NAME,
      iconUrl: guild?.icon ? buildDiscordGuildIconUrl(guildId, guild.icon) : FALLBACK_GUILD_ICON,
    };

    cachedBranding = {
      value,
      expiresAt: now + 1000 * 60 * 10,
    };

    return value;
  } catch {
    return {
      name: process.env.DISCORD_GUILD_NAME || FALLBACK_GUILD_NAME,
      iconUrl: FALLBACK_GUILD_ICON,
    };
  }
}

// Backward-compatible helpers for old imports.
export async function getGuildIconUrl() {
  return (await getGuildBranding()).iconUrl;
}

export async function getGuildName() {
  return (await getGuildBranding()).name;
}
