import { FieldValue } from "firebase-admin/firestore";
import type { DashboardRole, DashboardSession } from "@/lib/auth";
import { createStableProfileId } from "@/lib/auth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { fetchBattleNetCharacterSnapshot, type BattleNetAccountInfo, type BattleNetCharacterCandidate, type BattleNetRegion } from "@/lib/battlenet";
import { buildBattleNetCharacterKey, normalizeBattleNetNameSlug, normalizeBattleNetRealmSlug, normalizeCharacterKey } from "@/lib/wowCharacters";
import { normalizeWowRole, resolveWowCharacterRole, type WowCharacterRole } from "@/lib/wowRoles";

export type ProfileCharacter = BattleNetCharacterCandidate & {
  addedAt?: string | null;
  isMain?: boolean;
};

export type ProfilePublicNameMode = "name" | "server_nickname";

export type DashboardProfile = {
  profileId: string;
  provider: DashboardSession["provider"];
  providerUserId: string;
  displayName: string;
  preferredName?: string | null;
  publicNameMode?: ProfilePublicNameMode;
  login?: string | null;
  role: DashboardRole;
  avatarUrl?: string | null;
  discordRoleIds: string[];
  characters: ProfileCharacter[];
  mainCharacterKey?: string | null;
  raidRolePreference?: {
    characterKey: string;
    role: WowCharacterRole | null;
    updatedAt?: string | null;
  } | null;
  discordNickname?: {
    value?: string | null;
    syncedAt?: string | null;
    sourcePreferredName?: string | null;
    sourceCharacters?: string[];
  } | null;
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
  return value === "admin" || value === "moderator" || value === "mentor" || value === "member" ? value : "member";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.slice(0, 500) : null;
}

