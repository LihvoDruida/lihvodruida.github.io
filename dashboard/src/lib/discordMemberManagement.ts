import "server-only";

import { mapConcurrentSettled } from "@/lib/concurrency";
import {
  addGuildMemberRoles,
  assertDiscordRolesManageable,
  fetchDiscordGuildMemberSnapshot,
  fetchDiscordGuildMembers,
  fetchDiscordGuildSnapshot,
  getDiscordGuildId,
  removeGuildMemberRoles,
  updateGuildMemberNickname,
  type DiscordGuildMemberModerationItem,
} from "@/lib/discordAdmin";
import { getGuildNicknamePolicy, nicknameMatchesTemplate } from "@/lib/guildNicknamePolicy";
import { fetchBattleNetGuildRankMap, guildStatusFromRank } from "@/lib/battlenet";
import { listDashboardProfilesForDiscordSync, getProfilePublicName, type DashboardProfile, type ProfileCharacter } from "@/lib/profiles";
import { buildBattleNetCharacterKey } from "@/lib/wowCharacters";

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

function serverNickname(member: DiscordGuildMemberModerationItem) {
  return cleanNickname(member.nick || "");
}

function memberHasInvalidServerNickname(member: DiscordGuildMemberModerationItem, template: string) {
  const nickname = serverNickname(member);
  return !nickname || !nicknameMatchesTemplate(nickname, template);
}

function memberModerationPreview(member: DiscordGuildMemberModerationItem, template: string) {
  const nick = serverNickname(member);
  return {
    ...member,
    serverNickname: nick || null,
    checkedNickname: nick || "",
    mismatchReason: nick ? `Серверний нік не відповідає шаблону: ${template}` : "Серверний нік не встановлено.",
  };
}

function serverNicknameValidation(member: { nick?: string | null }, template: string) {
  const nickname = cleanNickname(member.nick || "");
  if (!nickname) {
    return { ok: false, nickname: null, reason: "Серверний нік не встановлено." };
  }
  if (!nicknameMatchesTemplate(nickname, template)) {
    return { ok: false, nickname, reason: `Серверний нік не відповідає шаблону: ${template}` };
  }
  return { ok: true, nickname, reason: "" };
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

  const guild = await fetchDiscordGuildSnapshot().catch(() => null);
  if (guild?.ownerId === userId) {
    throw new Error("Це власник сервера. Discord не дозволяє боту змінювати його нік — потрібно змінити вручну.");
  }

  const before = await memberSnapshot(userId);
  if (!before) throw new Error("Discord-учасника не знайдено на сервері або бот не може його прочитати.");

  try {
    await updateGuildMemberNickname({ guildId, userId, nickname, reason: input.reason || "Mistblossom manual nickname update" });
  } catch (error) {
    throw new Error(explainDiscordModerationError(error, "Зміна ніку"));
  }

  const after = await memberSnapshot(userId);
  if (!after) throw new Error("Нік відправлено в Discord, але не вдалося повторно прочитати учасника для перевірки результату.");
  if (after.nick !== nickname) {
    throw new Error("Discord прийняв запит, але серверний нік не змінився. Перевір ієрархію ролей бота або зміни нік вручну.");
  }

  return {
    userId,
    nickname,
    displayName: after.displayName || nickname,
    beforeNickname: before.nick || null,
    afterNickname: after.nick || null,
    verified: true,
  };
}

export async function addDiscordMemberRoles(input: { userId: unknown; roleIds: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const roleIds = cleanRoleIds(input.roleIds);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!roleIds.length) throw new Error("Вибери хоча б одну Discord-роль.");

  const guild = await fetchDiscordGuildSnapshot().catch(() => null);
  if (guild?.ownerId === userId) {
    throw new Error("Це власник сервера. Discord не дозволяє боту змінювати ролі власника.");
  }

  const manageableRoleIds = await assertDiscordRolesManageable(roleIds);
  const before = await memberSnapshot(userId);
  if (!before) throw new Error("Discord-учасника не знайдено на сервері або бот не може його прочитати.");

  const roleIdsToAdd = manageableRoleIds.filter((roleId) => !before.roleIds.includes(roleId));
  const alreadyHadRoleIds = manageableRoleIds.filter((roleId) => before.roleIds.includes(roleId));

  if (roleIdsToAdd.length) {
    try {
      await addGuildMemberRoles({ guildId, userId, roleIds: roleIdsToAdd, reason: input.reason || "Mistblossom manual role add", concurrency: 1, maxConcurrency: 1 });
    } catch (error) {
      throw new Error(explainDiscordModerationError(error, "Видача ролі"));
    }
  }

  const after = await memberSnapshot(userId);
  if (!after) throw new Error("Ролі відправлено в Discord, але не вдалося повторно прочитати учасника для перевірки результату.");

  const missingRoleIds = roleIdsToAdd.filter((roleId) => !after.roleIds.includes(roleId));
  const addedRoleIds = roleIdsToAdd.filter((roleId) => !missingRoleIds.includes(roleId));
  if (missingRoleIds.length) {
    throw new Error(`Discord прийняв запит, але ролі не зʼявилися в учасника: ${missingRoleIds.join(", ")}. Перевір ієрархію ролей бота.`);
  }

  return {
    userId,
    roleIds: manageableRoleIds,
    requestedRoleIds: roleIds,
    addedRoleIds,
    alreadyHadRoleIds,
    beforeRoleIds: before.roleIds,
    afterRoleIds: after.roleIds,
    changed: addedRoleIds.length,
    displayName: after.displayName || before.displayName || userId,
    verified: true,
  };
}

