import { ApplicationStatus, statusColor, statusEmoji, statusText } from "./github";

export async function notifyDiscordStatusChange(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  issueUrl?: string;
  title?: string;
}) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;

  if (!botToken || !channelId) {
    return { skipped: true, reason: "DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID is missing" };
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `📋 Заявка #${params.issueNumber} оновлена`,
          description: [
            `**Статус:** ${statusEmoji(params.status)} **${statusText(params.status)}**`,
            `**Модератор:** ${params.moderator}`,
            params.issueUrl ? `**Issue:** ${params.issueUrl}` : "",
          ].filter(Boolean).join("\n"),
          color: statusColor(params.status),
          footer: { text: "Mistblossom Vanguard • Dashboard" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return { ok: false, error: raw || `Discord API error ${response.status}` };
  }

  return { ok: true };
}
