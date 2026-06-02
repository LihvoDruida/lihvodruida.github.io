import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { apiFetchJson } from "@/lib/apiHttp";
import {
  fetchBattleNetApplicationData,
  getDefaultBattleNetRegion,
  guildStatusFromRank,
  normalizeBattleNetRegion,
  type BattleNetGuildCharacterStatus,
  type BattleNetRegion,
} from "@/lib/battlenet";
import {
  getAdaptiveConcurrency,
  mapConcurrent,
  readIntegerEnv,
} from "@/lib/concurrency";
import { getGuildRosterWarcraftLogsSettings } from "@/lib/dashboardApiSettings";
import {
  getFirebaseAdminDb,
  hasFirebaseProfileConfig,
} from "@/lib/firebaseAdmin";
import {
  listCharacterProfileLinks,
  saveProfileCharacterWarcraftLogsSnapshot,
  type CharacterProfileLink,
} from "@/lib/profiles";
import {
  buildBattleNetCharacterKey,
  normalizeCharacterKey,
} from "@/lib/wowCharacters";
import {
  buildWarcraftLogsStoredSnapshot,
  fetchWarcraftLogsCharacterSummary,
  normalizeWarcraftLogsStoredSnapshot,
  type WarcraftLogsStoredMetric,
  type WarcraftLogsStoredSnapshot,
} from "@/lib/warcraftLogs";

export type GuildScoreSegment = "all" | "dps" | "healer" | "tank";
export type GuildRosterRole = "tank" | "healer" | "dps" | "unknown";

export type GuildRosterWarcraftLogsMetric = WarcraftLogsStoredMetric;
export type GuildRosterWarcraftLogsSnapshot = WarcraftLogsStoredSnapshot;

export type GuildRosterMember = {
  key: string;
  ownerProfileId?: string | null;
  ownerDisplayName?: string | null;
  rank: number | null;
  guildStatus: BattleNetGuildCharacterStatus | null;
  guildStatusLabel: string | null;
  name: string;
  realmSlug: string;
  realmName: string;
  region: string;
  className: string;
  raceName: string;
  faction: string;
  gender: string;
  specName: string;
  role: GuildRosterRole;
  avatarUrl: string | null;
  profileUrl: string | null;
  itemLevel: number;
  scores: Record<GuildScoreSegment, number>;
  scoreColors: Partial<Record<GuildScoreSegment, string>>;
  hasRaiderIo: boolean;
  raiderIoUpdatedAt?: string | null;
  warcraftLogs?: GuildRosterWarcraftLogsSnapshot | null;
};

export type GuildRosterStats = {
  updatedAt: string | null;
  memberCount: number;
  guildName: string;
  guildRealm: string;
  guildFaction: string;
  profileUrl: string | null;
  maxRioAll: number;
  maxItemLevel: number;
  averageRioAll: number;
  averageItemLevel: number;
};

export type GuildRosterLoadResult = {
  members: GuildRosterMember[];
  stats: GuildRosterStats;
  source: string;
  error?: string | null;
};

export type GuildRosterLoadOptions = {
  forceRefresh?: boolean;
};

export type GuildRosterSyncPhase =
  | "roster"
  | "raiderio"
  | "warcraftlogs"
  | "completed"
  | "failed";

export type GuildRosterSyncJobStatus = "running" | "completed" | "failed";

export type GuildRosterSyncJob = {
  id: string;
  status: GuildRosterSyncJobStatus;
  phase: GuildRosterSyncPhase;
  requestedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  forceRoster: boolean;
  includeWarcraftLogs: boolean;
  forceWarcraftLogs: boolean;
  totalMembers: number;
  processed: {
    roster: number;
    raiderIo: number;
    warcraftLogs: number;
  };
  errors: string[];
  lastMemberKey?: string | null;
};

export type GuildRosterSyncProgress = {
  id: string | null;
  status: GuildRosterSyncJobStatus | "idle";
  phase: GuildRosterSyncPhase | "idle";
  totalMembers: number;
  processed: {
    roster: number;
    raiderIo: number;
    warcraftLogs: number;
  };
  updatedAt: string | null;
  completedAt: string | null;
};

type CachedRoster = GuildRosterLoadResult & {
  cachedAt: string;
};

type RaiderIoCharacterPayload = Record<string, any>;

const SEGMENTS: GuildScoreSegment[] = ["all", "dps", "healer", "tank"];
const DEFAULT_GUILD_NAME = "Mistblossom Vanguard";
const DEFAULT_GUILD_REALM = "terokkar";
const CACHE_COLLECTION = "guildRuntimeCache";
const CACHE_DOCUMENT = "guildRoster";
const CACHE_MEMBERS_COLLECTION = "members";
const SYNC_JOB_DOCUMENT = "guildRosterSyncJob";
const LIVE_SOURCE = "Battle.net Guild Roster API + Raider.IO Character API";

const CLASS_ID_FALLBACK: Record<number, string> = {
  1: "Warrior",
  2: "Paladin",
  3: "Hunter",
  4: "Rogue",
  5: "Priest",
  6: "Death Knight",
  7: "Shaman",
  8: "Mage",
  9: "Warlock",
  10: "Monk",
  11: "Druid",
  12: "Demon Hunter",
  13: "Evoker",
};

const RACE_ID_FALLBACK: Record<number, string> = {
  1: "Human",
  2: "Orc",
  3: "Dwarf",
  4: "Night elf",
  5: "Undead",
  6: "Tauren",
  7: "Gnome",
  8: "Troll",
  9: "Goblin",
  10: "Blood elf",
  11: "Draenei",
  22: "Worgen",
  24: "Pandaren",
  25: "Pandaren",
  26: "Pandaren",
  27: "Nightborne",
  28: "Highmountain tauren",
  29: "Void elf",
  30: "Lightforged draenei",
  31: "Zandalari troll",
  32: "Kul Tiran",
  34: "Dark iron dwarf",
  35: "Vulpera",
  36: "Mag'har orc",
  37: "Mechagnome",
  52: "Dracthyr",
  70: "Dracthyr",
};

