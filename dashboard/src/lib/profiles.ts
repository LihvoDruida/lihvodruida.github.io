import { FieldValue } from "firebase-admin/firestore";
import type { DashboardRole, DashboardSession } from "@/lib/auth";
import { createStableProfileId } from "@/lib/auth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import type { BattleNetAccountInfo, BattleNetCharacterCandidate, BattleNetRegion } from "@/lib/battlenet";

export type ProfileCharacter = BattleNetCharacterCandidate & {
  addedAt?: string | null;
  isMain?: boolean;
};

export type DashboardProfile = {
  profileId: string;
  provider: DashboardSession["provider"];
  providerUserId: string;
  displayName: string;
  login?: string | null;
  role: DashboardRole;
  avatarUrl?: string | null;
  discordRoleIds: string[];
  characters: ProfileCharacter[];
  mainCharacterKey?: string | null;
  battlenet?: {
    linked: boolean;
    region?: BattleNetRegion | string | null;
    accountLabel?: string | null;
    accountIdHash?: string | null;
    lastConnectedAt?: string | null;
    lastSyncAt?: string | null;
    totalCharacters?: number;
    scannedCharacters?: number;
    eligibleCharacters?: number;
    candidateCharacters?: ProfileCharacter[];
  } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
};

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate().toISOString();
  }
  return null;
}

function cleanRole(value: unknown): DashboardRole {
  return value === "admin" || value === "moderator" || value === "member" ? value : "member";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.slice(0, 500) : null;
}

function cleanString(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanCharacterKey(value: unknown) {
  const key = cleanString(value, 220).toLowerCase();
  return /^[a-z]{2}:[-a-z0-9]+:[-a-z0-9]+$/.test(key) ? key : "";
}

function normalizeCharacter(value: unknown, mainCharacterKey?: string | null): ProfileCharacter | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const key = cleanCharacterKey(item.key);
  const name = cleanString(item.name, 80);
  const realmSlug = cleanString(item.realmSlug, 120).toLowerCase();
  const normalizedName = cleanString(item.normalizedName, 120).toLowerCase() || name.toLowerCase();
  if (!key || !name || !realmSlug) return null;

  return {
    key,
    source: "battlenet",
    region: (cleanString(item.region, 12).toLowerCase() || "eu") as BattleNetRegion,
    name,
    normalizedName,
    realmSlug,
    realmName: cleanString(item.realmName, 120) || realmSlug,
    level: Number.isFinite(Number(item.level)) ? Number(item.level) : null,
    faction: optionalString(item.faction),
    className: optionalString(item.className),
    raceName: optionalString(item.raceName),
    genderName: optionalString(item.genderName),
    guildName: optionalString(item.guildName),
    guildRealmSlug: optionalString(item.guildRealmSlug),
    profileUrl: optionalString(item.profileUrl) || "#",
    avatarUrl: optionalString(item.avatarUrl),
    renderUrl: optionalString(item.renderUrl),
    mediaUrl: optionalString(item.mediaUrl),
    verifiedGuild: Boolean(item.verifiedGuild),
    lastSeenAt: timestampToIso(item.lastSeenAt) || optionalString(item.lastSeenAt) || null || new Date(0).toISOString(),
    addedAt: timestampToIso(item.addedAt) || optionalString(item.addedAt),
    isMain: Boolean(mainCharacterKey && key === mainCharacterKey),
  };
}

function normalizeCharacters(value: unknown, mainCharacterKey?: string | null) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const characters: ProfileCharacter[] = [];
  for (const raw of value) {
    const character = normalizeCharacter(raw, mainCharacterKey);
    if (!character || seen.has(character.key)) continue;
    seen.add(character.key);
    characters.push(character);
  }
  return characters.slice(0, 50);
}

function normalizeProfile(profileId: string, data: Record<string, unknown>): DashboardProfile {
  const mainCharacterKey = cleanCharacterKey(data.mainCharacterKey) || null;
  const battlenetRaw = data.battlenet && typeof data.battlenet === "object" ? data.battlenet as Record<string, unknown> : null;

  return {
    profileId,
    provider: data.provider === "github" || data.provider === "token" ? data.provider : "discord",
    providerUserId: String(data.providerUserId || ""),
    displayName: String(data.displayName || data.login || "Guild member").slice(0, 120),
    login: data.login ? String(data.login).slice(0, 120) : null,
    role: cleanRole(data.role),
    avatarUrl: optionalString(data.avatarUrl),
    discordRoleIds: Array.isArray(data.discordRoleIds)
      ? data.discordRoleIds.map((roleId: unknown) => String(roleId || "").trim()).filter(Boolean).slice(0, 100)
      : [],
    characters: normalizeCharacters(data.characters, mainCharacterKey),
    mainCharacterKey,
    battlenet: battlenetRaw ? {
      linked: Boolean(battlenetRaw.linked),
      region: optionalString(battlenetRaw.region),
      accountLabel: optionalString(battlenetRaw.accountLabel),
      accountIdHash: optionalString(battlenetRaw.accountIdHash),
      lastConnectedAt: timestampToIso(battlenetRaw.lastConnectedAt),
      lastSyncAt: timestampToIso(battlenetRaw.lastSyncAt),
      totalCharacters: Number.isFinite(Number(battlenetRaw.totalCharacters)) ? Number(battlenetRaw.totalCharacters) : undefined,
      scannedCharacters: Number.isFinite(Number(battlenetRaw.scannedCharacters)) ? Number(battlenetRaw.scannedCharacters) : undefined,
      eligibleCharacters: Number.isFinite(Number(battlenetRaw.eligibleCharacters)) ? Number(battlenetRaw.eligibleCharacters) : undefined,
      candidateCharacters: [],
    } : null,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    lastLoginAt: timestampToIso(data.lastLoginAt),
  };
}

