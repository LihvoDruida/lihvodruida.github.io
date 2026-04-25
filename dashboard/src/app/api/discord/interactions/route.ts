import { NextRequest, NextResponse } from "next/server";
import {
  addGuildMemberRoles,
  buildRulesAcceptCustomId,
  buildRulesDeclineCustomId,
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

function ephemeral(content: string, components: unknown[] = []) {
  return json({
    type: 4,
    data: {
      content,
      flags: 64,
      components,
      allowed_mentions: { parse: [] },
    },
  });
}

function updateInteractionMessage(content: string) {
  return json({
    type: 7,
    data: {
      content,
      components: [],
      allowed_mentions: { parse: [] },
    },
  });
}

function isEphemeralMessageInteraction(interaction: any) {
  return Boolean(Number(interaction?.message?.flags || 0) & 64);
}

function finishDecision(interaction: any, content: string) {
  return isEphemeralMessageInteraction(interaction) ? updateInteractionMessage(content) : ephemeral(content);
}

function rulesConfirmationResponse(action: { action: string; roleIds: string[] }) {
  if (action.action === "confirm_decline") {
    return ephemeral("⚠️ Підтверди відмову від правил. Після підтвердження бот видалить тебе із сервера.", [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 4,
            label: "Підтвердити відмову",
            custom_id: buildRulesDeclineCustomId(),
          },
        ],
      },
    ]);
  }

  return ephemeral("🌸 Підтверди прийняття правил. Після підтвердження бот видасть потрібну роль.", [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Підтвердити прийняття",
          custom_id: buildRulesAcceptCustomId(action.roleIds),
        },
      ],
    },
  ]);
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
    logDashboardEvent("warn", "discord.interaction.bad_json", request);
    return new NextResponse("bad request", { status: 400, headers: noStoreHeaders() });
  }

  if (interaction?.type === 1) {
    logDashboardEvent("debug", "discord.interaction.ping", request);
    return json({ type: 1 });
  }

  if (interaction?.type !== 3) {
    logDashboardEvent("warn", "discord.interaction.unsupported_type", request, { interactionType: interaction?.type });
    return ephemeral("Цей тип Discord interaction не підтримується цією панеллю.");
  }

  const customId = String(interaction?.data?.custom_id || "");
  const parsed = decodeRulesCustomId(customId);
  if (!parsed) {
    logDashboardEvent("warn", "discord.rules.unknown_custom_id", request, { customId: customId.slice(0, 24) });
    return ephemeral("Ця кнопка не належить Mistblossom dashboard або вже застаріла.");
  }

  const guildId = String(interaction?.guild_id || getDiscordGuildId() || "");
  const userId = getInteractionUserId(interaction);
  const userName = getInteractionUserName(interaction);

  if (parsed.action === "confirm_accept" || parsed.action === "confirm_decline") {
    logDashboardEvent("info", "discord.rules.confirmation_requested", request, {
      action: parsed.action,
      guildId,
      userId,
      roles: parsed.roleIds.length,
    });
    return rulesConfirmationResponse(parsed);
  }

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

      return finishDecision(interaction, "✅ Правила прийнято. Роль видано. Для тебе ця дія вже завершена.");
    }

    await kickGuildMember({
      guildId,
      userId,
      reason: `Rules declined by ${userName}`,
    });

    logDashboardEvent("info", "discord.rules.declined", request, { guildId, userId });
    return finishDecision(interaction, "🚪 Ти відмовився від правил, тому бот видалив тебе із сервера.");
  } catch (error) {
    logDashboardEvent("error", "discord.rules.action_failed", request, { message: safeErrorMessage(error), guildId, userId, action: parsed.action });
    return finishDecision(interaction, `❌ Не вдалося виконати дію: ${safeErrorMessage(error)}`);
  }
}