declare global {
  var __mistblossomGuildRosterCache: CachedRoster | undefined;
  var __mistblossomGuildRosterRefreshPromise:
    | Promise<CachedRoster | null>
    | undefined;
  var __mistblossomGuildRosterSyncJob: GuildRosterSyncJob | undefined;
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback)
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function slugify(value: unknown) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/[ʼ’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeRole(value: unknown): GuildRosterRole {
  const role = cleanText(value).toLowerCase();
  if (["tank", "танк"].includes(role)) return "tank";
  if (["healer", "healing", "heal", "хіл", "хілер", "лікар"].includes(role))
    return "healer";
  if (["dps", "damage", "damager", "дпс"].includes(role)) return "dps";
  return "unknown";
}

function normalizeFaction(value: unknown) {
  const text = cleanText(value);
  if (!text) return "Unknown";
  const normalized = text.toUpperCase().replace(/\s+/g, "_");
  if (normalized === "ALLIANCE") return "Alliance";
  if (normalized === "HORDE") return "Horde";
  return text;
}

function pickLocalizedName(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return cleanText(value) || null;
  if (typeof value.name === "string") return cleanText(value.name) || null;
  if (typeof value.name?.en_GB === "string")
    return cleanText(value.name.en_GB) || null;
  if (typeof value.name?.en_US === "string")
    return cleanText(value.name.en_US) || null;
  const localized = Object.values(value.name || {}).find(
    (item) => typeof item === "string" && cleanText(item),
  );
  return localized ? cleanText(localized) || null : null;
}

function scoreFromSegments(
  segments: Record<string, any> | null | undefined,
  segment: GuildScoreSegment,
) {
  const entry = segments?.[segment] || segments?.[segment.toUpperCase()];
  if (entry && typeof entry === "object")
    return parsePositiveNumber(entry.score);
  return parsePositiveNumber(entry);
}

function scoreColorFromSegments(
  segments: Record<string, any> | null | undefined,
  segment: GuildScoreSegment,
) {
  const entry = segments?.[segment] || segments?.[segment.toUpperCase()];
  if (!entry || typeof entry !== "object") return undefined;
  const color = cleanText(entry.color);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}

function extractCurrentSeasonSegments(
  payload: RaiderIoCharacterPayload | null | undefined,
) {
  const seasons = Array.isArray(payload?.mythic_plus_scores_by_season)
    ? payload?.mythic_plus_scores_by_season
    : [];
  return (seasons[0]?.segments || {}) as Record<string, any>;
}

function characterKey(
  region: string,
  realmSlug: string,
  name: string,
  id?: unknown,
) {
  const safeName = slugify(name) || cleanText(name).toLocaleLowerCase();
  return `${region.toLowerCase()}:${realmSlug.toLowerCase()}:${safeName}:${cleanText(id || "")}`;
}

function getGuildConfig() {
  const region = normalizeBattleNetRegion(
    process.env.GUILD_ROSTER_REGION ||
      process.env.WOW_REGION ||
      getDefaultBattleNetRegion(),
  );
  const realmSlug =
    slugify(
      process.env.GUILD_ROSTER_REALM ||
        process.env.WOW_REALM ||
        process.env.WOW_GUILD_REALM ||
        DEFAULT_GUILD_REALM,
    ) || DEFAULT_GUILD_REALM;
  const guildName = cleanText(
    process.env.GUILD_ROSTER_NAME ||
      process.env.WOW_GUILD_NAME ||
      process.env.BATTLENET_ALLOWED_GUILD_NAME ||
      DEFAULT_GUILD_NAME,
    DEFAULT_GUILD_NAME,
  );
  const guildSlug = slugify(guildName) || slugify(DEFAULT_GUILD_NAME);
  return { region, realmSlug, guildName, guildSlug };
}

function cacheTtlMs() {
  return (
    readIntegerEnv("GUILD_ROSTER_CACHE_TTL_SECONDS", 1800, 300, 86_400) * 1000
  );
}

function refreshConcurrency(total: number) {
  return getAdaptiveConcurrency(total, {
    profile: "external-api",
    envKey: "GUILD_ROSTER_REFRESH_CONCURRENCY",
    maxEnvKey: "GUILD_ROSTER_REFRESH_MAX_CONCURRENCY",
    min: 2,
    max: 12,
  });
}

function guildMemberLimit() {
  return readIntegerEnv("GUILD_ROSTER_MEMBER_LIMIT", 500, 1, 1000);
}

function raiderIoTimeoutMs() {
  return readIntegerEnv("RAIDERIO_REQUEST_TIMEOUT_MS", 10_000, 2_500, 30_000);
}

function raiderIoAccessKey() {
  return cleanText(process.env.RAIDERIO_ACCESS_KEY);
}

async function fetchJsonWithTimeout(url: URL, label: string) {
  return apiFetchJson<any>(url, {
    label,
    timeoutMs: raiderIoTimeoutMs(),
    retries: readIntegerEnv("RAIDERIO_REQUEST_RETRIES", 1, 0, 4),
    cache: "no-store",
    userAgent: "mistblossom-dashboard",
  });
}

async function fetchRaiderGuild(
  region: BattleNetRegion,
  realmSlug: string,
  guildName: string,
) {
  const url = new URL("https://raider.io/api/v1/guilds/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realmSlug);
  url.searchParams.set("name", guildName);
  url.searchParams.set(
    "fields",
    "raid_progression:current-expansion:previous-expansion,raid_rankings:current-expansion:previous-expansion",
  );
  const key = raiderIoAccessKey();
  if (key) url.searchParams.set("access_key", key);

  try {
    return await fetchJsonWithTimeout(url, "Raider.IO guild");
  } catch {
    return null;
  }
}

async function fetchRaiderCharacter(
  region: BattleNetRegion,
  realmSlug: string,
  name: string,
) {
  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realmSlug);
  url.searchParams.set("name", name);
  url.searchParams.set("fields", "gear,mythic_plus_scores_by_season:current");
  const key = raiderIoAccessKey();
  if (key) url.searchParams.set("access_key", key);

  try {
    return (await fetchJsonWithTimeout(
      url,
      `Raider.IO character ${name}`,
    )) as RaiderIoCharacterPayload;
  } catch {
    return null;
  }
}

function guildRosterWclMemberLimit(total: number, configuredLimit: number) {
  const safeTotal = Math.max(0, Math.floor(total || 0));
  const safeLimit = Math.max(0, Math.floor(configuredLimit || 0));
  return safeLimit <= 0 ? safeTotal : Math.min(safeTotal, safeLimit);
}

function buildWarcraftLogsRosterSnapshot(
  member: GuildRosterMember,
  summary: Awaited<ReturnType<typeof fetchWarcraftLogsCharacterSummary>>,
): GuildRosterWarcraftLogsSnapshot {
  return buildWarcraftLogsStoredSnapshot(summary, member.role);
}

function storedWclSnapshotFresh(
  snapshot?: GuildRosterWarcraftLogsSnapshot | null,
) {
  const normalized = normalizeWarcraftLogsStoredSnapshot(snapshot);
  if (!normalized?.updatedAt) return false;
  const updatedAt = Date.parse(normalized.updatedAt);
  if (!Number.isFinite(updatedAt)) return false;
  const ttlSeconds = readIntegerEnv(
    "GUILD_ROSTER_PROFILE_WCL_TTL_SECONDS",
    21_600,
    300,
    604_800,
  );
  return Date.now() - updatedAt < ttlSeconds * 1000;
}

function memberProfileLookupKeys(member: GuildRosterMember) {
  const keys = new Set<string>();
  const normalized = normalizeCharacterKey(member.key);
  if (normalized) keys.add(normalized);
  const battleNetKey = buildBattleNetCharacterKey(
    member.region,
    member.realmSlug,
    member.name,
  );
  if (battleNetKey) keys.add(battleNetKey);
  return keys;
}

async function enrichGuildMembersWithProfileLinks(
  members: GuildRosterMember[],
) {
  if (!members.length || !hasFirebaseProfileConfig()) return members;
  const links = await listCharacterProfileLinks().catch(
    () => new Map<string, CharacterProfileLink>(),
  );
  if (!links.size) return members;

  return members.map((member) => {
    let link: CharacterProfileLink | null = null;
    for (const key of memberProfileLookupKeys(member)) {
      link = links.get(key) || null;
      if (link) break;
    }
    if (!link) return member;

    const stored = normalizeWarcraftLogsStoredSnapshot(link.warcraftLogs);
    return {
      ...member,
      ownerProfileId: link.profileId,
      ownerDisplayName: link.displayName,
      warcraftLogs: storedWclSnapshotFresh(stored)
        ? stored
        : member.warcraftLogs || null,
    };
  });
}

type GuildRosterApiBatchProgress = {
  checked: number;
  remaining: number;
  totalCandidates: number;
  skipped: boolean;
  reason?: string | null;
};

function storedWclSnapshotFreshForBatch(
  snapshot?: GuildRosterWarcraftLogsSnapshot | null,
  force = false,
) {
  if (force) return false;
  return storedWclSnapshotFresh(snapshot);
}

function buildScores(
  raider: RaiderIoCharacterPayload | null,
): Record<GuildScoreSegment, number> {
  const segments = extractCurrentSeasonSegments(raider);
  return SEGMENTS.reduce(
    (acc, segment) => {
      acc[segment] = scoreFromSegments(segments, segment);
      return acc;
    },
    {} as Record<GuildScoreSegment, number>,
  );
}

function buildScoreColors(
  raider: RaiderIoCharacterPayload | null,
): Partial<Record<GuildScoreSegment, string>> {
  const segments = extractCurrentSeasonSegments(raider);
  return SEGMENTS.reduce(
    (acc, segment) => {
      const color = scoreColorFromSegments(segments, segment);
      if (color) acc[segment] = color;
      return acc;
    },
    {} as Partial<Record<GuildScoreSegment, string>>,
  );
}

function hasUsefulScores(scores: Record<GuildScoreSegment, number> | null | undefined) {
  return Boolean(scores && Object.values(scores).some((score) => score > 0));
}

function memberBattleNetKey(input: {
  region: string;
  realmSlug: string;
  name: string;
}) {
  return buildBattleNetCharacterKey(input.region, input.realmSlug, input.name);
}

function cachedRosterMemberMap(cache?: CachedRoster | null) {
  const map = new Map<string, GuildRosterMember>();
  for (const member of cache?.members || []) {
    const key = memberBattleNetKey(member);
    if (key && !map.has(key)) map.set(key, member);
  }
  return map;
}

function timestampAgeMs(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Date.now() - timestamp : Number.POSITIVE_INFINITY;
}

function staleFirst<T>(
  items: T[],
  updatedAt: (item: T) => string | null | undefined,
) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(updatedAt(left) || "");
    const rightTime = Date.parse(updatedAt(right) || "");
    const leftSafe = Number.isFinite(leftTime) ? leftTime : 0;
    const rightSafe = Number.isFinite(rightTime) ? rightTime : 0;
    return leftSafe - rightSafe;
  });
}