export async function getOwnProfilePath(session: DashboardSession) {
  const profileId = session.profileId || (await createStableProfileId(session.provider, session.id));
  return `/profile/${profileId}`;
}

export function canViewProfile(viewer: DashboardSession | null | undefined, profileId: string) {
  if (!viewer) return false;
  if (viewer.role === "admin" || viewer.role === "moderator") return true;
  return Boolean(viewer.profileId && viewer.profileId === profileId);
}

export function canManageProfiles(viewer: DashboardSession | null | undefined) {
  return Boolean(viewer && (viewer.role === "admin" || viewer.role === "moderator"));
}

export function canManageOwnCharacters(viewer: DashboardSession | null | undefined, profileId: string) {
  return Boolean(viewer?.profileId && viewer.profileId === profileId);
}

export async function upsertProfileFromSession(session: DashboardSession) {
  const profileId = session.profileId || (await createStableProfileId(session.provider, session.id));
  const profile: DashboardProfile = {
    profileId,
    provider: session.provider,
    providerUserId: session.id,
    displayName: session.name || session.login || "Guild member",
    login: session.login || null,
    role: session.role,
    avatarUrl: session.avatar_url || session.avatar || null,
    discordRoleIds: Array.from(new Set((session.discordRoleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean))).slice(0, 100),
    characters: [],
    mainCharacterKey: null,
    battlenet: null,
  };

  if (!hasFirebaseProfileConfig()) {
    return { profile, stored: false, reason: "firebase-not-configured" as const };
  }

  const db = getFirebaseAdminDb();
  const ref = db.collection("dashboardProfiles").doc(profileId);
  const snapshot = await ref.get();
  await ref.set({
    profileId,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    displayName: profile.displayName,
    login: profile.login || null,
    role: profile.role,
    avatarUrl: profile.avatarUrl || null,
    discordRoleIds: profile.discordRoleIds,
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp(), characters: [], mainCharacterKey: null }),
  }, { merge: true });

  return { profile, stored: true };
}

export async function getProfileById(profileId: string) {
  if (!/^id[a-f0-9]{16,40}$/.test(profileId)) return null;
  if (!hasFirebaseProfileConfig()) return null;

  const snapshot = await getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId).get();
  if (!snapshot.exists) return null;
  return normalizeProfile(profileId, snapshot.data() || {});
}

export async function getProfileByDiscordUserId(discordUserId: string) {
  const cleanDiscordId = String(discordUserId || "").trim();
  if (!/^\d{16,25}$/.test(cleanDiscordId)) return null;
  if (!hasFirebaseProfileConfig()) return null;

  // Fast path: current stable document id. This is what new Discord logins use.
  const stableProfileId = await createStableProfileId("discord", cleanDiscordId);
  const stableProfile = await getProfileById(stableProfileId);
  if (stableProfile) return stableProfile;

  // Compatibility path for existing Firebase profiles. If PROFILE_ID_SECRET or
  // SESSION_SECRET was rotated after a profile was created, the deterministic
  // document id changes. Querying Firestore by providerUserId keeps already
  // stored dashboardProfiles documents usable for Worker lookups.
  const db = getFirebaseAdminDb();
  const byProviderUserId = await db.collection("dashboardProfiles")
    .where("providerUserId", "==", cleanDiscordId)
    .limit(5)
    .get();

  for (const doc of byProviderUserId.docs) {
    const profile = normalizeProfile(doc.id, doc.data() || {});
    if (profile.provider === "discord" || profile.providerUserId === cleanDiscordId) {
      return profile;
    }
  }

  // Older experiments may have stored the Discord id under a direct field.
  // Keep these fallbacks cheap and limited.
  for (const field of ["discordId", "discordUserId"]) {
    const snapshot = await db.collection("dashboardProfiles")
      .where(field, "==", cleanDiscordId)
      .limit(1)
      .get()
      .catch(() => null);

    const doc = snapshot?.docs?.[0];
    if (doc) return normalizeProfile(doc.id, doc.data() || {});
  }

  return null;
}

export function profileFromSession(session: DashboardSession): DashboardProfile {
  return {
    profileId: session.profileId || "",
    provider: session.provider,
    providerUserId: session.id,
    displayName: session.name || session.login || "Guild member",
    login: session.login || null,
    role: session.role,
    avatarUrl: session.avatar_url || session.avatar || null,
    discordRoleIds: session.discordRoleIds || [],
    characters: [],
    mainCharacterKey: null,
    battlenet: null,
  };
}