export async function removeDiscordMemberRoles(input: { userId: unknown; roleIds: unknown; reason?: string }) {
  const guildId = getDiscordGuildId();
  const userId = snowflake(input.userId);
  const roleIds = cleanRoleIds(input.roleIds);
  if (!guildId) throw new Error("Discord-сервер не підключений.");
  if (!userId) throw new Error("Вкажи коректний Discord user ID.");
  if (!roleIds.length) throw new Error("Вибери хоча б одну Discord-роль.");

  const guild = await fetchDiscordGuildSnapshot().catch(() => null);
  if (guild?.ownerId === userId) {
    throw new Error("Це власник сервера. Discord не дозволяє боту змінювати ролі власника.");
  }

  const manageableRoleIds = await assertDiscordRolesManageable(roleIds);
  const before = await memberSnapshot(userId);
  if (!before) throw new Error("Discord-учасника не знайдено на сервері або бот не може його прочитати.");

  const roleIdsToRemove = manageableRoleIds.filter((roleId) => before.roleIds.includes(roleId));
  const alreadyMissingRoleIds = manageableRoleIds.filter((roleId) => !before.roleIds.includes(roleId));
  const policy = await getGuildNicknamePolicy();

  if (roleIdsToRemove.length) {
    try {
      await removeGuildMemberRoles({
        guildId,
        userId,
        roleIds: roleIdsToRemove,
        reason: input.reason || "Mistblossom manual role remove",
        concurrency: Math.min(1, Math.max(1, Number(policy.roleRemoveConcurrency || 1))),
        maxConcurrency: 1,
      });
    } catch (error) {
      throw new Error(explainDiscordModerationError(error, "Зняття ролі"));
    }
  }

  const after = await memberSnapshot(userId);
  if (!after) throw new Error("Ролі знято в Discord, але не вдалося повторно прочитати учасника для перевірки результату.");

  const stillPresentRoleIds = roleIdsToRemove.filter((roleId) => after.roleIds.includes(roleId));
  const removedRoleIds = roleIdsToRemove.filter((roleId) => !stillPresentRoleIds.includes(roleId));
  if (stillPresentRoleIds.length) {
    throw new Error(`Discord прийняв запит, але ролі досі є в учасника: ${stillPresentRoleIds.join(", ")}. Перевір ієрархію ролей бота.`);
  }

  return {
    userId,
    roleIds: manageableRoleIds,
    requestedRoleIds: roleIds,
    removedRoleIds,
    alreadyMissingRoleIds,
    beforeRoleIds: before.roleIds,
    afterRoleIds: after.roleIds,
    changed: removedRoleIds.length,
    displayName: after.displayName || before.displayName || userId,
    verified: true,
  };
}

export async function inspectDiscordNicknameTemplate(limit = 5000) {
  const policy = await getGuildNicknamePolicy();
  const members = await fetchDiscordGuildMembers(limit);
  const mismatched = members.filter((member) => memberHasInvalidServerNickname(member, policy.template));
  return {
    template: policy.template,
    checked: members.length,
    checkedField: "server_nick",
    mismatched: mismatched.slice(0, 50).map((member) => memberModerationPreview(member, policy.template)),
    mismatchedTotal: mismatched.length,
    missingServerNicknameTotal: mismatched.filter((member) => !serverNickname(member)).length,
  };
}