function mergePreviousMemberSnapshot(
  member: GuildRosterMember,
  previous?: GuildRosterMember | null,
): GuildRosterMember {
  if (!previous) return member;

  const nextScores = hasUsefulScores(member.scores) ? member.scores : previous.scores;
  const nextScoreColors = Object.keys(member.scoreColors || {}).length
    ? member.scoreColors
    : previous.scoreColors;

  return {
    ...member,
    ownerProfileId: member.ownerProfileId ?? previous.ownerProfileId ?? null,
    ownerDisplayName: member.ownerDisplayName ?? previous.ownerDisplayName ?? null,
    className:
      member.className && member.className !== "Unknown"
        ? member.className
        : previous.className,
    raceName:
      member.raceName && member.raceName !== "Unknown"
        ? member.raceName
        : previous.raceName,
    specName:
      member.specName && member.specName !== "Unknown"
        ? member.specName
        : previous.specName,
    role: member.role !== "unknown" ? member.role : previous.role,
    avatarUrl: member.avatarUrl || previous.avatarUrl || null,
    profileUrl: member.profileUrl || previous.profileUrl || null,
    itemLevel: member.itemLevel || previous.itemLevel || 0,
    scores: nextScores,
    scoreColors: nextScoreColors,
    hasRaiderIo: member.hasRaiderIo || previous.hasRaiderIo || hasUsefulScores(nextScores),
    raiderIoUpdatedAt: member.raiderIoUpdatedAt || previous.raiderIoUpdatedAt || null,
    warcraftLogs: member.warcraftLogs || previous.warcraftLogs || null,
  };
}

function raiderIoSnapshotFresh(member: GuildRosterMember) {
  const ttlSeconds = readIntegerEnv(
    "GUILD_ROSTER_RAIDERIO_TTL_SECONDS",
    21_600,
    300,
    604_800,
  );
  return timestampAgeMs(member.raiderIoUpdatedAt) < ttlSeconds * 1000;
}

function applyRaiderIoPayload(
  member: GuildRosterMember,
  raider: RaiderIoCharacterPayload | null,
  updatedAt: string,
): GuildRosterMember {
  if (!raider) {
    return {
      ...member,
      raiderIoUpdatedAt: updatedAt,
    };
  }

  const scores = buildScores(raider);
  const profileUrl = cleanText(raider.profile_url) || member.profileUrl || null;
  const avatarUrl =
    cleanText(raider.thumbnail_url || raider.avatar_url) || member.avatarUrl || null;

  return {
    ...member,
    className: cleanText(raider.class) || member.className,
    raceName: cleanText(raider.race) || member.raceName,
    faction: normalizeFaction(raider.faction || member.faction),
    specName: cleanText(raider.active_spec_name) || member.specName,
    role:
      normalizeRole(raider.active_spec_role) !== "unknown"
        ? normalizeRole(raider.active_spec_role)
        : member.role,
    avatarUrl,
    profileUrl,
    itemLevel: Math.round(
      parsePositiveNumber(raider.gear?.item_level_equipped) || member.itemLevel,
    ),
    scores,
    scoreColors: buildScoreColors(raider),
    hasRaiderIo: Boolean(profileUrl || hasUsefulScores(scores)),
    raiderIoUpdatedAt: updatedAt,
  };
}

function numberFromHref(value: unknown) {
  const match = cleanText(value).match(/\/(\d+)(?:\?|$)/);
  return match ? Number(match[1]) : 0;
}

function rosterClassName(character: any) {
  const direct = pickLocalizedName(
    character?.playable_class || character?.character_class,
  );
  if (direct) return direct;
  const id = Number(
    character?.playable_class?.id ||
      character?.character_class?.id ||
      numberFromHref(character?.playable_class?.key?.href),
  );
  return CLASS_ID_FALLBACK[id] || "Unknown";
}