export async function saveBattleNetSyncState(profileId: string, scan: {
  region: BattleNetRegion | string;
  totalCharacters: number;
  scannedCharacters: number;
  eligibleCharacters: number;
}, account?: BattleNetAccountInfo | null) {
  if (!/^id[a-f0-9]{16,40}$/.test(profileId)) throw new Error("Некоректний ID профілю.");
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase профілі не налаштовані.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  await ref.set({
    battlenet: {
      linked: true,
      region: scan.region,
      accountLabel: account?.accountLabel || null,
      accountIdHash: account?.accountIdHash || null,
      lastConnectedAt: FieldValue.serverTimestamp(),
      lastSyncAt: FieldValue.serverTimestamp(),
      totalCharacters: scan.totalCharacters,
      scannedCharacters: scan.scannedCharacters,
      eligibleCharacters: scan.eligibleCharacters,
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await ref.update({ "battlenet.candidateCharacters": FieldValue.delete() }).catch(() => null);
}

export async function addProfileCharacter(profileId: string, candidateInput: BattleNetCharacterCandidate) {
  const candidate = normalizeCharacter(candidateInput, null);
  const cleanKey = cleanCharacterKey(candidate?.key);
  if (!candidate || !cleanKey || !candidate.verifiedGuild) {
    throw new Error("Цей персонаж не підтверджений через Battle.net або не належить до Mistblossom Vanguard.");
  }
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase профілі не налаштовані.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");
    const profile = normalizeProfile(profileId, snapshot.data() || {});
    const current = profile.characters;
    if (current.some((item) => item.key === cleanKey)) return;

    const now = new Date().toISOString();
    const nextCharacter: ProfileCharacter = { ...candidate, addedAt: now, lastSeenAt: candidate.lastSeenAt || now };
    const nextCharacters = [...current, nextCharacter].slice(0, 50);
    const mainCharacterKey = profile.mainCharacterKey || nextCharacter.key;

    transaction.set(ref, {
      characters: nextCharacters,
      mainCharacterKey,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}


export async function addProfileCharacters(profileId: string, candidateInputs: BattleNetCharacterCandidate[]) {
  const normalized = new Map<string, ProfileCharacter>();
  for (const input of candidateInputs || []) {
    const candidate = normalizeCharacter(input, null);
    const cleanKey = cleanCharacterKey(candidate?.key);
    if (!candidate || !cleanKey || !candidate.verifiedGuild) continue;
    normalized.set(cleanKey, candidate);
  }

  if (!normalized.size) {
    throw new Error("Немає підтверджених персонажів для додавання.");
  }
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase профілі не налаштовані.");

  const addedKeys: string[] = [];
  const skippedKeys: string[] = [];
  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);

  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");

    const profile = normalizeProfile(profileId, snapshot.data() || {});
    const current = profile.characters;
    const currentKeys = new Set(current.map((item) => item.key));
    const now = new Date().toISOString();
    const nextCharacters = [...current];

    for (const [key, candidate] of normalized) {
      if (currentKeys.has(key)) {
        skippedKeys.push(key);
        continue;
      }
      if (nextCharacters.length >= 50) {
        skippedKeys.push(key);
        continue;
      }

      nextCharacters.push({ ...candidate, addedAt: now, lastSeenAt: candidate.lastSeenAt || now });
      currentKeys.add(key);
      addedKeys.push(key);
    }

    if (!addedKeys.length) return;

    transaction.set(ref, {
      characters: nextCharacters,
      mainCharacterKey: profile.mainCharacterKey || nextCharacters[0]?.key || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { added: addedKeys.length, skipped: skippedKeys.length, addedKeys, skippedKeys };
}

export async function removeProfileCharacter(profileId: string, characterKey: string) {
  const cleanKey = cleanCharacterKey(characterKey);
  if (!cleanKey) throw new Error("Некоректний персонаж.");
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase профілі не налаштовані.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");
    const profile = normalizeProfile(profileId, snapshot.data() || {});
    const nextCharacters = profile.characters.filter((item) => item.key !== cleanKey);
    const nextMain = profile.mainCharacterKey === cleanKey ? nextCharacters[0]?.key || null : profile.mainCharacterKey || null;

    transaction.set(ref, {
      characters: nextCharacters,
      mainCharacterKey: nextMain,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function setMainProfileCharacter(profileId: string, characterKey: string) {
  const cleanKey = cleanCharacterKey(characterKey);
  if (!cleanKey) throw new Error("Некоректний персонаж.");
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase профілі не налаштовані.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");
    const profile = normalizeProfile(profileId, snapshot.data() || {});
    if (!profile.characters.some((item) => item.key === cleanKey)) {
      throw new Error("Персонаж не доданий до профілю.");
    }

    transaction.set(ref, {
      mainCharacterKey: cleanKey,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export function getMainCharacter(profile: DashboardProfile) {
  return profile.characters.find((item) => item.key === profile.mainCharacterKey) || profile.characters[0] || null;
}