export async function removeRolesFromMembersWithInvalidNicknames(input: {
  roleIds?: unknown;
  removeRoleIds?: unknown;
  addRoleIds?: unknown;
  limit?: unknown;
  dryRun?: boolean;
  reason?: string;
}) {
  const guildId = getDiscordGuildId();
  if (!guildId) throw new Error("Discord-сервер не підключений.");

  const removeRoleIds = cleanRoleIds(input.removeRoleIds ?? input.roleIds);
  const addRoleIds = cleanRoleIds(input.addRoleIds);
  if (!removeRoleIds.length && !addRoleIds.length) {
    throw new Error("Вибери хоча б одну Discord-роль: що знімати або що видавати при неправильному ніку.");
  }

  const manageableRemoveRoleIds = removeRoleIds.length ? await assertDiscordRolesManageable(removeRoleIds) : [];
  const manageableAddRoleIds = addRoleIds.length ? await assertDiscordRolesManageable(addRoleIds) : [];
  const duplicated = manageableRemoveRoleIds.filter((roleId) => manageableAddRoleIds.includes(roleId));
  if (duplicated.length) {
    throw new Error(`Одна й та сама роль не може одночасно зніматись і видаватись: ${duplicated.join(", ")}.`);
  }

  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input.limit) || 5000)));
  const policy = await getGuildNicknamePolicy();
  const members = await fetchDiscordGuildMembers(limit);
  const invalidMembers = members.filter((member) => memberHasInvalidServerNickname(member, policy.template));
  const targets = invalidMembers.filter((member) => {
    const hasRemovable = manageableRemoveRoleIds.some((roleId) => member.roleIds.includes(roleId));
    const hasMissingAddable = manageableAddRoleIds.some((roleId) => !member.roleIds.includes(roleId));
    return hasRemovable || hasMissingAddable;
  });
  const previewTargets = targets.map((member) => memberModerationPreview(member, policy.template));

  if (input.dryRun) {
    return {
      dryRun: true,
      template: policy.template,
      checked: members.length,
      invalidTotal: invalidMembers.length,
      matchedTargets: targets.length,
      changed: 0,
      removedRolesTotal: 0,
      addedRolesTotal: 0,
      unchanged: 0,
      stillPresentTotal: 0,
      stillMissingTotal: 0,
      failed: 0,
      checkedField: "server_nick",
      removeRoleIds: manageableRemoveRoleIds,
      addRoleIds: manageableAddRoleIds,
      missingServerNicknameTotal: targets.filter((member) => !serverNickname(member)).length,
      preview: previewTargets.slice(0, 100),
      changedItems: [],
      changedItemsTotal: 0,
      errors: [],
      errorsTotal: 0,
    };
  }

  const { results, meta } = await mapConcurrentSettled(
    targets,
    async (member) => {
      const removableRoleIds = manageableRemoveRoleIds.filter((roleId) => member.roleIds.includes(roleId));
      const addableRoleIds = manageableAddRoleIds.filter((roleId) => !member.roleIds.includes(roleId));

      if (removableRoleIds.length) {
        await removeGuildMemberRoles({
          guildId,
          userId: member.userId,
          roleIds: removableRoleIds,
          reason: input.reason || `Nickname does not match template: ${policy.template}`,
          concurrency: 1,
          maxConcurrency: 1,
        });
      }

      if (addableRoleIds.length) {
        await addGuildMemberRoles({
          guildId,
          userId: member.userId,
          roleIds: addableRoleIds,
          reason: input.reason || `Nickname does not match template: ${policy.template}`,
          concurrency: 1,
          maxConcurrency: 1,
        });
      }

      const snapshot = await memberSnapshot(member.userId);
      const currentRoleIds = snapshot?.roleIds || [];
      const stillPresent = removableRoleIds.filter((roleId) => currentRoleIds.includes(roleId));
      const removed = removableRoleIds.filter((roleId) => !stillPresent.includes(roleId));
      const stillMissing = addableRoleIds.filter((roleId) => !currentRoleIds.includes(roleId));
      const added = addableRoleIds.filter((roleId) => !stillMissing.includes(roleId));

      if (removableRoleIds.length && stillPresent.length === removableRoleIds.length && !added.length) {
        throw new Error(`Discord прийняв запит, але ролі не знялися: ${stillPresent.join(", ")}. Перевір ієрархію ролей або чи це власник сервера.`);
      }

      if (addableRoleIds.length && stillMissing.length === addableRoleIds.length && !removed.length) {
        throw new Error(`Discord прийняв запит, але ролі не видались: ${stillMissing.join(", ")}. Перевір ієрархію ролей або чи це власник сервера.`);
      }

      return {
        userId: member.userId,
        name: displayName(member),
        serverNickname: serverNickname(member) || null,
        requested: removableRoleIds,
        requestedRemove: removableRoleIds,
        requestedAdd: addableRoleIds,
        removed,
        added,
        stillPresent,
        stillMissing,
      };
    },
    {
      profile: "external-api",
      concurrency: 1,
      min: 1,
      max: 1,
    },
  );

  const okItems = results.filter((result) => result.ok);
  const failedItems = results.filter((result) => !result.ok);
  const changedItems = okItems.filter((result) => result.value.removed.length > 0 || result.value.added.length > 0);
  const removedRolesTotal = changedItems.reduce((sum, result) => sum + result.value.removed.length, 0);
  const addedRolesTotal = changedItems.reduce((sum, result) => sum + result.value.added.length, 0);
  const stillPresentTotal = okItems.reduce((sum, result) => sum + result.value.stillPresent.length, 0);
  const stillMissingTotal = okItems.reduce((sum, result) => sum + result.value.stillMissing.length, 0);
  return {
    dryRun: false,
    template: policy.template,
    checked: members.length,
    invalidTotal: invalidMembers.length,
    matchedTargets: targets.length,
    changed: changedItems.length,
    removedRolesTotal,
    addedRolesTotal,
    unchanged: okItems.length - changedItems.length,
    stillPresentTotal,
    stillMissingTotal,
    failed: failedItems.length,
    concurrency: meta.concurrency,
    durationMs: meta.durationMs,
    checkedField: "server_nick",
    removeRoleIds: manageableRemoveRoleIds,
    addRoleIds: manageableAddRoleIds,
    missingServerNicknameTotal: targets.filter((member) => !serverNickname(member)).length,
    preview: previewTargets.slice(0, 100),
    changedItems: changedItems.slice(0, 200).map((item) => item.value),
    changedItemsTotal: changedItems.length,
    errors: failedItems.slice(0, 100).map((item) => ({
      userId: item.item.userId,
      name: displayName(item.item),
      serverNickname: serverNickname(item.item) || null,
      error: item.error instanceof Error ? item.error.message : String(item.error || "Помилка Discord API"),
    })),
    errorsTotal: failedItems.length,
  };
}