function rosterRaceName(character: any) {
  const direct = pickLocalizedName(character?.playable_race || character?.race);
  if (direct) return direct;
  const id = Number(
    character?.playable_race?.id ||
      character?.race?.id ||
      numberFromHref(character?.playable_race?.key?.href),
  );
  return RACE_ID_FALLBACK[id] || "Unknown";
}

function buildMemberFromSources(input: {
  rosterEntry: any;
  raider: RaiderIoCharacterPayload | null;
  region: BattleNetRegion;
  fallbackRealmSlug: string;
  fallbackRealmName: string;
  fallbackFaction: string;
  index: number;
}): GuildRosterMember | null {
  const character = input.rosterEntry?.character || input.rosterEntry || {};
  const raider = input.raider;
  const name = cleanText(character.name || raider?.name);
  if (!name) return null;

  const realmSlug =
    slugify(
      character.realm?.slug ||
        character.realm?.name ||
        raider?.realm ||
        input.fallbackRealmSlug,
    ) || input.fallbackRealmSlug;
  const realmName = cleanText(
    character.realm?.name ||
      raider?.realm ||
      input.fallbackRealmName ||
      realmSlug,
  ).toUpperCase();
  const className = cleanText(
    raider?.class || rosterClassName(character) || "Unknown",
  );
  const raceName = cleanText(
    raider?.race || rosterRaceName(character) || "Unknown",
  );
  const specName = cleanText(raider?.active_spec_name || "Unknown");
  const role = normalizeRole(
    raider?.active_spec_role || character.active_spec?.role || character.role,
  );
  const scores = buildScores(raider);
  const profileUrl = cleanText(raider?.profile_url) || null;
  const avatarUrl =
    cleanText(
      raider?.thumbnail_url ||
        raider?.avatar_url ||
        character.avatarUrl ||
        character.avatar,
    ) || null;

  const rankInfo = guildStatusFromRank(input.rosterEntry?.rank);

  return {
    key: characterKey(
      input.region,
      realmSlug,
      name,
      character.id || input.index,
    ),
    rank: rankInfo.rank,
    guildStatus: rankInfo.status,
    guildStatusLabel: rankInfo.label,
    name,
    realmSlug,
    realmName,
    region: input.region.toUpperCase(),
    className,
    raceName,
    faction: normalizeFaction(
      raider?.faction ||
        character.faction?.type ||
        character.faction ||
        input.fallbackFaction,
    ),
    gender: cleanText(
      raider?.gender || character.gender?.type || character.gender || "",
    ),
    specName,
    role,
    avatarUrl,
    profileUrl,
    itemLevel: Math.round(
      parsePositiveNumber(
        raider?.gear?.item_level_equipped ||
          character.itemLevel ||
          character.item_level ||
          character.ilvl,
      ),
    ),
    scores,
    scoreColors: buildScoreColors(raider),
    hasRaiderIo: Boolean(
      profileUrl || Object.values(scores).some((score) => score > 0),
    ),
  };
}

function buildStats(input: {
  guildSummary: any;
  raiderGuild: any;
  members: GuildRosterMember[];
  updatedAt: string;
  configuredGuildName: string;
  configuredRealmSlug: string;
}): GuildRosterStats {
  const guild = input.guildSummary || {};
  const realm = guild.realm || {};
  const faction = guild.faction || {};
  const members = input.members;

  return {
    updatedAt: input.updatedAt,
    memberCount:
      members.length || Number(guild.member_count || guild.members_count || 0),
    guildName: cleanText(
      guild.name || input.configuredGuildName || DEFAULT_GUILD_NAME,
    ),
    guildRealm: cleanText(
      realm.name ||
        realm.slug ||
        input.configuredRealmSlug ||
        DEFAULT_GUILD_REALM,
    ),
    guildFaction: normalizeFaction(faction.type || faction.name),
    profileUrl:
      cleanText(input.raiderGuild?.profile_url || guild.profile_url) || null,
    maxRioAll: Math.max(0, ...members.map((member) => member.scores.all)),
    maxItemLevel: Math.max(0, ...members.map((member) => member.itemLevel)),
    averageRioAll: average(members.map((member) => member.scores.all)),
    averageItemLevel: average(members.map((member) => member.itemLevel)),
  };
}

function sortMembers(members: GuildRosterMember[]) {
  return members.sort(
    (a, b) =>
      b.scores.all - a.scores.all ||
      b.itemLevel - a.itemLevel ||
      a.name.localeCompare(b.name, "uk"),
  );
}

async function fetchLiveGuildRoster(options: { previous?: CachedRoster | null } = {}): Promise<GuildRosterLoadResult> {
  const config = getGuildConfig();
  const updatedAt = new Date().toISOString();

  const [guildSummary, roster, raiderGuild] = await Promise.all([
    fetchBattleNetApplicationData(
      `/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}`,
      undefined,
      config.region,
    ),
    fetchBattleNetApplicationData(
      `/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}/roster`,
      undefined,
      config.region,
    ),
    fetchRaiderGuild(config.region, config.realmSlug, config.guildName),
  ]);

  const guildBlock = roster?.guild || guildSummary || {};
  const fallbackRealmSlug =
    slugify(
      guildBlock?.realm?.slug || guildBlock?.realm?.name || config.realmSlug,
    ) || config.realmSlug;
  const fallbackRealmName = cleanText(
    guildBlock?.realm?.name || guildBlock?.realm?.slug || config.realmSlug,
  );
  const fallbackFaction = cleanText(
    guildBlock?.faction?.type ||
      guildSummary?.faction?.type ||
      guildSummary?.faction?.name ||
      "Alliance",
  );
  const rawMembers: any[] = Array.isArray(roster?.members)
    ? roster.members.slice(0, guildMemberLimit())
    : [];
  const concurrency = refreshConcurrency(rawMembers.length);
  const previousMembers = cachedRosterMemberMap(options.previous);

  const { results } = await mapConcurrent(
    rawMembers,
    async (entry, index) => {
      const member = buildMemberFromSources({
        rosterEntry: entry,
        raider: null,
        region: config.region,
        fallbackRealmSlug,
        fallbackRealmName,
        fallbackFaction,
        index,
      });
      if (!member) return null;
      return mergePreviousMemberSnapshot(
        member,
        previousMembers.get(memberBattleNetKey(member)),
      );
    },
    {
      profile: "cpu",
      concurrency,
      failFast: false,
    },
  );

  const baseMembers = sortMembers(
    results.filter((member): member is GuildRosterMember => Boolean(member)),
  );
  const linkedMembers = await enrichGuildMembersWithProfileLinks(baseMembers);
  const members = sortMembers(linkedMembers);
  const stats = buildStats({
    guildSummary: guildSummary || guildBlock,
    raiderGuild,
    members,
    updatedAt,
    configuredGuildName: config.guildName,
    configuredRealmSlug: config.realmSlug,
  });

  return {
    members,
    stats,
    source: `${LIVE_SOURCE} • live`,
    error: null,
  };
}

