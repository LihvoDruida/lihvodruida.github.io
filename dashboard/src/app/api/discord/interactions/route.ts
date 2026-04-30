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
import { getMainCharacter, getProfileByDiscordUserId } from "@/lib/profiles";
import { dashboardProfileUrl, dashboardRaidRulesUrl, decodeRaidAttendanceCustomId, handleRaidDiscordAction, raidActionHelpComponents } from "@/lib/raids";
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

function updateInteractionMessage(content: string, components: unknown[] = []) {
  return json({
    type: 7,
    data: {
      content,
      components,
      allowed_mentions: { parse: [] },
    },
  });
}

function isEphemeralMessageInteraction(interaction: any) {
  return Boolean(Number(interaction?.message?.flags || 0) & 64);
}

function finishDecision(interaction: any, content: string, components: unknown[] = []) {
  return isEphemeralMessageInteraction(interaction) ? updateInteractionMessage(content, components) : ephemeral(content, components);
}

function rulesConfirmationResponse(action: { action: string; roleIds: string[] }) {
  if (action.action === "confirm_raid_signup") {
    return ephemeral("🐉 Підтверди правила рейду. Система перевірить твій профіль і мейн-персонажа.", [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "Підтвердити підпис",
            custom_id: "mbv1:r:s",
          },
        ],
      },
    ]);
  }

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


function mainCharacterLabel(character: any) {
  const name = String(character?.name || "").trim();
  const realm = String(character?.realmName || character?.realmSlug || "").trim();
  return name ? `${name}${realm ? ` • ${realm}` : ""}` : "мейн-персонаж не знайдений";
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
  const raidAction = decodeRaidAttendanceCustomId(customId);
  const parsed = raidAction ? null : decodeRulesCustomId(customId);
  if (!raidAction && !parsed) {
    logDashboardEvent("warn", "discord.rules.unknown_custom_id", request, { customId: customId.slice(0, 24) });
    return ephemeral("Ця кнопка не належить Mistblossom dashboard або вже застаріла.");
  }

  const guildId = String(interaction?.guild_id || getDiscordGuildId() || "");
  const userId = getInteractionUserId(interaction);
  const userName = getInteractionUserName(interaction);

  if (raidAction) {
    try {
      const result = await handleRaidDiscordAction({
        raidId: raidAction.raidId,
        action: raidAction.action,
        userId,
        userName,
      });
      logDashboardEvent(result.ok ? "info" : "warn", "discord.raid.action", request, { raidId: raidAction.raidId, action: raidAction.action, userId, ok: result.ok });
      return finishDecision(interaction, result.content, "components" in result ? result.components || [] : []);
    } catch (error) {
      logDashboardEvent("error", "discord.raid.action_failed", request, { message: safeErrorMessage(error), raidId: raidAction.raidId, action: raidAction.action, userId });
      return finishDecision(interaction, "❌ Не вдалося оновити запис на рейд. Спробуй ще раз пізніше або звернись до офіцера.");
    }
  }

  if (!parsed) {
    return ephemeral("Ця кнопка вже застаріла.");
  }

  if (parsed.action === "confirm_accept" || parsed.action === "confirm_decline") {
    logDashboardEvent("info", "discord.rules.confirmation_requested", request, {
      action: parsed.action,
      guildId,
      userId,
      roles: parsed.roleIds.length,
    });
    return rulesConfirmationResponse(parsed);
  }

  if (parsed.action === "raid_signup") {
    try {
      const profile = await getProfileByDiscordUserId(userId);
      const mainCharacter = profile ? getMainCharacter(profile) : null;
      if (!profile || !mainCharacter) {
        logDashboardEvent("warn", "discord.raid_rules.profile_missing", request, { guildId, userId });
        return finishDecision(interaction, `❌ Підпис не зараховано: спочатку увійди через Discord у панелі, додай персонажа Battle.net і вибери мейна.
Профіль: ${dashboardProfileUrl()}
Правила рейду: ${dashboardRaidRulesUrl()}`, raidActionHelpComponents());
      }

      logDashboardEvent("info", "discord.raid_rules.signed", request, { guildId, userId, profileId: profile.profileId, character: mainCharacter.name });
      return finishDecision(interaction, `✅ Підпис на правила рейду підтверджено. Мейн: ${mainCharacterLabel(mainCharacter)}.`);
    } catch (error) {
      logDashboardEvent("error", "discord.raid_rules.failed", request, { message: safeErrorMessage(error), guildId, userId });
      return finishDecision(interaction, `❌ Не вдалося підтвердити підпис. Спробуй ще раз пізніше або перевір, що в профілі вибрано мейн-персонажа.
Профіль: ${dashboardProfileUrl()}
Правила рейду: ${dashboardRaidRulesUrl()}`, raidActionHelpComponents());
    }
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
    return finishDecision(interaction, "❌ Не вдалося виконати дію. Спробуй ще раз пізніше або звернись до гільдмайстра.");
  }
}
