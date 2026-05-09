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
  replaceGuildMemberRoles,
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roleListWithout(roleIds: string[], removeIds: string[]) {
  const removeSet = new Set(removeIds);
  return roleIds.filter((roleId) => !removeSet.has(roleId));
}

function roleListWith(roleIds: string[], addIds: string[]) {
  return Array.from(new Set([...roleIds, ...addIds].filter(Boolean)));
}

async function waitForMemberRoles(userId: string, predicate: (roleIds: string[]) => boolean, attempts = 6) {
  let snapshot = await memberSnapshot(userId);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (snapshot && predicate(snapshot.roleIds)) return snapshot;
    await sleep(350 + attempt * 180);
    snapshot = await memberSnapshot(userId);
  }
  return snapshot;
}

async function applyDiscordRoleDelta(params: {
  guildId: string;
  userId: string;
  addRoleIds?: string[];
  removeRoleIds?: string[];
  reason?: string;
  actionLabel?: string;
}) {
  const before = await memberSnapshot(params.userId);
  if (!before) throw new Error("Discord-учасника не знайдено на сервері або бот не може його прочитати.");

  const requestedAdd = Array.from(new Set((params.addRoleIds || []).filter(Boolean)));
  const requestedRemove = Array.from(new Set((params.removeRoleIds || []).filter(Boolean)));
  const addSet = new Set(requestedAdd);
  const removeSet = new Set(requestedRemove);
  const conflictedRoleIds = requestedAdd.filter((roleId) => removeSet.has(roleId));
  if (conflictedRoleIds.length) {
    throw new Error(`Одна й та сама Discord-роль не може одночасно видаватись і зніматись: ${conflictedRoleIds.join(", ")}.`);
  }

  const addableRoleIds = requestedAdd.filter((roleId) => !before.roleIds.includes(roleId));
  const removableRoleIds = requestedRemove.filter((roleId) => before.roleIds.includes(roleId));
  const alreadyHadRoleIds = requestedAdd.filter((roleId) => before.roleIds.includes(roleId));
  const alreadyMissingRoleIds = requestedRemove.filter((roleId) => !before.roleIds.includes(roleId));

  if (!addableRoleIds.length && !removableRoleIds.length) {
    return {
      before,
      after: before,
      requestedAddRoleIds: requestedAdd,
      requestedRemoveRoleIds: requestedRemove,
      addableRoleIds,
      removableRoleIds,
      alreadyHadRoleIds,
      alreadyMissingRoleIds,
      addedRoleIds: [] as string[],
      removedRoleIds: [] as string[],
      stillMissingRoleIds: [] as string[],
      stillPresentRoleIds: [] as string[],
      usedPatchFallback: false,
      changed: 0,
      expectedChangeTotal: 0,
      unchangedBecauseAlreadyCorrect: alreadyHadRoleIds.length + alreadyMissingRoleIds.length,
      hasRequestedRole(roleId: string) {
        return addSet.has(roleId) || removeSet.has(roleId);
      },
    };
  }

  if (removableRoleIds.length) {
    await removeGuildMemberRoles({
      guildId: params.guildId,
      userId: params.userId,
      roleIds: removableRoleIds,
      reason: params.reason,
      concurrency: 1,
      maxConcurrency: 1,
    });
  }

  if (addableRoleIds.length) {
    await addGuildMemberRoles({
      guildId: params.guildId,
      userId: params.userId,
      roleIds: addableRoleIds,
      reason: params.reason,
      concurrency: 1,
      maxConcurrency: 1,
    });
  }

  let after = await waitForMemberRoles(params.userId, (roleIds) => {
    const removeOk = removableRoleIds.every((roleId) => !roleIds.includes(roleId));
    const addOk = addableRoleIds.every((roleId) => roleIds.includes(roleId));
    return removeOk && addOk;
  });

  let stillPresentRoleIds = removableRoleIds.filter((roleId) => after?.roleIds.includes(roleId));
  let stillMissingRoleIds = addableRoleIds.filter((roleId) => !after?.roleIds.includes(roleId));
  let usedPatchFallback = false;

  if ((stillPresentRoleIds.length || stillMissingRoleIds.length) && after) {
    usedPatchFallback = true;
    const desiredRoles = roleListWith(roleListWithout(after.roleIds, stillPresentRoleIds), stillMissingRoleIds);
    await replaceGuildMemberRoles({
      guildId: params.guildId,
      userId: params.userId,
      roleIds: desiredRoles,
      reason: `${params.reason || params.actionLabel || "Mistblossom role update"} (fallback role set)`,
    });
    after = await waitForMemberRoles(params.userId, (roleIds) => {
      const removeOk = removableRoleIds.every((roleId) => !roleIds.includes(roleId));
      const addOk = addableRoleIds.every((roleId) => roleIds.includes(roleId));
      return removeOk && addOk;
    });
    stillPresentRoleIds = removableRoleIds.filter((roleId) => after?.roleIds.includes(roleId));
    stillMissingRoleIds = addableRoleIds.filter((roleId) => !after?.roleIds.includes(roleId));
  }

  if (!after) throw new Error("Discord прийняв запит, але не вдалося повторно прочитати учасника для перевірки результату. Успіх не підтверджено.");

  const removedRoleIds = removableRoleIds.filter((roleId) => !after.roleIds.includes(roleId));
  const addedRoleIds = addableRoleIds.filter((roleId) => after.roleIds.includes(roleId));

  return {
    before,
    after,
    requestedAddRoleIds: requestedAdd,
    requestedRemoveRoleIds: requestedRemove,
    addableRoleIds,
    removableRoleIds,
    alreadyHadRoleIds,
    alreadyMissingRoleIds,
    addedRoleIds,
    removedRoleIds,
    stillMissingRoleIds,
    stillPresentRoleIds,
    usedPatchFallback,
    changed: addedRoleIds.length + removedRoleIds.length,
    expectedChangeTotal: addableRoleIds.length + removableRoleIds.length,
    unchangedBecauseAlreadyCorrect: alreadyHadRoleIds.length + alreadyMissingRoleIds.length,
    hasRequestedRole(roleId: string) {
      return addSet.has(roleId) || removeSet.has(roleId);
    },
  };
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

  let delta: Awaited<ReturnType<typeof applyDiscordRoleDelta>>;
  try {
    delta = await applyDiscordRoleDelta({
      guildId,
      userId,
      addRoleIds: manageableRoleIds,
      reason: input.reason || "Mistblossom manual role add",
      actionLabel: "Видача ролі",
    });
  } catch (error) {
    throw new Error(explainDiscordModerationError(error, "Видача ролі"));
  }

  if (delta.stillMissingRoleIds.length) {
    throw new Error(`Discord прийняв запит, але ролі не зʼявилися в учасника: ${delta.stillMissingRoleIds.join(", ")}. Перевір ієрархію ролей бота.`);
  }

  return {
    userId,
    roleIds: manageableRoleIds,
    requestedRoleIds: roleIds,
    addedRoleIds: delta.addedRoleIds,
    alreadyHadRoleIds: delta.alreadyHadRoleIds,
    stillMissingRoleIds: delta.stillMissingRoleIds,
    beforeRoleIds: delta.before.roleIds,
    afterRoleIds: delta.after.roleIds,
    changed: delta.addedRoleIds.length,
    expectedChangeTotal: delta.expectedChangeTotal,
    usedPatchFallback: delta.usedPatchFallback,
    displayName: delta.after.displayName || delta.before.displayName || userId,
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

  let delta: Awaited<ReturnType<typeof applyDiscordRoleDelta>>;
  try {
    delta = await applyDiscordRoleDelta({
      guildId,
      userId,
      removeRoleIds: manageableRoleIds,
      reason: input.reason || "Mistblossom manual role remove",
      actionLabel: "Зняття ролі",
    });
  } catch (error) {
    throw new Error(explainDiscordModerationError(error, "Зняття ролі"));
  }

  if (delta.stillPresentRoleIds.length) {
    throw new Error(`Discord прийняв запит, але ролі досі є в учасника: ${delta.stillPresentRoleIds.join(", ")}. Перевір ієрархію ролей бота.`);
  }

  return {
    userId,
    roleIds: manageableRoleIds,
    requestedRoleIds: roleIds,
    removedRoleIds: delta.removedRoleIds,
    alreadyMissingRoleIds: delta.alreadyMissingRoleIds,
    stillPresentRoleIds: delta.stillPresentRoleIds,
    beforeRoleIds: delta.before.roleIds,
    afterRoleIds: delta.after.roleIds,
    changed: delta.removedRoleIds.length,
    expectedChangeTotal: delta.expectedChangeTotal,
    usedPatchFallback: delta.usedPatchFallback,
    displayName: delta.after.displayName || delta.before.displayName || userId,
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
      const fresh = await memberSnapshot(member.userId);
      const currentRoleIds = fresh?.roleIds || member.roleIds;
      const removableRoleIds = manageableRemoveRoleIds.filter((roleId) => currentRoleIds.includes(roleId));
      const addableRoleIds = manageableAddRoleIds.filter((roleId) => !currentRoleIds.includes(roleId));

      const delta = await applyDiscordRoleDelta({
        guildId,
        userId: member.userId,
        removeRoleIds: removableRoleIds,
        addRoleIds: addableRoleIds,
        reason: input.reason || `Nickname does not match template: ${policy.template}`,
        actionLabel: "Ролі за неправильний серверний нік",
      });

      if (delta.stillPresentRoleIds.length) {
        throw new Error(`Discord прийняв запит, але ролі не знялися: ${delta.stillPresentRoleIds.join(", ")}. Перевір ієрархію ролей або чи це власник сервера.`);
      }

      if (delta.stillMissingRoleIds.length) {
        throw new Error(`Discord прийняв запит, але ролі не видались: ${delta.stillMissingRoleIds.join(", ")}. Перевір ієрархію ролей або чи це власник сервера.`);
      }

      return {
        userId: member.userId,
        name: fresh?.displayName || displayName(member),
        serverNickname: serverNickname(member) || null,
        requested: removableRoleIds,
        requestedRemove: removableRoleIds,
        requestedAdd: addableRoleIds,
        removed: delta.removedRoleIds,
        added: delta.addedRoleIds,
        stillPresent: delta.stillPresentRoleIds,
        stillMissing: delta.stillMissingRoleIds,
        beforeRoleIds: delta.before.roleIds,
        afterRoleIds: delta.after.roleIds,
        usedPatchFallback: delta.usedPatchFallback,
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

      let delta: Awaited<ReturnType<typeof applyDiscordRoleDelta>>;
      try {
        delta = await applyDiscordRoleDelta({
          guildId,
          userId: candidate.discordId,
          addRoleIds: manageableRoleIds,
          reason: input.reason || "Mistblossom Battle.net officer sync",
          actionLabel: "Синхронізація офіцерської ролі",
        });
      } catch (error) {
        throw new Error(explainDiscordModerationError(error, "Синхронізація офіцерської ролі"));
      }

      if (delta.stillMissingRoleIds.length) {
        throw new Error(`Discord прийняв запит, але офіцерська роль не зʼявилась: ${delta.stillMissingRoleIds.join(", ")}. Перевір ієрархію ролей бота.`);
      }

      return {
        profileId: candidate.profile.profileId,
        userId: candidate.discordId,
        name: delta.after.displayName || getProfilePublicName(candidate.profile),
        officerCharacters: candidate.officers.map((character) => `${character.name}${character.guildStatusLabel ? ` (${character.guildStatusLabel})` : ""}`),
        skipped: false,
        skipReason: "",
        serverNickname: serverNicknameValidation(delta.after || snapshot, policy.template).nickname,
        added: delta.addedRoleIds,
        alreadyHad: delta.alreadyHadRoleIds,
        stillMissing: delta.stillMissingRoleIds,
        beforeRoleIds: delta.before.roleIds,
        afterRoleIds: delta.after.roleIds,
        usedPatchFallback: delta.usedPatchFallback,
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