function profileDiscordId(profile: DashboardProfile) {
  const direct = snowflake(profile.providerUserId);
  return direct || "";
}

function profileCharacterRankLookupKey(character: ProfileCharacter) {
  return buildBattleNetCharacterKey(character.region || "eu", character.realmSlug || character.realmName, character.normalizedName || character.name);
}

function guildOfficerCharacters(profile: DashboardProfile, rankMap: Map<string, { rank: number | null; status: string | null; label: string | null }>) {
  return profile.characters.filter((character) => {
    if (!character.verifiedGuild) return false;
    const key = profileCharacterRankLookupKey(character);
    const rankInfo = (key && rankMap.get(key)) || guildStatusFromRank(character.guildRank);
    const status = rankInfo.status || character.guildStatus || null;
    return status === "guild_master" || status === "officer";
  });
}

export async function syncDiscordOfficerRolesFromProfiles(input: {
  roleIds?: unknown;
  limit?: unknown;
  reason?: string;
}) {
  const guildId = getDiscordGuildId();
  if (!guildId) throw new Error("Discord-сервер не підключений.");

  const roleIds = cleanRoleIds(input.roleIds);
  if (!roleIds.length) throw new Error("Вибери Discord-роль, яку потрібно видати офіцерам.");
  const manageableRoleIds = await assertDiscordRolesManageable(roleIds);
  const limit = Math.max(10, Math.min(1000, Math.floor(Number(input.limit) || 1000)));

  const [profiles, rankMap, policy] = await Promise.all([
    listDashboardProfilesForDiscordSync(limit),
    fetchBattleNetGuildRankMap().catch(() => new Map<string, { rank: number | null; status: string | null; label: string | null }>()),
    getGuildNicknamePolicy(),
  ]);

  const candidates = profiles.map((profile) => {
    const discordId = profileDiscordId(profile);
    const officers = guildOfficerCharacters(profile, rankMap);
    return { profile, discordId, officers };
  }).filter((item) => item.discordId && item.officers.length > 0);

  const { results, meta } = await mapConcurrentSettled(
    candidates,
    async (candidate) => {
      const snapshot = await memberSnapshot(candidate.discordId);
      if (!snapshot) {
        return {
          profileId: candidate.profile.profileId,
          userId: candidate.discordId,
          name: getProfilePublicName(candidate.profile),
          officerCharacters: candidate.officers.map((character) => character.name),
          skipped: true,
          skipReason: "Discord-учасника не знайдено на сервері.",
          serverNickname: null as string | null,
          added: [] as string[],
          alreadyHad: [] as string[],
          stillMissing: [] as string[],
        };
      }

      const nicknameCheck = serverNicknameValidation(snapshot, policy.template);
      if (!nicknameCheck.ok) {
        return {
          profileId: candidate.profile.profileId,
          userId: candidate.discordId,
          name: snapshot.displayName || getProfilePublicName(candidate.profile),
          officerCharacters: candidate.officers.map((character) => `${character.name}${character.guildStatusLabel ? ` (${character.guildStatusLabel})` : ""}`),
          skipped: true,
          skipReason: nicknameCheck.reason,
          serverNickname: nicknameCheck.nickname,
          added: [] as string[],
          alreadyHad: [] as string[],
          stillMissing: [] as string[],
        };
      }

      const addableRoleIds = manageableRoleIds.filter((roleId) => !snapshot.roleIds.includes(roleId));
      const alreadyHad = manageableRoleIds.filter((roleId) => snapshot.roleIds.includes(roleId));

      if (addableRoleIds.length) {
        await addGuildMemberRoles({
          guildId,
          userId: candidate.discordId,
          roleIds: addableRoleIds,
          reason: input.reason || "Mistblossom Battle.net officer sync",
          concurrency: 1,
          maxConcurrency: 1,
        });
      }

      const after = await memberSnapshot(candidate.discordId);
      const currentRoleIds = after?.roleIds || [];
      const stillMissing = addableRoleIds.filter((roleId) => !currentRoleIds.includes(roleId));
      const added = addableRoleIds.filter((roleId) => !stillMissing.includes(roleId));

      if (addableRoleIds.length && stillMissing.length === addableRoleIds.length) {
        throw new Error(`Discord прийняв запит, але офіцерська роль не зʼявилась: ${stillMissing.join(", ")}. Перевір ієрархію ролей бота.`);
      }

      return {
        profileId: candidate.profile.profileId,
        userId: candidate.discordId,
        name: after?.displayName || getProfilePublicName(candidate.profile),
        officerCharacters: candidate.officers.map((character) => `${character.name}${character.guildStatusLabel ? ` (${character.guildStatusLabel})` : ""}`),
        skipped: false,
        skipReason: "",
        serverNickname: serverNicknameValidation(after || snapshot, policy.template).nickname,
        added,
        alreadyHad,
        stillMissing,
      };
    },
    { profile: "external-api", concurrency: 1, min: 1, max: 1 },
  );

  const okItems = results.filter((item) => item.ok);
  const failedItems = results.filter((item) => !item.ok);
  const changedItems = okItems.filter((item) => !item.value.skipped && item.value.added.length > 0).map((item) => item.value);
  const skippedItems = okItems.filter((item) => item.value.skipped).map((item) => item.value);
  const alreadyHadItems = okItems.filter((item) => !item.value.skipped && item.value.added.length === 0 && item.value.alreadyHad.length > 0).map((item) => item.value);
  const addedRolesTotal = changedItems.reduce((sum, item) => sum + item.added.length, 0);
  const skippedMissingNickname = skippedItems.filter((item) => !item.serverNickname).length;
  const skippedInvalidNickname = skippedItems.filter((item) => item.serverNickname && /шаблону/i.test(item.skipReason || "")).length;

  return {
    checkedProfiles: profiles.length,
    officerProfiles: candidates.length,
    changed: changedItems.length,
    addedRolesTotal,
    alreadyHad: alreadyHadItems.length,
    skipped: skippedItems.length,
    skippedMissingNickname,
    skippedInvalidNickname,
    failed: failedItems.length,
    roleIds: manageableRoleIds,
    nicknameTemplate: policy.template,
    checkedField: "server_nick",
    concurrency: meta.concurrency,
    durationMs: meta.durationMs,
    changedItems: changedItems.slice(0, 200),
    changedItemsTotal: changedItems.length,
    skippedItems: skippedItems.slice(0, 100),
    skippedItemsTotal: skippedItems.length,
    alreadyHadItems: alreadyHadItems.slice(0, 100),
    alreadyHadItemsTotal: alreadyHadItems.length,
    errors: failedItems.slice(0, 100).map((item) => ({
      profileId: item.item.profile.profileId,
      userId: item.item.discordId,
      name: getProfilePublicName(item.item.profile),
      officerCharacters: item.item.officers.map((character) => character.name),
      error: item.error instanceof Error ? item.error.message : String(item.error || "Помилка Discord API"),
    })),
    errorsTotal: failedItems.length,
  };
}
