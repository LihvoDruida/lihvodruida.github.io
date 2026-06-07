import { dashboardRaidActionEndpoint } from "./config.js";
import { getIdempotencyResult, isKvRateLimited, storeIdempotencyResult } from "./kv-utils.js";
import { getDiscordUserId, snowflake } from "./discord-utils.js";
import { logWorkerEvent } from "./logger.js";

export function cleanRaidSignupRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "tank") return "tank";
  if (role === "healer" || role === "heal") return "healer";
  if (role === "dps" || role === "dd") return "dps";
  return "";
}

export function decodeRaidAttendanceCustomId(customId) {
  const value = String(customId || "").trim();
  const match = value.match(/^mbv1:raid:([A-Za-z0-9_-]{8,80}):(going|late|skipped)$/);
  if (!match) return null;
  return { raidId: match[1], action: match[2], characterKey: "" };
}

export function decodeRaidCharacterSelectCustomId(customId, values) {
  const value = String(customId || "").trim();
  const match = value.match(/^mbv1:rc:([A-Za-z0-9_-]{8,80}):(going|late|skipped)$/);
  if (!match) return null;
  const selected = Array.isArray(values) ? String(values[0] || "").trim() : "";
  if (!selected) return null;
  return { raidId: match[1], action: match[2], characterKey: selected };
}

export function decodeRaidRoleSelectCustomId(customId, values) {
  const value = String(customId || "").trim();
  const match = value.match(/^mbv1:rr:([A-Za-z0-9_-]{8,80}):(going|late):([A-Za-z0-9._-]{1,64})$/);
  if (!match) return null;
  const selected = Array.isArray(values) ? cleanRaidSignupRole(values[0]) : "";
  if (!selected) return null;
  return { raidId: match[1], action: match[2], characterKey: match[3], signupRole: selected };
}

export function isEphemeralInteractionMessage(interaction) {
  return Boolean(Number(interaction?.message?.flags || 0) & 64);
}

export function getRaidInteractionMessageRef(interaction) {
  if (isEphemeralInteractionMessage(interaction)) return { channelId: "", messageId: "" };
  return {
    channelId: snowflake(interaction?.channel_id || interaction?.message?.channel_id),
    messageId: snowflake(interaction?.message?.id),
  };
}

export function buildRaidIdempotencyKey(interaction, raidAction) {
  return `discord-raid:${raidAction.raidId}:${getDiscordUserId(interaction)}:${raidAction.action}:${raidAction.characterKey || "main"}:${raidAction.signupRole || "auto"}:${interaction?.id || Date.now()}`;
}

export async function isRaidInteractionRateLimited(env, interaction, scope = "raid-announcement", windowMs = 2500) {
  const userId = getDiscordUserId(interaction);
  return isKvRateLimited(env, `${scope}:${userId}`, windowMs);
}

export async function fetchRaidDashboardAction(env, interaction, raidAction, fetchDashboardText, token, getDiscordUserLabel, getInteractionGuildId) {
  const idempotencyKey = buildRaidIdempotencyKey(interaction, raidAction);
  const cached = await getIdempotencyResult(env, idempotencyKey).catch(() => null);
  if (cached) return { ...cached, idempotencyHit: true };

  const messageRef = getRaidInteractionMessageRef(interaction);
  const { response, raw } = await fetchDashboardText(env, dashboardRaidActionEndpoint(env, raidAction.raidId), token, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-worker-stats-token": token,
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      action: raidAction.action,
      characterKey: raidAction.characterKey || "",
      signupRole: raidAction.signupRole || "",
      userId: getDiscordUserId(interaction),
      userName: getDiscordUserLabel(interaction),
      guildId: getInteractionGuildId(interaction, env),
      channelId: messageRef.channelId,
      messageId: messageRef.messageId,
      source: "discord-interaction-worker",
    }),
  }, { timeoutMs: 9000, retries: 1 });

  const result = { responseStatus: response.status, responseOk: response.ok, raw };
  if (response.ok) {
    await storeIdempotencyResult(env, idempotencyKey, result, 120).catch((error) => {
      logWorkerEvent("warn", "raid_announcement.idempotency_write_failed", { raidId: raidAction.raidId, message: error?.message });
    });
  }
  return result;
}