function cleanString(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sliceCodePoints(value: string, maxLength: number) {
  return Array.from(value).slice(0, Math.max(0, maxLength)).join("");
}

function codePointLength(value: string) {
  return Array.from(value || "").length;
}

function cleanProfileName(value: unknown, maxLength = 32) {
  const cleaned = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>@#`*_~|{}[\]\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?'"ʼ’\-]+|[\s.,;:!?'"ʼ’\-]+$/g, "")
    .trim();
  return sliceCodePoints(cleaned, maxLength).trim();
}

function cleanDiscordNicknamePart(value: unknown, maxLength = 32) {
  return cleanProfileName(value, maxLength).replace(/[\[\]]/g, "").trim();
}

function cleanAuthorName(value: unknown, maxLength = 80) {
  const cleaned = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>@#`*_~|{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?"ʼ’\-]+|[\s.,;:!?"ʼ’\-]+$/g, "")
    .trim();
  return sliceCodePoints(cleaned, maxLength).trim();
}

function cleanCharacterKey(value: unknown) {
  return normalizeCharacterKey(value);
}

function cleanProfilePublicNameMode(value: unknown): ProfilePublicNameMode {
  return value === "server_nickname" ? "server_nickname" : "name";
}

function normalizeCharacter(value: unknown, mainCharacterKey?: string | null): ProfileCharacter | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const key = cleanCharacterKey(item.key);
  const name = cleanString(item.name, 80);
  const realmSlug = normalizeBattleNetRealmSlug(item.realmSlug);
  const normalizedName = normalizeBattleNetNameSlug(item.normalizedName || name);
  if (!key || !name || !realmSlug) return null;

  const className = optionalString(item.className);
  const activeSpecName = optionalString(item.activeSpecName || item.active_spec_name || item.specName || item.spec_name);
  const activeSpecId = Number.isFinite(Number(item.activeSpecId || item.active_spec_id || item.specId || item.spec_id))
    ? Math.floor(Number(item.activeSpecId || item.active_spec_id || item.specId || item.spec_id))
    : null;
  const activeSpecRole = resolveWowCharacterRole({
    className,
    activeSpecName,
    activeSpecId,
    activeSpecRole: item.activeSpecRole || item.active_spec_role || item.role,
  });

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
    className,
    activeSpecName,
    activeSpecId,
    activeSpecRole,
    raceName: optionalString(item.raceName),
    genderName: optionalString(item.genderName),
    guildName: optionalString(item.guildName),
    guildRealmSlug: optionalString(item.guildRealmSlug),
    profileUrl: optionalString(item.profileUrl) || "#",
    avatarUrl: optionalString(item.avatarUrl),
    renderUrl: optionalString(item.renderUrl),
    mediaUrl: optionalString(item.mediaUrl),
    verifiedGuild: Boolean(item.verifiedGuild),
    itemLevel: Number.isFinite(Number(item.itemLevel)) ? Number(item.itemLevel) : null,
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

function normalizeRaidRolePreference(value: unknown, mainCharacterKey?: string | null): DashboardProfile["raidRolePreference"] {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const characterKey = cleanCharacterKey(item.characterKey);
  const role = normalizeWowRole(item.role);
  if (!characterKey || !role) return null;

  // Manual raid role belongs to the current main only. If the main changes,
  // stale choices are ignored instead of being applied to a different character.
  if (mainCharacterKey && characterKey !== mainCharacterKey) return null;

  return {
    characterKey,
    role,
    updatedAt: timestampToIso(item.updatedAt) || optionalString(item.updatedAt),
  };
}

function normalizeProfile(profileId: string, data: Record<string, unknown>): DashboardProfile {
  const mainCharacterKey = cleanCharacterKey(data.mainCharacterKey) || null;
  const battlenetRaw = data.battlenet && typeof data.battlenet === "object" ? data.battlenet as Record<string, unknown> : null;
  const discordNicknameRaw = data.discordNickname && typeof data.discordNickname === "object" ? data.discordNickname as Record<string, unknown> : null;

  return {
    profileId,
    provider: data.provider === "github" || data.provider === "token" ? data.provider : "discord",
    providerUserId: String(data.providerUserId || ""),
    displayName: String(data.displayName || data.login || "Guild member").slice(0, 120),
    preferredName: cleanProfileName(data.preferredName, 32) || null,
    publicNameMode: cleanProfilePublicNameMode(data.publicNameMode),
    login: data.login ? String(data.login).slice(0, 120) : null,
    role: cleanRole(data.role),
    avatarUrl: optionalString(data.avatarUrl),
    discordRoleIds: Array.isArray(data.discordRoleIds)
      ? data.discordRoleIds.map((roleId: unknown) => String(roleId || "").trim()).filter(Boolean).slice(0, 100)
      : [],
    characters: normalizeCharacters(data.characters, mainCharacterKey),
    mainCharacterKey,
    raidRolePreference: normalizeRaidRolePreference(data.raidRolePreference, mainCharacterKey),
    discordNickname: discordNicknameRaw ? {
      value: cleanDiscordNicknamePart(discordNicknameRaw.value, 32) || null,
      syncedAt: timestampToIso(discordNicknameRaw.syncedAt) || optionalString(discordNicknameRaw.syncedAt),
      sourcePreferredName: cleanProfileName(discordNicknameRaw.sourcePreferredName, 32) || null,
      sourceCharacters: Array.isArray(discordNicknameRaw.sourceCharacters)
        ? discordNicknameRaw.sourceCharacters.map((item: unknown) => cleanDiscordNicknamePart(item, 16)).filter(Boolean).slice(0, 3)
        : [],
    } : null,
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

export function canViewProfile(
  viewer: DashboardSession | null | undefined,
  profileId: string,
  profile?: Pick<DashboardProfile, "role" | "profileId"> | null,
) {
  if (!viewer) return false;
  const ownProfileId = viewer.profileId || "";
  const isOwnProfile = Boolean(ownProfileId && ownProfileId === profileId);
  if (isOwnProfile) return true;

  // Existing saved profiles are safe to open as public member pages.
  // Access details, Discord role lists and technical fields are still hidden
  // unless canViewProfileAccessDetails(viewer) allows them on the page.
  if (profile) return true;

  return viewer.role === "admin" || viewer.role === "moderator";
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
    preferredName: null,
    publicNameMode: "name",
    login: session.login || null,
    role: session.role,
    avatarUrl: session.avatar_url || session.avatar || null,
    discordRoleIds: Array.from(new Set((session.discordRoleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean))).slice(0, 100),
    characters: [],
    mainCharacterKey: null,
    raidRolePreference: null,
    discordNickname: null,
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
    ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp(), characters: [], mainCharacterKey: null, raidRolePreference: null, publicNameMode: "name" }),
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


export async function listDashboardProfiles(params: {
  viewer: DashboardSession;
  query?: string;
  limit?: number;
}): Promise<DashboardProfile[]> {
  if (!hasFirebaseProfileConfig()) return [];

  const safeLimit = Math.max(10, Math.min(200, Number(params.limit || 120)));
  const query = String(params.query || "").trim().toLowerCase();
  const snapshot = await getFirebaseAdminDb().collection("dashboardProfiles").limit(safeLimit).get();
  const profiles: DashboardProfile[] = snapshot.docs
    .map((doc: any) => normalizeProfile(doc.id, doc.data() || {}))
    .filter((profile: DashboardProfile) => canViewProfile(params.viewer, profile.profileId, profile));

  const filtered = query
    ? profiles.filter((profile: DashboardProfile) => [
        getProfilePublicName(profile),
        getProfileSiteName(profile),
        getProfileServerStyleName(profile),
        profile.displayName,
        profile.preferredName,
        profile.login,
        profile.role,
        profile.provider,
        profile.characters.map((item: ProfileCharacter) => item.name).join(" "),
        profile.characters.map((item: ProfileCharacter) => item.realmName || item.realmSlug).join(" "),
        getMainCharacter(profile)?.name,
      ].some((value) => String(value || "").toLowerCase().includes(query)))
    : profiles;

  return filtered.sort((a: DashboardProfile, b: DashboardProfile) => {
    const aTime = Date.parse(a.lastLoginAt || a.updatedAt || a.createdAt || "") || 0;
    const bTime = Date.parse(b.lastLoginAt || b.updatedAt || b.createdAt || "") || 0;
    return bTime - aTime || getProfilePublicName(a).localeCompare(getProfilePublicName(b), "uk");
  });
}

export type CharacterProfileLink = {
  profileId: string;
  displayName: string;
};

type CharacterProfileLinksCacheEntry = {
  checkedAt: number;
  links: Map<string, CharacterProfileLink>;
};

declare global {
  // eslint-disable-next-line no-var
  var __mistblossomCharacterProfileLinksCache: CharacterProfileLinksCacheEntry | undefined;
}

function characterProfileLinksCacheTtlMs() {
  const parsed = Number(process.env.PROFILE_CHARACTER_LINK_CACHE_SECONDS || 120);
  if (!Number.isFinite(parsed)) return 120_000;
  return Math.max(30, Math.min(900, Math.floor(parsed))) * 1000;
}

export function clearCharacterProfileLinksCache() {
  globalThis.__mistblossomCharacterProfileLinksCache = undefined;
}

function characterProfileLinkKeys(character: ProfileCharacter) {
  const keys = new Set<string>();
  const existingKey = normalizeCharacterKey(character.key);
  if (existingKey) keys.add(existingKey);

  const region = character.region || "eu";
  const realmValues = [character.realmSlug, character.realmName].filter(Boolean);
  const nameValues = [character.normalizedName, character.name].filter(Boolean);

  for (const realm of realmValues) {
    for (const name of nameValues) {
      const key = buildBattleNetCharacterKey(region, realm, name);
      if (key) keys.add(key);
    }
  }

  return keys;
}

export async function listCharacterProfileLinks() {
  const emptyLinks = new Map<string, CharacterProfileLink>();
  if (!hasFirebaseProfileConfig()) return emptyLinks;

  const cached = globalThis.__mistblossomCharacterProfileLinksCache;
  const ttlMs = characterProfileLinksCacheTtlMs();
  if (cached && Date.now() - cached.checkedAt < ttlMs) {
    return new Map(cached.links);
  }

  const contenders = new Map<string, { link: CharacterProfileLink; profileIds: Set<string>; duplicate: boolean }>();
  const snapshot = await getFirebaseAdminDb().collection("dashboardProfiles").limit(1000).get();
  const profiles = snapshot.docs.map((doc: any) => normalizeProfile(doc.id, doc.data() || {}));

  for (const profile of profiles) {
    const displayName = getProfilePublicName(profile);
    for (const character of profile.characters) {
      for (const key of characterProfileLinkKeys(character)) {
        const existing = contenders.get(key);
        if (!existing) {
          contenders.set(key, {
            link: { profileId: profile.profileId, displayName },
            profileIds: new Set([profile.profileId]),
            duplicate: false,
          });
          continue;
        }

        existing.profileIds.add(profile.profileId);
        if (existing.profileIds.size > 1) {
          existing.duplicate = true;
        }
      }
    }
  }

  const links = new Map<string, CharacterProfileLink>();
  for (const [key, contender] of contenders) {
    if (!contender.duplicate) links.set(key, contender.link);
  }

  globalThis.__mistblossomCharacterProfileLinksCache = { checkedAt: Date.now(), links: new Map(links) };
  return links;
}

export function profileFromSession(session: DashboardSession): DashboardProfile {
  return {
    profileId: session.profileId || "",
    provider: session.provider,
    providerUserId: session.id,
    displayName: session.name || session.login || "Guild member",
    preferredName: null,
    publicNameMode: "name",
    login: session.login || null,
    role: session.role,
    avatarUrl: session.avatar_url || session.avatar || null,
    discordRoleIds: session.discordRoleIds || [],
    characters: [],
    mainCharacterKey: null,
    raidRolePreference: null,
    discordNickname: null,
    battlenet: null,
  };
}

export async function saveBattleNetSyncState(profileId: string, scan: {
  region: BattleNetRegion | string;
  totalCharacters: number;
  scannedCharacters: number;
  eligibleCharacters: number;
  characters?: BattleNetCharacterCandidate[];
}, account?: BattleNetAccountInfo | null) {
  if (!/^id[a-f0-9]{16,40}$/.test(profileId)) throw new Error("Некоректний ID профілю.");
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  const snapshot = await ref.get();
  const payload: Record<string, unknown> = {
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
  };

  if (snapshot.exists && Array.isArray(scan.characters) && scan.characters.length) {
    const profile = normalizeProfile(profileId, snapshot.data() || {});
    const freshByKey = new Map<string, ProfileCharacter>();
    for (const candidateInput of scan.characters) {
      const candidate = normalizeCharacter(candidateInput, null);
      if (candidate?.key) freshByKey.set(candidate.key, candidate);
    }

    if (freshByKey.size && profile.characters.length) {
      payload.characters = profile.characters.map((current) => {
        const fresh = freshByKey.get(current.key);
        if (!fresh) return current;
        return {
          ...current,
          ...fresh,
          addedAt: current.addedAt || fresh.addedAt || null,
          isMain: current.isMain,
        };
      });
    }
  }

  await ref.set(payload, { merge: true });
  await ref.update({ "battlenet.candidateCharacters": FieldValue.delete() }).catch(() => null);
}

function mergeFreshCharacter(current: ProfileCharacter, fresh: ProfileCharacter): ProfileCharacter {
  return {
    ...current,
    ...fresh,
    key: current.key,
    addedAt: current.addedAt || fresh.addedAt || null,
    isMain: current.isMain,
    verifiedGuild: fresh.verifiedGuild || current.verifiedGuild,
    lastSeenAt: fresh.lastSeenAt || current.lastSeenAt || new Date().toISOString(),
  };
}

async function refreshCharacterSnapshot(current: ProfileCharacter) {
  const fresh = await fetchBattleNetCharacterSnapshot(current);
  if (!fresh) return null;
  const normalized = normalizeCharacter({ ...fresh, key: current.key }, current.isMain ? current.key : null);
  return normalized;
}

export async function refreshProfileCharactersForRaidSignup(profile: DashboardProfile | null | undefined) {
  if (!profile?.profileId || !profile.characters.length || !hasFirebaseProfileConfig()) return profile || null;

  const mainKey = profile.mainCharacterKey || profile.characters[0]?.key || "";
  const main = profile.characters.find((item) => item.key === mainKey) || profile.characters[0] || null;
  if (!main) return profile;

  const freshByKey = new Map<string, ProfileCharacter>();
  let refreshed = 0;
  let failed = 0;

  try {
    const freshMain = await refreshCharacterSnapshot(main);
    if (freshMain?.key) {
      freshByKey.set(main.key, freshMain);
      refreshed += 1;
    }
  } catch {
    failed += 1;
  }

  const rest = profile.characters.filter((item) => item.key !== main.key);
  const restLimit = Math.max(0, Math.min(Number(process.env.BATTLENET_SIGNUP_REFRESH_REST_LIMIT || rest.length) || rest.length, rest.length));
  const restToRefresh = rest.slice(0, restLimit);
  const concurrency = Math.max(1, Math.min(Number(process.env.BATTLENET_SIGNUP_REFRESH_CONCURRENCY || 4) || 4, 8));

  for (let index = 0; index < restToRefresh.length; index += concurrency) {
    const batch = restToRefresh.slice(index, index + concurrency);
    const results = await Promise.all(batch.map(async (character) => {
      try {
        const fresh = await refreshCharacterSnapshot(character);
        return fresh ? { character, fresh } : null;
      } catch {
        failed += 1;
        return null;
      }
    }));

    for (const result of results) {
      if (!result?.fresh?.key) continue;
      freshByKey.set(result.character.key, result.fresh);
      refreshed += 1;
    }
  }

  if (!freshByKey.size) return profile;

  const nextCharacters = profile.characters.map((current) => {
    const fresh = freshByKey.get(current.key);
    return fresh ? mergeFreshCharacter(current, fresh) : current;
  });

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profile.profileId);
  await ref.set({
    characters: nextCharacters,
    battlenet: {
      linked: profile.battlenet?.linked ?? true,
      region: profile.battlenet?.region || main.region || "eu",
      lastSyncAt: FieldValue.serverTimestamp(),
      lastCharacterRefreshAt: FieldValue.serverTimestamp(),
      lastSignupRefresh: {
        refreshed,
        failed,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  clearCharacterProfileLinksCache();

  const snapshot = await ref.get().catch(() => null);
  return snapshot?.exists ? normalizeProfile(profile.profileId, snapshot.data() || {}) : { ...profile, characters: nextCharacters };
}

export async function addProfileCharacter(profileId: string, candidateInput: BattleNetCharacterCandidate) {
  const candidate = normalizeCharacter(candidateInput, null);
  const cleanKey = cleanCharacterKey(candidate?.key);
  if (!candidate || !cleanKey || !candidate.verifiedGuild) {
    throw new Error("Цей персонаж не підтверджений через Battle.net або не належить до Mistblossom Vanguard.");
  }
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  return getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");
    const profile = normalizeProfile(profileId, snapshot.data() || {});
    const current = profile.characters;
    if (current.some((item) => item.key === cleanKey)) {
      return { added: false, reason: "duplicate" as const, key: cleanKey };
    }
    if (current.length >= 50) {
      return { added: false, reason: "limit" as const, key: cleanKey };
    }

    const now = new Date().toISOString();
    const nextCharacter: ProfileCharacter = { ...candidate, addedAt: now, lastSeenAt: candidate.lastSeenAt || now };
    const nextCharacters = [...current, nextCharacter];
    const mainCharacterKey = profile.mainCharacterKey || nextCharacter.key;

    transaction.set(ref, {
      characters: nextCharacters,
      mainCharacterKey,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    clearCharacterProfileLinksCache();
    return { added: true, key: cleanKey };
  });
}


export async function addProfileCharacters(profileId: string, candidateInputs: BattleNetCharacterCandidate[]) {
  const requested = Array.isArray(candidateInputs) ? candidateInputs.length : 0;
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
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const addedKeys: string[] = [];
  const skippedKeys: string[] = [];
  const skippedReasons: Record<string, "duplicate" | "limit"> = {};
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
        skippedReasons[key] = "duplicate";
        continue;
      }
      if (nextCharacters.length >= 50) {
        skippedKeys.push(key);
        skippedReasons[key] = "limit";
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

  if (addedKeys.length) clearCharacterProfileLinksCache();

  return {
    requested,
    validRequested: normalized.size,
    added: addedKeys.length,
    skipped: skippedKeys.length,
    addedKeys,
    skippedKeys,
    skippedReasons,
  };
}

export async function removeProfileCharacter(profileId: string, characterKey: string) {
  const cleanKey = cleanCharacterKey(characterKey);
  if (!cleanKey) throw new Error("Некоректний персонаж.");
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");
    const profile = normalizeProfile(profileId, snapshot.data() || {});
    const nextCharacters = profile.characters.filter((item) => item.key !== cleanKey);
    const nextMain = profile.mainCharacterKey === cleanKey ? nextCharacters[0]?.key || null : profile.mainCharacterKey || null;

    const updatePayload: Record<string, unknown> = {
      characters: nextCharacters,
      mainCharacterKey: nextMain,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (profile.raidRolePreference?.characterKey === cleanKey || (profile.mainCharacterKey && profile.mainCharacterKey !== nextMain)) {
      updatePayload.raidRolePreference = FieldValue.delete();
    }

    transaction.set(ref, updatePayload, { merge: true });
  });
  clearCharacterProfileLinksCache();
}

export async function setMainProfileCharacter(profileId: string, characterKey: string) {
  const cleanKey = cleanCharacterKey(characterKey);
  if (!cleanKey) throw new Error("Некоректний персонаж.");
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");
    const profile = normalizeProfile(profileId, snapshot.data() || {});
    if (!profile.characters.some((item) => item.key === cleanKey)) {
      throw new Error("Персонаж не доданий до профілю.");
    }

    const updatePayload: Record<string, unknown> = {
      mainCharacterKey: cleanKey,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (profile.mainCharacterKey && profile.mainCharacterKey !== cleanKey) {
      updatePayload.raidRolePreference = FieldValue.delete();
    }

    transaction.set(ref, updatePayload, { merge: true });
  });
}

export function normalizeProfilePreferredName(value: unknown) {
  return cleanProfileName(value, 32);
}

export function getProfileSiteName(profile: DashboardProfile | null | undefined) {
  return cleanProfileName(profile?.preferredName || "", 32) || cleanProfileName(profile?.displayName || profile?.login || "", 32) || "Учасник";
}

export function getProfileDiscordName(profile: DashboardProfile | null | undefined) {
  return cleanProfileName(profile?.displayName || profile?.login || "", 32) || "Discord";
}

export function getProfileServerStyleName(profile: DashboardProfile | null | undefined, maxLength = 80) {
  if (!profile) return "Учасник";
  const base = cleanDiscordNicknamePart(profile.preferredName || profile.displayName || profile.login || "", 32) || "Учасник";
  const characterNames = orderedCharactersForNickname(profile).slice(0, 3);
  if (!characterNames.length) return sliceCodePoints(base, maxLength).trim() || "Учасник";

  for (let count = characterNames.length; count >= 1; count -= 1) {
    const candidate = composeDiscordNickname(base, characterNames.slice(0, count));
    if (codePointLength(candidate) <= maxLength) return candidate;
  }

  return sliceCodePoints(base, maxLength).trim() || "Учасник";
}

export function getProfilePublicName(profile: DashboardProfile | null | undefined) {
  if (!profile) return "Учасник";
  return profile.publicNameMode === "server_nickname" ? getProfileServerStyleName(profile) : getProfileSiteName(profile);
}

export type AuthorNameSuggestion = {
  source: "server" | "discord" | "site" | "profile";
  label: string;
  value: string;
};

export function buildAuthorNameSuggestions(params: {
  profile?: DashboardProfile | null;
  sessionName?: string | null;
  serverDiscordName?: string | null;
}) {
  const profile = params.profile || null;
  const candidates: AuthorNameSuggestion[] = [
    { source: "server", label: "Імʼя на сервері", value: cleanAuthorName(params.serverDiscordName || "", 80) },
    { source: "site", label: "Імʼя з сайту", value: profile ? getProfileSiteName(profile) : "" },
    { source: "profile", label: "Формат профілю", value: profile ? getProfilePublicName(profile) : "" },
    { source: "discord", label: "Discord", value: cleanAuthorName(profile?.displayName || params.sessionName || profile?.login || "", 80) },
  ];

  const seen = new Set<string>();
  return candidates.filter((item) => {
    const value = String(item.value || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    item.value = value;
    return true;
  });
}

function orderedCharactersForNickname(profile: DashboardProfile) {
  const main = getMainCharacter(profile);
  const ordered = [
    ...(main ? [main] : []),
    ...profile.characters.filter((item) => item.key !== main?.key),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const character of ordered) {
    const name = cleanDiscordNicknamePart(character.name, 16);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= 3) break;
  }
  return result;
}

function composeDiscordNickname(name: string, characters: string[]) {
  return characters.length ? `${name} [${characters.join(", ")}]` : name;
}

export type ProfileDiscordNicknamePlan = {
  value: string | null;
  baseName: string | null;
  characterNames: string[];
  requestedCharacterNames: string[];
  hasRequiredName: boolean;
  truncated: boolean;
  maxLength: number;
};

export function buildProfileDiscordNicknamePlan(profile: DashboardProfile | null | undefined): ProfileDiscordNicknamePlan {
  const maxLength = 32;
  const base = cleanDiscordNicknamePart(profile?.preferredName || "", maxLength);
  if (!profile || !base) {
    return {
      value: null,
      baseName: base || null,
      characterNames: [],
      requestedCharacterNames: [],
      hasRequiredName: Boolean(base),
      truncated: false,
      maxLength,
    };
  }

  const requestedNames = orderedCharactersForNickname(profile)
    .map((name) => sliceCodePoints(name, 16).trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!requestedNames.length) {
    return {
      value: sliceCodePoints(base, maxLength),
      baseName: base,
      characterNames: [],
      requestedCharacterNames: [],
      hasRequiredName: true,
      truncated: codePointLength(base) > maxLength,
      maxLength,
    };
  }

  for (let count = requestedNames.length; count >= 1; count -= 1) {
    const names = requestedNames.slice(0, count);
    const candidate = composeDiscordNickname(base, names);
    if (codePointLength(candidate) <= maxLength) {
      return {
        value: candidate,
        baseName: base,
        characterNames: names,
        requestedCharacterNames: requestedNames,
        hasRequiredName: true,
        truncated: count < requestedNames.length,
        maxLength,
      };
    }
  }

  const spaceForMain = Math.max(1, maxLength - codePointLength(base) - 3);
  if (spaceForMain >= 1 && codePointLength(base) <= maxLength - 4) {
    const mainName = sliceCodePoints(requestedNames[0], spaceForMain).trim();
    const candidate = composeDiscordNickname(base, mainName ? [mainName] : []);
    if (mainName && codePointLength(candidate) <= maxLength) {
      return {
        value: candidate,
        baseName: base,
        characterNames: [mainName],
        requestedCharacterNames: requestedNames,
        hasRequiredName: true,
        truncated: true,
        maxLength,
      };
    }
  }

  return {
    value: sliceCodePoints(base, maxLength),
    baseName: base,
    characterNames: [],
    requestedCharacterNames: requestedNames,
    hasRequiredName: true,
    truncated: true,
    maxLength,
  };
}

export function buildProfileDiscordNickname(profile: DashboardProfile | null | undefined) {
  return buildProfileDiscordNicknamePlan(profile).value;
}

export async function setProfilePreferredName(profileId: string, nameInput: unknown) {
  if (!/^id[a-f0-9]{16,40}$/.test(profileId)) throw new Error("Некоректний ID профілю.");
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const preferredName = normalizeProfilePreferredName(nameInput);
  if (codePointLength(preferredName) < 2) throw new Error("Імʼя має містити щонайменше 2 символи.");

  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);
  await ref.set({
    preferredName,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return preferredName;
}

export async function setProfilePublicNameMode(profileId: string, modeInput: unknown) {
  if (!/^id[a-f0-9]{16,40}$/.test(profileId)) throw new Error("Некоректний ID профілю.");
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const publicNameMode = cleanProfilePublicNameMode(modeInput);
  await getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId).set({
    publicNameMode,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return publicNameMode;
}

export async function markProfileDiscordNicknameSynced(
  profileId: string,
  nickname: string,
  source?: Pick<ProfileDiscordNicknamePlan, "baseName" | "characterNames">,
) {
  if (!/^id[a-f0-9]{16,40}$/.test(profileId)) throw new Error("Некоректний ID профілю.");
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const sourceCharacterNames = Array.isArray(source?.characterNames) ? source.characterNames : [];

  await getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId).set({
    discordNickname: {
      value: cleanDiscordNicknamePart(nickname, 32),
      syncedAt: FieldValue.serverTimestamp(),
      sourcePreferredName: cleanProfileName(source?.baseName || "", 32) || null,
      sourceCharacters: sourceCharacterNames.map((item) => cleanDiscordNicknamePart(item, 16)).filter(Boolean).slice(0, 3),
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function setProfileRaidRolePreference(profileId: string, roleInput: unknown) {
  if (!hasFirebaseProfileConfig()) throw new Error("Профілі тимчасово недоступні.");

  const role = normalizeWowRole(roleInput);
  const ref = getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId);

  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Профіль не знайдено.");

    const profile = normalizeProfile(profileId, snapshot.data() || {});
    const main = getMainCharacter(profile);
    if (!main?.key) throw new Error("Спочатку вибери мейна.");

    const updatePayload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!role) {
      updatePayload.raidRolePreference = FieldValue.delete();
    } else {
      updatePayload.raidRolePreference = {
        characterKey: main.key,
        role,
        updatedAt: FieldValue.serverTimestamp(),
      };
    }

    transaction.set(ref, updatePayload, { merge: true });
  });
}

export function getProfileRaidRole(profile: DashboardProfile | null | undefined) {
  const main = profile ? getMainCharacter(profile) : null;
  const manualRole = profile?.raidRolePreference?.characterKey === main?.key ? profile?.raidRolePreference?.role : null;
  return manualRole || (main ? resolveWowCharacterRole({
    className: main.className,
    activeSpecName: main.activeSpecName,
    activeSpecId: main.activeSpecId,
    activeSpecRole: main.activeSpecRole,
  }) : "dps");
}

export function getMainCharacter(profile: DashboardProfile) {
  return profile.characters.find((item) => item.key === profile.mainCharacterKey) || profile.characters[0] || null;
}
