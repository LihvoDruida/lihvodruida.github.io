import "server-only";

import { mapConcurrentSettled } from "@/lib/concurrency";
import {
  addGuildMemberRoles,
  fetchDiscordGuildMembers,
  getDiscordGuildId,
  removeGuildMemberRoles,
  updateGuildMemberNickname,
  type DiscordGuildMemberModerationItem,
} from "@/lib/discordAdmin";
import { getGuildNicknamePolicy, nicknameMatchesTemplate } from "@/lib/guildNicknamePolicy";

function snowflake(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{16,25}$/.test(text) ? text : "";
}

function cleanNickname(value: unknown) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);
}

function cleanRoleIds(values: unknown) {
  const items = Array.isArray(values) ? values : String(values || "").split(/[\s,;]+/g);
  return Array.from(new Set(items.map(snowflake).filter(Boolean))).slice(0, 10);
}

function displayName(member: DiscordGuildMemberModerationItem) {
  return member.nick || member.globalName || member.username || member.userId;
}

export async function updateDiscordMemberNickname(input: { userId: unknown; nickname: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const nickname = cleanNickname(input.nickname);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!nickname) throw new Error("Вкажи новий серверний нік.");
  await updateGuildMemberNickname({ guildId, userId, nickname, reason: input.reason || "Mistblossom manual nickname update" });
  return { userId, nickname };
}

export async function addDiscordMemberRoles(input: { userId: unknown; roleIds: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const roleIds = cleanRoleIds(input.roleIds);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!roleIds.length) throw new Error("Вибери хоча б одну Discord-роль.");
  await addGuildMemberRoles({ guildId, userId, roleIds, reason: input.reason || "Mistblossom manual role add" });
  return { userId, roleIds };
}

export async function removeDiscordMemberRoles(input: { userId: unknown; roleIds: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const roleIds = cleanRoleIds(input.roleIds);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!roleIds.length) throw new Error("Вибери хоча б одну Discord-роль.");
  await removeGuildMemberRoles({ guildId, userId, roleIds, reason: input.reason || "Mistblossom manual role remove" });
  return { userId, roleIds };
}

export async function inspectDiscordNicknameTemplate(limit = 1000) {
  const policy = await getGuildNicknamePolicy();
  const members = await fetchDiscordGuildMembers(limit);
  const mismatched = members.filter((member) => !nicknameMatchesTemplate(displayName(member), policy.template));
  return {
    template: policy.template,
    checked: members.length,
    mismatched: mismatched.slice(0, 50),
    mismatchedTotal: mismatched.length,
  };
}

export async function removeRolesFromMembersWithInvalidNicknames(input: {
  roleIds: unknown;
  limit?: unknown;
  dryRun?: boolean;
  reason?: string;
}) {
  const guildId = getDiscordGuildId();
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  const roleIds = cleanRoleIds(input.roleIds);
  if (!roleIds.length) throw new Error("Вибери ролі, які можна знімати при неправильному ніку.");
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input.limit) || 1000)));
  const policy = await getGuildNicknamePolicy();
  const members = await fetchDiscordGuildMembers(limit);
  const targets = members
    .filter((member) => roleIds.some((roleId) => member.roleIds.includes(roleId)))
    .filter((member) => !nicknameMatchesTemplate(displayName(member), policy.template));

  if (input.dryRun) {
    return {
      dryRun: true,
      template: policy.template,
      checked: members.length,
      matchedTargets: targets.length,
      changed: 0,
      failed: 0,
      preview: targets.slice(0, 50),
    };
  }

  const { results, meta } = await mapConcurrentSettled(
    targets,
    async (member) => {
      const removableRoleIds = roleIds.filter((roleId) => member.roleIds.includes(roleId));
      if (!removableRoleIds.length) return { userId: member.userId, removed: [] as string[] };
      await removeGuildMemberRoles({
        guildId,
        userId: member.userId,
        roleIds: removableRoleIds,
        reason: input.reason || `Nickname does not match template: ${policy.template}`,
      });
      return { userId: member.userId, removed: removableRoleIds };
    },
    {
      profile: "external-api",
      envKey: "DISCORD_NICKNAME_CLEANUP_CONCURRENCY",
      maxEnvKey: "DISCORD_NICKNAME_CLEANUP_MAX_CONCURRENCY",
      min: 1,
      max: 4,
    },
  );

  const failedItems = results.filter((result) => !result.ok);
  return {
    dryRun: false,
    template: policy.template,
    checked: members.length,
    matchedTargets: targets.length,
    changed: results.filter((result) => result.ok).length,
    failed: failedItems.length,
    concurrency: meta.concurrency,
    durationMs: meta.durationMs,
    preview: targets.slice(0, 50),
    errors: failedItems.slice(0, 10).map((item) => ({
      userId: item.item.userId,
      name: displayName(item.item),
      error: item.error instanceof Error ? item.error.message : String(item.error || "Помилка Discord API"),
    })),
  };
}
