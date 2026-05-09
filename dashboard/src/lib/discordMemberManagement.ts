import "server-only";

import { mapConcurrentSettled } from "@/lib/concurrency";
import {
  addGuildMemberRoles,
  fetchDiscordBotManagementSnapshot,
  fetchDiscordGuildMemberSnapshot,
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

async function assertRolesManageable(roleIds: string[], action: string) {
  const status = await fetchDiscordBotManagementSnapshot().catch(() => null);
  if (!status || !status.roleCount) return;

  const blocked = roleIds.filter((roleId) => status.unmanageableRoleIds.includes(roleId));
  if (!blocked.length) return;

  throw new Error(`${action}: бот не може керувати ${blocked.length === 1 ? "цією роллю" : "цими ролями"}, бо його найвища роль ${status.topRoleName ? `“${status.topRoleName}”` : ""} не стоїть вище. Підніми роль бота в Discord або вибери роль нижче бота.`);
}

function explainDiscordModerationError(error: unknown, action: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/50013|Missing Permissions|permission/i.test(message)) {
    return `${action}: Discord не дозволив дію. Найчастіше причина — роль бота нижче цільової ролі/учасника, або цільовий користувач є власником сервера.`;
  }
  if (/10007|Unknown Member|404/i.test(message)) {
    return `${action}: учасника не знайдено на цьому Discord-сервері.`;
  }
  if (/50001|Missing Access/i.test(message)) {
    return `${action}: бот не має доступу до цього сервера або каналу керування.`;
  }
  if (/token|401|Unauthorized/i.test(message)) {
    return `${action}: Discord bot token недійсний або не налаштований.`;
  }
  return message || `${action}: Discord API не виконав дію.`;
}

async function memberSnapshot(userId: string) {
  return fetchDiscordGuildMemberSnapshot(userId).catch(() => null);
}

export async function updateDiscordMemberNickname(input: { userId: unknown; nickname: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const nickname = cleanNickname(input.nickname);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!nickname) throw new Error("Вкажи новий серверний нік.");
  try {
    await updateGuildMemberNickname({ guildId, userId, nickname, reason: input.reason || "Mistblossom manual nickname update" });
  } catch (error) {
    throw new Error(explainDiscordModerationError(error, "Зміна ніку"));
  }
  const snapshot = await memberSnapshot(userId);
  if (snapshot?.nick && snapshot.nick !== nickname) {
    throw new Error("Discord прийняв запит, але серверний нік не змінився. Перевір ієрархію ролей бота або зміни нік вручну.");
  }
  return { userId, nickname, displayName: snapshot?.displayName || nickname };
}

export async function addDiscordMemberRoles(input: { userId: unknown; roleIds: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const roleIds = cleanRoleIds(input.roleIds);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!roleIds.length) throw new Error("Вибери хоча б одну Discord-роль.");
  await assertRolesManageable(roleIds, "Видача ролі");
  try {
    await addGuildMemberRoles({ guildId, userId, roleIds, reason: input.reason || "Mistblossom manual role add" });
  } catch (error) {
    throw new Error(explainDiscordModerationError(error, "Видача ролі"));
  }
  const snapshot = await memberSnapshot(userId);
  const missing = snapshot ? roleIds.filter((roleId) => !snapshot.roleIds.includes(roleId)) : [];
  if (missing.length) {
    throw new Error(`Discord прийняв запит, але ролі не зʼявилися в учасника: ${missing.join(", ")}. Перевір ієрархію ролей бота.`);
  }
  return { userId, roleIds, displayName: snapshot?.displayName || userId };
}

export async function removeDiscordMemberRoles(input: { userId: unknown; roleIds: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const roleIds = cleanRoleIds(input.roleIds);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!roleIds.length) throw new Error("Вибери хоча б одну Discord-роль.");
  await assertRolesManageable(roleIds, "Зняття ролі");
  const policy = await getGuildNicknamePolicy();
  try {
    await removeGuildMemberRoles({
      guildId,
      userId,
      roleIds,
      reason: input.reason || "Mistblossom manual role remove",
      concurrency: policy.roleRemoveConcurrency,
      maxConcurrency: policy.roleRemoveMaxConcurrency,
    });
  } catch (error) {
    throw new Error(explainDiscordModerationError(error, "Зняття ролі"));
  }
  const snapshot = await memberSnapshot(userId);
  const stillPresent = snapshot ? roleIds.filter((roleId) => snapshot.roleIds.includes(roleId)) : [];
  if (stillPresent.length) {
    throw new Error(`Discord прийняв запит, але ролі досі є в учасника: ${stillPresent.join(", ")}. Перевір ієрархію ролей бота.`);
  }
  return { userId, roleIds, displayName: snapshot?.displayName || userId };
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
  await assertRolesManageable(roleIds, "Масове зняття ролей");
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
        concurrency: policy.roleRemoveConcurrency,
        maxConcurrency: policy.roleRemoveMaxConcurrency,
      });
      return { userId: member.userId, removed: removableRoleIds };
    },
    {
      profile: "external-api",
      concurrency: policy.nicknameCleanupConcurrency > 0 ? policy.nicknameCleanupConcurrency : undefined,
      min: 1,
      max: policy.nicknameCleanupMaxConcurrency,
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