function fallbackStats(): GuildRosterStats {
  const config = getGuildConfig();
  return {
    updatedAt: null,
    memberCount: 0,
    guildName: config.guildName,
    guildRealm: config.realmSlug,
    guildFaction: "Alliance",
    profileUrl: null,
    maxRioAll: 0,
    maxItemLevel: 0,
    averageRioAll: 0,
    averageItemLevel: 0,
  };
}

function isCachedRoster(value: any): value is CachedRoster {
  return Boolean(
    value &&
    Array.isArray(value.members) &&
    value.stats &&
    typeof value.cachedAt === "string",
  );
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isFresh(cache: CachedRoster | null, ttlMs = cacheTtlMs()) {
  if (!cache?.cachedAt) return false;
  const cachedAt = Date.parse(cache.cachedAt);
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < ttlMs;
}

function shardedCacheEnabled(memberCount: number) {
  const raw = cleanText(process.env.GUILD_ROSTER_SHARDED_CACHE_ENABLED, "").toLowerCase();
  if (["0", "false", "no", "off"].includes(raw)) return false;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  const threshold = readIntegerEnv("GUILD_ROSTER_SHARDED_CACHE_THRESHOLD", 150, 1, 1000);
  return memberCount >= threshold;
}

function memberDocId(member: Pick<GuildRosterMember, "key" | "region" | "realmSlug" | "name">) {
  const source = member.key || memberBattleNetKey(member) || `${member.region}:${member.realmSlug}:${member.name}`;
  return createHash("sha1").update(source.toLowerCase()).digest("hex");
}

function cachedRosterFromShardedPayload(data: any, members: GuildRosterMember[]): CachedRoster | null {
  const meta = data?.payloadSharded;
  if (!meta || !meta.stats || typeof meta.cachedAt !== "string") return null;
  return stripUndefined({
    members: sortMembers(members),
    stats: meta.stats,
    source: cleanText(meta.source) || `${LIVE_SOURCE} • cache`,
    error: typeof meta.error === "string" ? meta.error : null,
    cachedAt: meta.cachedAt,
  } satisfies CachedRoster);
}

async function readCachedRoster(): Promise<CachedRoster | null> {
  if (globalThis.__mistblossomGuildRosterCache)
    return globalThis.__mistblossomGuildRosterCache;
  if (!hasFirebaseProfileConfig()) return null;

  const doc = getFirebaseAdminDb().collection(CACHE_COLLECTION).doc(CACHE_DOCUMENT);
  const snapshot = await doc.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const legacyCache = data.payload;
  if (isCachedRoster(legacyCache)) {
    globalThis.__mistblossomGuildRosterCache = legacyCache;
    return legacyCache;
  }

  if (data.payloadSharded) {
    const memberSnapshots = await doc.collection(CACHE_MEMBERS_COLLECTION).get();
    const members = memberSnapshots.docs
      .map((item) => item.data()?.member)
      .filter((member): member is GuildRosterMember => Boolean(member?.key));
    const cache = cachedRosterFromShardedPayload(data, members);
    if (cache) {
      globalThis.__mistblossomGuildRosterCache = cache;
      return cache;
    }
  }

  return null;
}

type CachedRosterWriteOptions = {
  changedMemberKeys?: Set<string>;
  fullMemberRewrite?: boolean;
};

async function writeMemberDocs(
  members: GuildRosterMember[],
  options: CachedRosterWriteOptions = {},
) {
  if (!hasFirebaseProfileConfig()) return;
  if (!members.length && !options.fullMemberRewrite) return;

  const doc = getFirebaseAdminDb().collection(CACHE_COLLECTION).doc(CACHE_DOCUMENT);
  const changedKeys = options.changedMemberKeys;
  const membersToWrite = changedKeys?.size
    ? members.filter((member) => changedKeys.has(member.key))
    : members;
  const chunkSize = 400;

  for (let index = 0; index < membersToWrite.length; index += chunkSize) {
    const batch = getFirebaseAdminDb().batch();
    for (const member of membersToWrite.slice(index, index + chunkSize)) {
      batch.set(
        doc.collection(CACHE_MEMBERS_COLLECTION).doc(memberDocId(member)),
        {
          key: member.key,
          battleNetKey: memberBattleNetKey(member),
          member: stripUndefined(member),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  if (options.fullMemberRewrite) {
    const activeDocIds = new Set(members.map((member) => memberDocId(member)));
    const existing = await doc.collection(CACHE_MEMBERS_COLLECTION).get();
    const staleDocs = existing.docs.filter((item) => !activeDocIds.has(item.id));
    for (let index = 0; index < staleDocs.length; index += chunkSize) {
      const batch = getFirebaseAdminDb().batch();
      for (const item of staleDocs.slice(index, index + chunkSize)) batch.delete(item.ref);
      await batch.commit();
    }
  }
}

async function writeCachedRoster(
  result: GuildRosterLoadResult,
  options: CachedRosterWriteOptions = {},
) {
  const cache = stripUndefined({
    ...result,
    source: `${LIVE_SOURCE} • cache`,
    cachedAt: new Date().toISOString(),
  } satisfies CachedRoster);

  globalThis.__mistblossomGuildRosterCache = cache;

  if (hasFirebaseProfileConfig()) {
    const doc = getFirebaseAdminDb().collection(CACHE_COLLECTION).doc(CACHE_DOCUMENT);
    if (shardedCacheEnabled(cache.members.length)) {
      await doc.set(
        {
          payload: FieldValue.delete(),
          payloadSharded: stripUndefined({
            stats: cache.stats,
            source: cache.source,
            error: cache.error || null,
            cachedAt: cache.cachedAt,
            memberCount: cache.members.length,
          }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await writeMemberDocs(cache.members, options);
    } else {
      await doc.set(
        {
          payload: cache,
          payloadSharded: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  return cache;
}

function publicFromCache(cache: CachedRoster): GuildRosterLoadResult {
  return {
    members: cache.members,
    stats: cache.stats,
    source: cache.source || `${LIVE_SOURCE} • cache`,
    error: cache.error || null,
  };
}

async function refreshGuildRosterAndCache(previous?: CachedRoster | null) {
  const live = await fetchLiveGuildRoster({ previous });
  return writeCachedRoster(live, { fullMemberRewrite: true }).catch(() => null);
}

function scheduleGuildRosterBackgroundRefresh(reason: string) {
  if (globalThis.__mistblossomGuildRosterRefreshPromise) return;
  globalThis.__mistblossomGuildRosterRefreshPromise = readCachedRoster()
    .catch(() => null)
    .then((cached) => refreshGuildRosterAndCache(cached))
    .catch(() => null)
    .finally(() => {
      globalThis.__mistblossomGuildRosterRefreshPromise = undefined;
    });
  void reason;
}

export type GuildRosterRefreshProgress = {
  roster: {
    refreshed: boolean;
    source: string;
  };
  raiderIo: GuildRosterApiBatchProgress;
  warcraftLogs: GuildRosterApiBatchProgress;
  sync: GuildRosterSyncProgress;
};

type GuildRosterApiStepResult = GuildRosterApiBatchProgress & {
  members: GuildRosterMember[];
  changedMemberKeys: Set<string>;
};

function emptyProgress(reason: string): GuildRosterApiBatchProgress {
  return {
    checked: 0,
    remaining: 0,
    totalCandidates: 0,
    skipped: true,
    reason,
  };
}

function syncProgress(job?: GuildRosterSyncJob | null): GuildRosterSyncProgress {
  if (!job) {
    return {
      id: null,
      status: "idle",
      phase: "idle",
      totalMembers: 0,
      processed: { roster: 0, raiderIo: 0, warcraftLogs: 0 },
      updatedAt: null,
      completedAt: null,
    };
  }

  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    totalMembers: job.totalMembers,
    processed: job.processed,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function guildRosterStepBudgetMs() {
  return readIntegerEnv("GUILD_ROSTER_REFRESH_STEP_BUDGET_MS", 22_000, 15_000, 38_000);
}

function hasStepBudget(deadline: number, reserveMs: number) {
  return Date.now() + reserveMs < deadline;
}

function guildRosterRaiderIoStepLimit(total: number) {
  return Math.min(
    Math.max(0, total),
    readIntegerEnv(
      "GUILD_ROSTER_RAIDERIO_STEP_SIZE",
      readIntegerEnv("GUILD_ROSTER_RAIDERIO_BATCH_SIZE", 5, 0, 100),
      0,
      100,
    ),
  );
}

function guildRosterWclStepLimit(total: number) {
  return Math.min(
    Math.max(0, total),
    readIntegerEnv(
      "GUILD_ROSTER_WCL_STEP_SIZE",
      readIntegerEnv("GUILD_ROSTER_WCL_BATCH_SIZE", 1, 0, 20),
      0,
      20,
    ),
  );
}

function replaceMembersByKey(
  members: GuildRosterMember[],
  updates: Map<string, GuildRosterMember>,
) {
  if (!updates.size) return members;
  return members.map((member) => updates.get(member.key) || member);
}

function progressRemainingFromCandidates(totalCandidates: number, checked: number) {
  return Math.max(0, totalCandidates - Math.max(0, checked));
}

async function enrichGuildMembersWithRaiderIoStep(
  members: GuildRosterMember[],
  updatedAt: string,
  options: { force?: boolean; deadline: number },
): Promise<GuildRosterApiStepResult> {
  if (!members.length) {
    return {
      members,
      changedMemberKeys: new Set(),
      ...emptyProgress("empty_roster"),
    };
  }

  const candidates = staleFirst(
    members.filter((member) => options.force || !raiderIoSnapshotFresh(member)),
    (member) => member.raiderIoUpdatedAt,
  );
  const totalCandidates = candidates.length;
  const stepLimit = guildRosterRaiderIoStepLimit(totalCandidates);
  if (!stepLimit || !totalCandidates) {
    return {
      members,
      changedMemberKeys: new Set(),
      checked: 0,
      remaining: totalCandidates,
      totalCandidates,
      skipped: true,
      reason: totalCandidates ? "step_limit_zero" : "fresh",
    };
  }

  const updates = new Map<string, GuildRosterMember>();
  const changedMemberKeys = new Set<string>();
  let checked = 0;
  let reason: string | null = null;

  for (const member of candidates.slice(0, stepLimit)) {
    if (!hasStepBudget(options.deadline, 4_500)) {
      reason = "step_budget_exhausted";
      break;
    }

    try {
      const raider = await fetchRaiderCharacter(
        normalizeBattleNetRegion(member.region),
        member.realmSlug,
        member.name,
      );
      const next = applyRaiderIoPayload(member, raider, updatedAt);
      updates.set(member.key, next);
      changedMemberKeys.add(member.key);
      checked += 1;
    } catch {
      updates.set(member.key, { ...member, raiderIoUpdatedAt: updatedAt });
      changedMemberKeys.add(member.key);
      checked += 1;
    }
  }

  return {
    members: replaceMembersByKey(members, updates),
    changedMemberKeys,
    checked,
    remaining: progressRemainingFromCandidates(totalCandidates, checked),
    totalCandidates,
    skipped: checked === 0,
    reason: checked === 0 ? reason || "not_processed" : reason,
  };
}

async function enrichGuildMembersWithWarcraftLogsStep(
  members: GuildRosterMember[],
  options: { force?: boolean; deadline: number },
): Promise<GuildRosterApiStepResult> {
  if (!members.length) {
    return {
      members,
      changedMemberKeys: new Set(),
      ...emptyProgress("empty_roster"),
    };
  }

  const settings = await getGuildRosterWarcraftLogsSettings().catch(() => ({
    enabled: true,
    memberLimit: 0,
    concurrency: 0,
    maxConcurrency: 1,
  }));
  if (!settings.enabled) {
    return {
      members,
      changedMemberKeys: new Set(),
      ...emptyProgress("disabled"),
    };
  }

  const limit = guildRosterWclMemberLimit(members.length, settings.memberLimit);
  const selected = members.slice(0, limit);
  const candidates = staleFirst(
    selected.filter(
      (member) => !storedWclSnapshotFreshForBatch(member.warcraftLogs, options.force),
    ),
    (member) => member.warcraftLogs?.updatedAt,
  );
  const totalCandidates = candidates.length;
  const stepLimit = guildRosterWclStepLimit(totalCandidates);
  if (!stepLimit || !totalCandidates) {
    return {
      members,
      changedMemberKeys: new Set(),
      checked: 0,
      remaining: totalCandidates,
      totalCandidates,
      skipped: true,
      reason: totalCandidates ? "step_limit_zero" : "fresh",
    };
  }

  const updates = new Map<string, GuildRosterMember>();
  const changedMemberKeys = new Set<string>();
  let checked = 0;
  let reason: string | null = null;

  for (const member of candidates.slice(0, stepLimit)) {
    if (!hasStepBudget(options.deadline, 13_000)) {
      reason = "step_budget_exhausted";
      break;
    }

    try {
      const summary = await fetchWarcraftLogsCharacterSummary({
        region: member.region,
        realmSlug: member.realmSlug,
        name: member.name,
        mode: "roster",
      });
      const warcraftLogs = buildWarcraftLogsRosterSnapshot(member, summary);
      const next = { ...member, warcraftLogs };
      updates.set(member.key, next);
      changedMemberKeys.add(member.key);
      checked += 1;

      if (member.ownerProfileId) {
        await saveProfileCharacterWarcraftLogsSnapshot({
          profileId: member.ownerProfileId,
          characterKey: member.key,
          region: member.region,
          realmSlug: member.realmSlug,
          name: member.name,
          warcraftLogs,
        }).catch(() => false);
      }
    } catch {
      const failed: GuildRosterWarcraftLogsSnapshot = {
        status: "error",
        updatedAt: nowIso(),
        profileUrl: null,
        activeRole: member.role,
        primaryMetric: null,
        hps: null,
        dps: null,
        tankDps: null,
        tankHps: null,
        error: "Warcraft Logs step failed",
      };
      updates.set(member.key, { ...member, warcraftLogs: failed });
      changedMemberKeys.add(member.key);
      checked += 1;
    }
  }

  return {
    members: replaceMembersByKey(members, updates),
    changedMemberKeys,
    checked,
    remaining: progressRemainingFromCandidates(totalCandidates, checked),
    totalCandidates,
    skipped: checked === 0,
    reason: checked === 0 ? reason || "not_processed" : reason,
  };
}

function syncJobDoc() {
  if (!hasFirebaseProfileConfig()) return null;
  return getFirebaseAdminDb().collection(CACHE_COLLECTION).doc(SYNC_JOB_DOCUMENT);
}

function isSyncJob(value: any): value is GuildRosterSyncJob {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      ["running", "completed", "failed"].includes(value.status) &&
      typeof value.phase === "string" &&
      value.processed &&
      typeof value.updatedAt === "string",
  );
}

async function readGuildRosterSyncJob(): Promise<GuildRosterSyncJob | null> {
  if (globalThis.__mistblossomGuildRosterSyncJob)
    return globalThis.__mistblossomGuildRosterSyncJob;
  const doc = syncJobDoc();
  if (!doc) return null;
  const snapshot = await doc.get().catch(() => null);
  const data = snapshot?.exists ? snapshot.data() : null;
  const job = isSyncJob(data) ? data : null;
  if (job) globalThis.__mistblossomGuildRosterSyncJob = job;
  return job;
}

async function writeGuildRosterSyncJob(job: GuildRosterSyncJob) {
  const next = stripUndefined(job);
  globalThis.__mistblossomGuildRosterSyncJob = next;
  const doc = syncJobDoc();
  if (doc) await doc.set(next, { merge: false }).catch(() => null);
  return next;
}

function syncJobStale(job: GuildRosterSyncJob | null) {
  if (!job || job.status !== "running") return true;
  const updatedAt = Date.parse(job.updatedAt || "");
  if (!Number.isFinite(updatedAt)) return true;
  const ttlMs = readIntegerEnv("GUILD_ROSTER_SYNC_JOB_TTL_SECONDS", 30 * 60, 5 * 60, 6 * 60 * 60) * 1000;
  return Date.now() - updatedAt > ttlMs;
}

function createGuildRosterSyncJob(options: {
  forceRoster?: boolean;
  includeWarcraftLogs?: boolean;
  forceWarcraftLogs?: boolean;
  cached?: CachedRoster | null;
}): GuildRosterSyncJob {
  const now = nowIso();
  const hasCache = Boolean(options.cached?.members?.length);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    status: "running",
    phase: options.forceRoster || !hasCache ? "roster" : "raiderio",
    requestedAt: now,
    updatedAt: now,
    completedAt: null,
    forceRoster: Boolean(options.forceRoster),
    includeWarcraftLogs: options.includeWarcraftLogs !== false,
    forceWarcraftLogs: Boolean(options.forceWarcraftLogs),
    totalMembers: options.cached?.members?.length || 0,
    processed: { roster: 0, raiderIo: 0, warcraftLogs: 0 },
    errors: [],
    lastMemberKey: null,
  };
}

async function getOrCreateGuildRosterSyncJob(
  options: {
    forceRoster?: boolean;
    includeWarcraftLogs?: boolean;
    forceWarcraftLogs?: boolean;
    continueSync?: boolean;
  },
  cached: CachedRoster | null,
) {
  const existing = await readGuildRosterSyncJob().catch(() => null);
  const cacheNeedsRosterRefresh = !cached || !isFresh(cached);
  const shouldRefreshRoster = Boolean(options.forceRoster || cacheNeedsRosterRefresh);

  if (options.forceRoster || syncJobStale(existing)) {
    return writeGuildRosterSyncJob(
      createGuildRosterSyncJob({
        forceRoster: shouldRefreshRoster,
        includeWarcraftLogs: options.includeWarcraftLogs,
        forceWarcraftLogs: options.forceWarcraftLogs,
        cached,
      }),
    );
  }

  if (existing?.status === "running") return existing;

  if (options.continueSync || cacheNeedsRosterRefresh) {
    return writeGuildRosterSyncJob(
      createGuildRosterSyncJob({
        forceRoster: shouldRefreshRoster,
        includeWarcraftLogs: options.includeWarcraftLogs,
        forceWarcraftLogs: options.forceWarcraftLogs,
        cached,
      }),
    );
  }

  return existing;
}

function completedJob(job: GuildRosterSyncJob, phase: GuildRosterSyncPhase = "completed") {
  const now = nowIso();
  return {
    ...job,
    status: phase === "failed" ? "failed" : "completed",
    phase,
    updatedAt: now,
    completedAt: now,
  } satisfies GuildRosterSyncJob;
}

async function advanceGuildRosterSyncStep(
  job: GuildRosterSyncJob,
  cached: CachedRoster | null,
): Promise<{
  cache: CachedRoster | null;
  job: GuildRosterSyncJob;
  rosterProgress: { refreshed: boolean; source: string };
  raiderIoProgress: GuildRosterApiBatchProgress;
  warcraftLogsProgress: GuildRosterApiBatchProgress;
}> {
  const deadline = Date.now() + guildRosterStepBudgetMs();
  let currentCache = cached;
  let currentJob = job;
  let rosterProgress = { refreshed: false, source: currentCache?.source || "cache" };
  let raiderIoProgress: GuildRosterApiBatchProgress = emptyProgress("not_current_phase");
  let warcraftLogsProgress: GuildRosterApiBatchProgress = emptyProgress("not_current_phase");

  try {
    if (currentJob.status !== "running") {
      return { cache: currentCache, job: currentJob, rosterProgress, raiderIoProgress, warcraftLogsProgress };
    }

    if (currentJob.phase === "roster") {
      const next = await refreshGuildRosterAndCache(currentCache);
      if (!next) throw new Error("Battle.net roster cache write failed");
      currentCache = next;
      currentJob = {
        ...currentJob,
        phase: "raiderio",
        totalMembers: next.members.length,
        processed: { ...currentJob.processed, roster: next.members.length },
        updatedAt: nowIso(),
      };
      rosterProgress = { refreshed: true, source: next.source };
      await writeGuildRosterSyncJob(currentJob);
      return { cache: currentCache, job: currentJob, rosterProgress, raiderIoProgress, warcraftLogsProgress };
    }

    if (!currentCache) {
      currentJob = { ...currentJob, phase: "roster", updatedAt: nowIso() };
      await writeGuildRosterSyncJob(currentJob);
      return { cache: currentCache, job: currentJob, rosterProgress, raiderIoProgress, warcraftLogsProgress };
    }

    if (currentJob.phase === "raiderio") {
      const step = await enrichGuildMembersWithRaiderIoStep(currentCache.members, nowIso(), {
        force: false,
        deadline,
      });
      raiderIoProgress = {
        checked: step.checked,
        remaining: step.remaining,
        totalCandidates: step.totalCandidates,
        skipped: step.skipped,
        reason: step.reason ?? null,
      };

      if (step.checked > 0) {
        currentCache = await writeCachedRoster(
          {
            members: sortMembers(step.members),
            stats: { ...currentCache.stats, updatedAt: nowIso() },
            source: `${LIVE_SOURCE} • Raider.IO step`,
            error: currentCache.error || null,
          },
          { changedMemberKeys: step.changedMemberKeys },
        );
      }

      const nextPhase: GuildRosterSyncPhase = step.remaining > 0
        ? "raiderio"
        : currentJob.includeWarcraftLogs
          ? "warcraftlogs"
          : "completed";
      currentJob = {
        ...currentJob,
        phase: nextPhase,
        status: nextPhase === "completed" ? "completed" : "running",
        totalMembers: currentCache?.members.length || currentJob.totalMembers,
        processed: {
          ...currentJob.processed,
          raiderIo: currentJob.processed.raiderIo + step.checked,
        },
        lastMemberKey: Array.from(step.changedMemberKeys).at(-1) || currentJob.lastMemberKey || null,
        updatedAt: nowIso(),
        completedAt: nextPhase === "completed" ? nowIso() : null,
      };
      await writeGuildRosterSyncJob(currentJob);
      return { cache: currentCache, job: currentJob, rosterProgress, raiderIoProgress, warcraftLogsProgress };
    }

    if (currentJob.phase === "warcraftlogs") {
      const step = await enrichGuildMembersWithWarcraftLogsStep(currentCache.members, {
        force: false,
        deadline,
      });
      warcraftLogsProgress = {
        checked: step.checked,
        remaining: step.remaining,
        totalCandidates: step.totalCandidates,
        skipped: step.skipped,
        reason: step.reason ?? null,
      };

      if (step.checked > 0) {
        currentCache = await writeCachedRoster(
          {
            members: sortMembers(step.members),
            stats: { ...currentCache.stats, updatedAt: nowIso() },
            source: `${LIVE_SOURCE} • WCL step`,
            error: currentCache.error || null,
          },
          { changedMemberKeys: step.changedMemberKeys },
        );
      }

      const nextPhase: GuildRosterSyncPhase = step.remaining > 0 ? "warcraftlogs" : "completed";
      currentJob = {
        ...currentJob,
        phase: nextPhase,
        status: nextPhase === "completed" ? "completed" : "running",
        totalMembers: currentCache?.members.length || currentJob.totalMembers,
        processed: {
          ...currentJob.processed,
          warcraftLogs: currentJob.processed.warcraftLogs + step.checked,
        },
        lastMemberKey: Array.from(step.changedMemberKeys).at(-1) || currentJob.lastMemberKey || null,
        updatedAt: nowIso(),
        completedAt: nextPhase === "completed" ? nowIso() : null,
      };
      await writeGuildRosterSyncJob(currentJob);
      return { cache: currentCache, job: currentJob, rosterProgress, raiderIoProgress, warcraftLogsProgress };
    }

    if (currentJob.phase === "completed") {
      currentJob = completedJob(currentJob);
      await writeGuildRosterSyncJob(currentJob);
    }

    return { cache: currentCache, job: currentJob, rosterProgress, raiderIoProgress, warcraftLogsProgress };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown");
    currentJob = {
      ...currentJob,
      status: "failed",
      phase: "failed",
      updatedAt: nowIso(),
      completedAt: nowIso(),
      errors: [...(currentJob.errors || []).slice(-9), message],
    };
    await writeGuildRosterSyncJob(currentJob);
    return { cache: currentCache, job: currentJob, rosterProgress, raiderIoProgress, warcraftLogsProgress };
  }
}

export async function refreshGuildRosterApiBatch(options: {
  forceRoster?: boolean;
  includeWarcraftLogs?: boolean;
  forceWarcraftLogs?: boolean;
  continueSync?: boolean;
} = {}): Promise<GuildRosterLoadResult & { refresh: GuildRosterRefreshProgress }> {
  let cached = await readCachedRoster().catch(() => null);
  const shouldStart = options.forceRoster || options.continueSync || !cached || !isFresh(cached);
  let job = shouldStart
    ? await getOrCreateGuildRosterSyncJob(options, cached)
    : await readGuildRosterSyncJob().catch(() => null);

  let rosterProgress = { refreshed: false, source: cached?.source || "cache" };
  let raiderIoProgress: GuildRosterApiBatchProgress = emptyProgress("served_from_cache");
  let warcraftLogsProgress: GuildRosterApiBatchProgress = emptyProgress("served_from_cache");

  if (job?.status === "running" && shouldStart) {
    const step = await advanceGuildRosterSyncStep(job, cached);
    cached = step.cache || cached;
    job = step.job;
    rosterProgress = step.rosterProgress;
    raiderIoProgress = step.raiderIoProgress;
    warcraftLogsProgress = step.warcraftLogsProgress;
  }

  if (!cached) {
    const fallback: GuildRosterLoadResult = {
      members: [],
      stats: fallbackStats(),
      source: "stored-cache-missing",
      error: "Склад гільдії ще не має кешу. Запустіть синхронізацію складу.",
    };
    return {
      ...fallback,
      refresh: {
        roster: rosterProgress,
        raiderIo: emptyProgress("cache_missing"),
        warcraftLogs: emptyProgress("cache_missing"),
        sync: syncProgress(job),
      },
    };
  }

  const publicRoster = publicFromCache(cached);
  return {
    ...publicRoster,
    refresh: {
      roster: { ...rosterProgress, source: publicRoster.source },
      raiderIo: raiderIoProgress,
      warcraftLogs: warcraftLogsProgress,
      sync: syncProgress(job),
    },
  };
}

export async function loadStoredGuildRosterData(): Promise<GuildRosterLoadResult> {
  const cached = await readCachedRoster().catch(() => null);
  if (cached) return publicFromCache(cached);

  return {
    members: [],
    stats: fallbackStats(),
    source: "stored-cache-missing",
    error: "Збережений склад гільдії ще не знайдено в кеші сайту.",
  };
}

export async function loadGuildRosterData(
  options: GuildRosterLoadOptions = {},
): Promise<GuildRosterLoadResult> {
  const cached = await readCachedRoster().catch(() => null);

  if (cached) {
    if (options.forceRefresh || !isFresh(cached)) {
      scheduleGuildRosterBackgroundRefresh(
        options.forceRefresh ? "manual-force-cache-first" : "stale-cache",
      );
    }
    return publicFromCache(cached);
  }

  try {
    const stored = await refreshGuildRosterAndCache(null);
    return stored ? publicFromCache(stored) : await fetchLiveGuildRoster();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error || "Не вдалося оновити склад гільдії.");

    return {
      members: [],
      stats: fallbackStats(),
      source: "not-configured",
      error:
        message ||
        "Battle.net / Raider.IO інтеграція складу гільдії не налаштована.",
    };
  }
}
