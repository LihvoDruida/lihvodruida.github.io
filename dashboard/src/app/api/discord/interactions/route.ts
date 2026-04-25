import { NextRequest, NextResponse } from "next/server";
import {
  addGuildMemberRoles,
  decodeRulesCustomId,
  getDiscordGuildId,
  kickGuildMember,
  verifyDiscordInteractionSignature,
} from "@/lib/discordAdmin";
import { logDashboardEvent, noStoreHeaders, safeErrorMessage } from "@/lib/security";

export const runtime = "nodejs";

type InteractionResponse = {
  type: number;
  data?: Record<string, unknown>;
};

function json(payload: InteractionResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: noStoreHeaders(),
  });
}

function ephemeral(content: string) {
  return json({
    type: 4,
    data: {
      content,
      flags: 64,
      allowed_mentions: { parse: [] },
    },
  });
}

function getInteractionUserId(interaction: any) {
  return String(interaction?.member?.user?.id || interaction?.user?.id || "");
}

function getInteractionUserName(interaction: any) {
  return String(
    interaction?.member?.user?.global_name ||
    interaction?.member?.user?.username ||
    interaction?.user?.global_name ||
    interaction?.user?.username ||
    getInteractionUserId(interaction) ||
    "unknown"
  ).slice(0, 80);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  try {
    const verified = await verifyDiscordInteractionSignature(request, rawBody);
    if (!verified) return new NextResponse("invalid request signature", { status: 401, headers: noStoreHeaders() });
  } catch (error) {
    logDashboardEvent("error", "discord.interaction.signature_failed", request, { message: safeErrorMessage(error) });
    return new NextResponse("invalid request signature", { status: 401, headers: noStoreHeaders() });
  }

  let interaction: any;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new NextResponse("bad request", { status: 400, headers: noStoreHeaders() });
  }

  if (interaction?.type === 1) {
    return json({ type: 1 });
  }

  if (interaction?.type !== 3) {
    return ephemeral("Цей тип Discord interaction не підтримується цією панеллю.");
  }

  const customId = String(interaction?.data?.custom_id || "");
  const parsed = decodeRulesCustomId(customId);
  if (!parsed) return ephemeral("Ця кнопка не належить Mistblossom dashboard або вже застаріла.");

  const guildId = String(interaction?.guild_id || getDiscordGuildId() || "");
  const userId = getInteractionUserId(interaction);
  const userName = getInteractionUserName(interaction);

  try {
    if (parsed.action === "accept") {
      await addGuildMemberRoles({
        guildId,
        userId,
        roleIds: parsed.roleIds,
        reason: `Rules accepted by ${userName}`,
      });

      logDashboardEvent("info", "discord.rules.accepted", request, {
        guildId,
        userId,
        roles: parsed.roleIds.length,
      });

      return ephemeral("✅ Правила прийнято. Роль видано.");
    }

    await kickGuildMember({
      guildId,
      userId,
      reason: `Rules declined by ${userName}`,
    });

    logDashboardEvent("info", "discord.rules.declined", request, { guildId, userId });
    return ephemeral("🚪 Ти відмовився від правил, тому бот видалив тебе із сервера.");
  } catch (error) {
    logDashboardEvent("error", "discord.rules.action_failed", request, { message: safeErrorMessage(error), guildId, userId });
    return ephemeral(`❌ Не вдалося виконати дію: ${safeErrorMessage(error)}`);
  }
}
