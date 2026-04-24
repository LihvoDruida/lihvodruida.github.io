import { ApplicationStatus, statusColor, statusEmoji, statusText } from "./github";

export type DiscordMessageRef = {
  channel_id?: string | null;
  message_id?: string | null;
};

function getBotToken() {
  return process.env.DISCORD_BOT_TOKEN || "";
}

function getDefaultChannelId() {
  return process.env.DISCORD_CHANNEL_ID || "";
}

function discordHeaders() {
  const token = getBotToken();

  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is missing.");
  }

  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json; charset=utf-8",
  };
}

function buildStatusContent(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  issueUrl?: string;
  source: "dashboard" | "discord";
}) {
  return [
    `📋 **Заявка #${params.issueNumber} оновлена**`,
    `> Статус: ${statusEmoji(params.status)} **${statusText(params.status)}**`,
    `> Джерело: **${params.source === "dashboard" ? "Dashboard" : "Discord"}**`,
    `> Модератор: 👤 **${params.moderator}**`,
    params.issueUrl ? `> Issue: ${params.issueUrl}` : "",
  ].filter(Boolean).join("\n");
}

function updateEmbedDescription(description: unknown, status: ApplicationStatus) {
  const line = `**Статус:** ${statusEmoji(status)} ${statusText(status)}`;
  const text = String(description || "").trim();

  if (!text) return line;

  if (/\*\*Статус:\*\*[^\n]*/.test(text)) {
    return text.replace(/\*\*Статус:\*\*[^\n]*/, line);
  }

  return [line, text].join("\n");
}

async function getDiscordMessage(channelId: string, messageId: string) {
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    headers: discordHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function updateDiscordApplicationMessage(params: {
  ref?: DiscordMessageRef | null;
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  issueUrl?: string;
  source: "dashboard" | "discord";
}) {
  const channelId = params.ref?.channel_id || getDefaultChannelId();
  const messageId = params.ref?.message_id;

  if (!getBotToken() || !channelId || !messageId) {
    return notifyDiscordStatusChange(params);
  }

  try {
    const message = await getDiscordMessage(channelId, messageId);
    const embeds = Array.isArray(message?.embeds)
      ? message.embeds.map((embed: any) => ({ ...embed }))
      : [];

    const primary = embeds[0] || {
      title: `Заявка #${params.issueNumber}`,
      description: "",
      fields: [],
    };

    primary.color = statusColor(params.status);
    primary.description = updateEmbedDescription(primary.description, params.status);
    primary.footer = {
      text: `Mistblossom Vanguard • Оновив: ${params.moderator}`,
    };
    primary.timestamp = new Date().toISOString();

    embeds[0] = primary;

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers: discordHeaders(),
      body: JSON.stringify({
        content: buildStatusContent(params),
        embeds: embeds.slice(0, 10),
        components: [],
        allowed_mentions: { parse: [] },
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return { ok: true, edited: true, channel_id: channelId, message_id: messageId };
  } catch (error) {
    const fallback = await notifyDiscordStatusChange(params);
    return {
      ok: false,
      edited: false,
      error: error instanceof Error ? error.message : "Discord edit failed.",
      fallback,
    };
  }
}

export async function notifyDiscordStatusChange(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  issueUrl?: string;
  source: "dashboard" | "discord";
}) {
  const botToken = getBotToken();
  const channelId = getDefaultChannelId();

  if (!botToken || !channelId) {
    return { skipped: true, reason: "DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID is missing" };
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: discordHeaders(),
    body: JSON.stringify({
      content: buildStatusContent(params),
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `📋 Заявка #${params.issueNumber} оновлена`,
          description: [
            `**Статус:** ${statusEmoji(params.status)} **${statusText(params.status)}**`,
            `**Джерело:** ${params.source === "dashboard" ? "Dashboard" : "Discord"}`,
            `**Модератор:** ${params.moderator}`,
            params.issueUrl ? `**Issue:** ${params.issueUrl}` : "",
          ].filter(Boolean).join("\n"),
          color: statusColor(params.status),
          footer: { text: "Mistblossom Vanguard • Applications" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return { ok: false, error: raw || `Discord API error ${response.status}` };
  }

  const data = await response.json().catch(() => null);

  return {
    ok: true,
    posted: true,
    channel_id: data?.channel_id || channelId,
    message_id: data?.id || null,
  };
}
