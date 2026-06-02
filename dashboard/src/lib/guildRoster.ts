import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { apiFetchJson } from "@/lib/apiHttp";
import {
  fetchBattleNetApplicationData,
  fetchBattleNetCharacterSnapshot,
  getDefaultBattleNetRegion,
  guildStatusFromRank,
  normalizeBattleNetRegion,
  type BattleNetGuildCharacterStatus,
  type BattleNetGuildRankInfo,
  type BattleNetRegion,
} from "@/lib/battlenet";
import {
  getAdaptiveConcurrency,
  mapConcurrent,
  readIntegerEnv,
} from "@/lib/concurrency";
import { getGuildRosterSyncSettings } from "@/lib/dashboardApiSettings";
import { recordDashboardSystemLog } from "@/lib/dashboardSystemLogs";
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
  normalizeBattleNetNameSlug,
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
  battleNetUpdatedAt?: string | null;
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
  | "battlenet"
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
    battleNet: number;
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
    battleNet: number;
    raiderIo: number;
    warcraftLogs: number;
  };
  updatedAt: string | null;
  completedAt: string | null;
  errors: string[];
};

type CachedRoster = GuildRosterLoadResult & {
  cachedAt: string;
};

type RaiderIoCharacterPayload = Record<string, any>;
type GuildRosterRuntimeSettings = Awaited<
  ReturnType<typeof getGuildRosterSyncSettings>
>;

const SEGMENTS: GuildScoreSegment[] = ["all", "dps", "healer", "tank"];
const DEFAULT_GUILD_NAME = "Mistblossom Vanguard";
const DEFAULT_GUILD_REALM = "terokkar";
const CACHE_COLLECTION = "guildRuntimeCache";
const CACHE_DOCUMENT = "guildRoster";
const CACHE_MEMBERS_COLLECTION = "members";
const SYNC_JOB_DOCUMENT = "guildRosterSyncJob";
const LIVE_SOURCE = "Battle.net Guild/Profile API + Raider.IO M+ API + Warcraft Logs API";

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
  var __mistblossomGuildRosterSyncJob: GuildRosterSyncJob | undefined;
  var __mistblossomGuildRosterMemberWarningLoggedAt: Map<string, number> | undefined;
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

function guildMemberLimit(
  settings?: Pick<GuildRosterRuntimeSettings, "memberLimit"> | null,
) {
  return Math.max(
    1,
    Math.min(1000, Math.floor(Number(settings?.memberLimit || 1000))),
  );
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
  ttlSeconds?: number,
) {
  const normalized = normalizeWarcraftLogsStoredSnapshot(snapshot);
  if (!normalized?.updatedAt || normalized.status !== "ready") return false;
  const updatedAt = Date.parse(normalized.updatedAt);
  if (!Number.isFinite(updatedAt)) return false;
  const effectiveTtlSeconds = Number.isFinite(ttlSeconds)
    ? Math.max(300, Math.min(604_800, Math.floor(Number(ttlSeconds))))
    : 21_600;
  return Date.now() - updatedAt < effectiveTtlSeconds * 1000;
}

function updatedSince(value: string | null | undefined, since?: string | null) {
  if (!since) return false;
  const valueTime = Date.parse(value || "");
  const sinceTime = Date.parse(since || "");
  if (!Number.isFinite(valueTime) || !Number.isFinite(sinceTime)) return false;
  // Allow a small clock/write skew between Vercel, Firebase and the browser.
  return valueTime + 2_000 >= sinceTime;
}

function battleNetSnapshotFreshForBatch(
  member: GuildRosterMember,
  options: {
    force?: boolean;
    ttlSeconds?: number;
    jobRequestedAt?: string | null;
  } = {},
) {
  if (options.force) {
    return updatedSince(member.battleNetUpdatedAt, options.jobRequestedAt);
  }
  return battleNetSnapshotFresh(member, options.ttlSeconds);
}

function raiderIoSnapshotFreshForBatch(
  member: GuildRosterMember,
  options: {
    force?: boolean;
    ttlSeconds?: number;
    jobRequestedAt?: string | null;
  } = {},
) {
  if (options.force) {
    return updatedSince(member.raiderIoUpdatedAt, options.jobRequestedAt);
  }
  return raiderIoSnapshotFresh(member, options.ttlSeconds);
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
  options: {
    force?: boolean;
    ttlSeconds?: number;
    jobRequestedAt?: string | null;
  } = {},
) {
  const normalized = normalizeWarcraftLogsStoredSnapshot(snapshot);
  if (options.force) {
    return updatedSince(normalized?.updatedAt, options.jobRequestedAt);
  }
  return storedWclSnapshotFresh(normalized, options.ttlSeconds);
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

function hasUsefulScores(
  scores: Record<GuildScoreSegment, number> | null | undefined,
) {
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
  return Number.isFinite(timestamp)
    ? Date.now() - timestamp
    : Number.POSITIVE_INFINITY;
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

  const nextScores = hasUsefulScores(member.scores)
    ? member.scores
    : previous.scores;
  const nextScoreColors = Object.keys(member.scoreColors || {}).length
    ? member.scoreColors
    : previous.scoreColors;

  return {
    ...member,
    ownerProfileId: member.ownerProfileId ?? previous.ownerProfileId ?? null,
    ownerDisplayName:
      member.ownerDisplayName ?? previous.ownerDisplayName ?? null,
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
    battleNetUpdatedAt:
      member.battleNetUpdatedAt || previous.battleNetUpdatedAt || null,
    scores: nextScores,
    scoreColors: nextScoreColors,
    hasRaiderIo:
      member.hasRaiderIo || previous.hasRaiderIo || hasUsefulScores(nextScores),
    raiderIoUpdatedAt:
      member.raiderIoUpdatedAt || previous.raiderIoUpdatedAt || null,
    warcraftLogs: member.warcraftLogs || previous.warcraftLogs || null,
  };
}

function raiderIoSnapshotFresh(member: GuildRosterMember, ttlSeconds = 21_600) {
  const effectiveTtlSeconds = Math.max(
    300,
    Math.min(604_800, Math.floor(Number(ttlSeconds) || 21_600)),
  );
  return timestampAgeMs(member.raiderIoUpdatedAt) < effectiveTtlSeconds * 1000;
}

function battleNetSnapshotFresh(member: GuildRosterMember, ttlSeconds = 21_600) {
  const effectiveTtlSeconds = Math.max(
    300,
    Math.min(604_800, Math.floor(Number(ttlSeconds) || 21_600)),
  );
  return timestampAgeMs(member.battleNetUpdatedAt) < effectiveTtlSeconds * 1000;
}

function applyBattleNetCharacterSnapshot(
  member: GuildRosterMember,
  snapshot: Awaited<ReturnType<typeof fetchBattleNetCharacterSnapshot>>,
  updatedAt: string,
): GuildRosterMember {
  if (!snapshot) {
    return { ...member, battleNetUpdatedAt: updatedAt };
  }

  const role = normalizeRole(snapshot.activeSpecRole);
  return {
    ...member,
    name: cleanText(snapshot.name) || member.name,
    realmSlug: cleanText(snapshot.realmSlug) || member.realmSlug,
    realmName: cleanText(snapshot.realmName || member.realmName).toUpperCase(),
    className: cleanText(snapshot.className) || member.className,
    raceName: cleanText(snapshot.raceName) || member.raceName,
    faction: normalizeFaction(snapshot.faction || member.faction),
    gender: cleanText(snapshot.genderName) || member.gender,
    specName: cleanText(snapshot.activeSpecName) || member.specName,
    role: role !== "unknown" ? role : member.role,
    avatarUrl: cleanText(snapshot.avatarUrl) || member.avatarUrl || null,
    itemLevel: Math.round(parsePositiveNumber(snapshot.itemLevel) || member.itemLevel || 0),
    guildStatus: snapshot.guildStatus || member.guildStatus,
    guildStatusLabel: snapshot.guildStatusLabel || member.guildStatusLabel,
    rank: snapshot.guildRank ?? member.rank,
    battleNetUpdatedAt: updatedAt,
  };
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

  return {
    ...member,
    // Raider.IO is intentionally limited to Mythic+ score and Raider.IO link.
    // Battle.net remains the source of truth for class/spec/role/avatar/ilvl.
    profileUrl,
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
  raider?: RaiderIoCharacterPayload | null;
  region: BattleNetRegion;
  fallbackRealmSlug: string;
  fallbackRealmName: string;
  fallbackFaction: string;
  index: number;
}): GuildRosterMember | null {
  const character = input.rosterEntry?.character || input.rosterEntry || {};
  const name = cleanText(character.name);
  if (!name) return null;

  const realmSlug =
    slugify(
      character.realm?.slug ||
        character.realm?.name ||
        input.fallbackRealmSlug,
    ) || input.fallbackRealmSlug;
  const realmName = cleanText(
    character.realm?.name ||
      input.fallbackRealmName ||
      realmSlug,
  ).toUpperCase();
  const className = cleanText(rosterClassName(character) || "Unknown");
  const raceName = cleanText(rosterRaceName(character) || "Unknown");
  const specName = cleanText(character.active_spec?.name || "Unknown");
  const role = normalizeRole(character.active_spec?.role || character.role);
  const scores = buildScores(null);
  const profileUrl = null;
  const avatarUrl = cleanText(character.avatarUrl || character.avatar) || null;

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
      character.faction?.type ||
        character.faction ||
        input.fallbackFaction,
    ),
    gender: cleanText(
      character.gender?.type || character.gender || "",
    ),
    specName,
    role,
    avatarUrl,
    profileUrl,
    itemLevel: Math.round(
      parsePositiveNumber(
        character.itemLevel || character.item_level || character.ilvl,
      ),
    ),
    battleNetUpdatedAt: null,
    scores,
    scoreColors: buildScoreColors(null),
    hasRaiderIo: false,
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

async function fetchLiveGuildRoster(
  options: {
    previous?: CachedRoster | null;
    settings?: GuildRosterRuntimeSettings | null;
  } = {},
): Promise<GuildRosterLoadResult> {
  const config = getGuildConfig();
  const updatedAt = new Date().toISOString();

  const guildNamespace = { namespace: `dynamic-${config.region}` };
  const [guildSummary, roster, raiderGuild] = await Promise.all([
    fetchBattleNetApplicationData(
      `/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}`,
      guildNamespace,
      config.region,
    ),
    fetchBattleNetApplicationData(
      `/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}/roster`,
      guildNamespace,
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
    ? roster.members.slice(0, guildMemberLimit(options.settings))
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

function shardedCacheEnabled(
  memberCount: number,
  settings?: Pick<
    GuildRosterRuntimeSettings,
    "shardedCacheEnabled" | "shardedCacheThreshold"
  > | null,
) {
  if (settings) {
    return (
      Boolean(settings.shardedCacheEnabled) &&
      memberCount >= Math.max(1, Math.min(1000, settings.shardedCacheThreshold))
    );
  }
  return memberCount >= 150;
}

function guildRosterCacheWriteBatchSize() {
  const parsed = Number(process.env.GUILD_ROSTER_CACHE_WRITE_BATCH_SIZE || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function memberDocId(
  member: Pick<GuildRosterMember, "key" | "region" | "realmSlug" | "name">,
) {
  const source =
    member.key ||
    memberBattleNetKey(member) ||
    `${member.region}:${member.realmSlug}:${member.name}`;
  return createHash("sha1").update(source.toLowerCase()).digest("hex");
}

function cachedRosterFromShardedPayload(
  data: any,
  members: GuildRosterMember[],
): CachedRoster | null {
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

  const doc = getFirebaseAdminDb()
    .collection(CACHE_COLLECTION)
    .doc(CACHE_DOCUMENT);
  const snapshot = await doc.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const legacyCache = data.payload;
  if (isCachedRoster(legacyCache)) {
    globalThis.__mistblossomGuildRosterCache = legacyCache;
    return legacyCache;
  }

  if (data.payloadSharded) {
    const memberSnapshots = await doc
      .collection(CACHE_MEMBERS_COLLECTION)
      .get();
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
  settings?: GuildRosterRuntimeSettings | null;
};

async function writeMemberDocs(
  members: GuildRosterMember[],
  options: CachedRosterWriteOptions = {},
) {
  if (!hasFirebaseProfileConfig()) return;
  if (!members.length && !options.fullMemberRewrite) return;

  const doc = getFirebaseAdminDb()
    .collection(CACHE_COLLECTION)
    .doc(CACHE_DOCUMENT);
  const changedKeys = options.changedMemberKeys;
  const membersToWrite = changedKeys?.size
    ? members.filter((member) => changedKeys.has(member.key))
    : members;
  const chunkSize = guildRosterCacheWriteBatchSize();

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

  if (options.fullMemberRewrite && process.env.GUILD_ROSTER_CACHE_DELETE_STALE_MEMBERS === "1") {
    const activeDocIds = new Set(members.map((member) => memberDocId(member)));
    const existing = await doc.collection(CACHE_MEMBERS_COLLECTION).get();
    const staleDocs = existing.docs.filter(
      (item) => !activeDocIds.has(item.id),
    );
    for (let index = 0; index < staleDocs.length; index += chunkSize) {
      const batch = getFirebaseAdminDb().batch();
      for (const item of staleDocs.slice(index, index + chunkSize))
        batch.delete(item.ref);
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
    const doc = getFirebaseAdminDb()
      .collection(CACHE_COLLECTION)
      .doc(CACHE_DOCUMENT);
    if (shardedCacheEnabled(cache.members.length, options.settings)) {
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

async function refreshGuildRosterAndCache(
  previous?: CachedRoster | null,
  settings?: GuildRosterRuntimeSettings | null,
) {
  const live = await fetchLiveGuildRoster({ previous, settings });
  try {
    return await writeCachedRoster(live, { fullMemberRewrite: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown");
    await recordDashboardSystemLog(
      "warning",
      "guild.roster.cache_write_failed",
      {
        summary: "Guild roster live data was fetched, but cache write failed. Using volatile in-memory data for this step.",
        error: message,
        memberCount: live.members.length,
      },
      { persist: settings?.warningAuditLogs !== false },
    );

    const volatileCache = stripUndefined({
      ...live,
      source: `${live.source} • volatile-cache`,
      cachedAt: new Date().toISOString(),
    } satisfies CachedRoster);
    globalThis.__mistblossomGuildRosterCache = volatileCache;
    return volatileCache;
  }
}

export type GuildRosterRefreshProgress = {
  roster: {
    refreshed: boolean;
    source: string;
  };
  battleNet: GuildRosterApiBatchProgress;
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

function syncProgress(
  job?: GuildRosterSyncJob | null,
): GuildRosterSyncProgress {
  if (!job) {
    return {
      id: null,
      status: "idle",
      phase: "idle",
      totalMembers: 0,
      processed: { roster: 0, battleNet: 0, raiderIo: 0, warcraftLogs: 0 },
      updatedAt: null,
      completedAt: null,
      errors: [],
    };
  }

  const totalMembers = Math.max(0, Number(job.totalMembers || 0));
  const processed = {
    roster: Math.min(totalMembers, Math.max(0, Number(job.processed?.roster || 0))),
    battleNet: Math.min(totalMembers, Math.max(0, Number(job.processed?.battleNet || 0))),
    raiderIo: Math.min(totalMembers, Math.max(0, Number(job.processed?.raiderIo || 0))),
    warcraftLogs: Math.min(totalMembers, Math.max(0, Number(job.processed?.warcraftLogs || 0))),
  };

  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    totalMembers,
    processed,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
    errors: Array.isArray(job.errors) ? job.errors.slice(-5) : [],
  };
}

function nowIso() {
  return new Date().toISOString();
}

function shouldLogMemberWarning(key: string, ttlMs = 60 * 60_000) {
  const map = globalThis.__mistblossomGuildRosterMemberWarningLoggedAt || new Map<string, number>();
  globalThis.__mistblossomGuildRosterMemberWarningLoggedAt = map;
  const last = map.get(key) || 0;
  const now = Date.now();
  if (now - last < ttlMs) return false;
  map.set(key, now);
  if (map.size > 2000) {
    for (const [itemKey, value] of map) {
      if (now - value > ttlMs) map.delete(itemKey);
      if (map.size <= 1500) break;
    }
  }
  return true;
}

function guildRosterStepBudgetMs(
  settings?: Pick<GuildRosterRuntimeSettings, "stepBudgetMs"> | null,
) {
  return Math.max(
    5_000,
    Math.min(38_000, Math.floor(Number(settings?.stepBudgetMs || 22_000))),
  );
}

function hasStepBudget(deadline: number, reserveMs: number) {
  return Date.now() + reserveMs < deadline;
}

function guildRosterBattleNetStepLimit(
  total: number,
  settings?: Pick<GuildRosterRuntimeSettings, "battleNetStepSize"> | null,
) {
  return Math.min(
    Math.max(0, total),
    Math.max(
      0,
      Math.min(100, Math.floor(Number(settings?.battleNetStepSize ?? 8))),
    ),
  );
}

function guildRosterRaiderIoStepLimit(
  total: number,
  settings?: Pick<GuildRosterRuntimeSettings, "raiderIoStepSize"> | null,
) {
  return Math.min(
    Math.max(0, total),
    Math.max(
      0,
      Math.min(100, Math.floor(Number(settings?.raiderIoStepSize ?? 5))),
    ),
  );
}

function guildRosterWclStepLimit(
  total: number,
  settings?: Pick<GuildRosterRuntimeSettings, "wclStepSize"> | null,
) {
  return Math.min(
    Math.max(0, total),
    Math.max(0, Math.min(20, Math.floor(Number(settings?.wclStepSize ?? 1)))),
  );
}

function replaceMembersByKey(
  members: GuildRosterMember[],
  updates: Map<string, GuildRosterMember>,
) {
  if (!updates.size) return members;
  return members.map((member) => updates.get(member.key) || member);
}

function progressRemainingFromCandidates(
  totalCandidates: number,
  checked: number,
) {
  return Math.max(0, totalCandidates - Math.max(0, checked));
}

function processedCountAfterStep(
  current: number,
  totalMembers: number,
  step: Pick<GuildRosterApiBatchProgress, "checked" | "remaining">,
) {
  const total = Math.max(0, Math.floor(Number(totalMembers || 0)));
  if (step.remaining <= 0) return total;
  return Math.min(total, Math.max(0, Math.floor(Number(current || 0))) + step.checked);
}

async function enrichGuildMembersWithBattleNetStep(
  members: GuildRosterMember[],
  updatedAt: string,
  options: {
    force?: boolean;
    deadline: number;
    settings?: GuildRosterRuntimeSettings | null;
    jobRequestedAt?: string | null;
  },
): Promise<GuildRosterApiStepResult> {
  if (!members.length) {
    return {
      members,
      changedMemberKeys: new Set(),
      ...emptyProgress("empty_roster"),
    };
  }

  const candidates = staleFirst(
    members.filter(
      (member) =>
        !battleNetSnapshotFreshForBatch(member, {
          force: options.force,
          ttlSeconds: options.settings?.battleNetTtlSeconds,
          jobRequestedAt: options.jobRequestedAt,
        }),
    ),
    (member) => member.battleNetUpdatedAt,
  );
  const totalCandidates = candidates.length;
  const stepLimit = guildRosterBattleNetStepLimit(
    totalCandidates,
    options.settings,
  );
  if (!stepLimit || !totalCandidates) {
    return {
      members,
      changedMemberKeys: new Set(),
      checked: 0,
      remaining: !stepLimit && totalCandidates ? 0 : totalCandidates,
      totalCandidates,
      skipped: true,
      reason: totalCandidates ? "disabled_by_step_size" : "fresh",
    };
  }

  const updates = new Map<string, GuildRosterMember>();
  const changedMemberKeys = new Set<string>();
  let checked = 0;
  let reason: string | null = null;

  for (const member of candidates.slice(0, stepLimit)) {
    if (!hasStepBudget(options.deadline, 6_000)) {
      reason = "step_budget_exhausted";
      break;
    }

    try {
      const guildRankInfo: BattleNetGuildRankInfo = {
        rank: member.rank,
        status: member.guildStatus,
        label: member.guildStatusLabel,
        key: memberBattleNetKey(member),
        region: member.region,
        characterName: member.name,
        normalizedName: normalizeBattleNetNameSlug(member.name),
        realmSlug: member.realmSlug,
      };
      const snapshot = await fetchBattleNetCharacterSnapshot({
        region: normalizeBattleNetRegion(member.region),
        realmSlug: member.realmSlug,
        name: member.name,
        normalizedName: normalizeBattleNetNameSlug(member.name),
        guildRankInfo,
        skipGuildRankMap: true,
      });
      const next = applyBattleNetCharacterSnapshot(member, snapshot, updatedAt);
      updates.set(member.key, next);
      changedMemberKeys.add(member.key);
      checked += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "unknown");
      updates.set(member.key, { ...member, battleNetUpdatedAt: updatedAt });
      changedMemberKeys.add(member.key);
      checked += 1;
      if (options.settings?.warningAuditLogs !== false) {
        await recordDashboardSystemLog("warning", "guild.roster.battlenet.member_failed", {
          summary: `Battle.net профіль не оновив ${member.name}`,
          character: member.name,
          realmSlug: member.realmSlug,
          region: member.region,
          error: message,
        }, { persist: true });
      }
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

async function enrichGuildMembersWithRaiderIoStep(
  members: GuildRosterMember[],
  updatedAt: string,
  options: {
    force?: boolean;
    deadline: number;
    settings?: GuildRosterRuntimeSettings | null;
    jobRequestedAt?: string | null;
  },
): Promise<GuildRosterApiStepResult> {
  if (!members.length) {
    return {
      members,
      changedMemberKeys: new Set(),
      ...emptyProgress("empty_roster"),
    };
  }

  const candidates = staleFirst(
    members.filter(
      (member) =>
        !raiderIoSnapshotFreshForBatch(member, {
          force: options.force,
          ttlSeconds: options.settings?.raiderIoTtlSeconds,
          jobRequestedAt: options.jobRequestedAt,
        }),
    ),
    (member) => member.raiderIoUpdatedAt,
  );
  const totalCandidates = candidates.length;
  const stepLimit = guildRosterRaiderIoStepLimit(
    totalCandidates,
    options.settings,
  );
  if (!stepLimit || !totalCandidates) {
    return {
      members,
      changedMemberKeys: new Set(),
      checked: 0,
      remaining: !stepLimit && totalCandidates ? 0 : totalCandidates,
      totalCandidates,
      skipped: true,
      reason: totalCandidates ? "disabled_by_step_size" : "fresh",
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "unknown");
      updates.set(member.key, { ...member, raiderIoUpdatedAt: updatedAt });
      changedMemberKeys.add(member.key);
      checked += 1;
      if (options.settings?.warningAuditLogs !== false) {
        await recordDashboardSystemLog("warning", "guild.roster.raiderio.member_failed", {
          summary: `Raider.IO не оновив ${member.name}`,
          character: member.name,
          realmSlug: member.realmSlug,
          region: member.region,
          error: message,
        }, { persist: true });
      }
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
  options: {
    force?: boolean;
    deadline: number;
    settings?: GuildRosterRuntimeSettings | null;
    jobRequestedAt?: string | null;
  },
): Promise<GuildRosterApiStepResult> {
  if (!members.length) {
    return {
      members,
      changedMemberKeys: new Set(),
      ...emptyProgress("empty_roster"),
    };
  }

  const settings =
    options.settings ?? (await getGuildRosterSyncSettings().catch(() => null));
  if (settings?.wclEnabled === false) {
    return {
      members,
      changedMemberKeys: new Set(),
      ...emptyProgress("disabled"),
    };
  }

  const limit = guildRosterWclMemberLimit(
    members.length,
    settings?.wclMemberLimit ?? 0,
  );
  const selected = members.slice(0, limit);
  const candidates = staleFirst(
    selected.filter(
      (member) =>
        !storedWclSnapshotFreshForBatch(member.warcraftLogs, {
          force: options.force,
          ttlSeconds: settings?.profileWclTtlSeconds,
          jobRequestedAt: options.jobRequestedAt,
        }),
    ),
    (member) => member.warcraftLogs?.updatedAt,
  );
  const totalCandidates = candidates.length;
  const stepLimit = guildRosterWclStepLimit(totalCandidates, settings);
  if (!stepLimit || !totalCandidates) {
    return {
      members,
      changedMemberKeys: new Set(),
      checked: 0,
      remaining: !stepLimit && totalCandidates ? 0 : totalCandidates,
      totalCandidates,
      skipped: true,
      reason: totalCandidates ? "disabled_by_step_size" : "fresh",
    };
  }

  const updates = new Map<string, GuildRosterMember>();
  const changedMemberKeys = new Set<string>();
  let checked = 0;
  let reason: string | null = null;
  const membersToProcess = candidates.slice(0, stepLimit);

  if (!hasStepBudget(options.deadline, 13_000)) {
    reason = "step_budget_exhausted";
  } else {
    const configuredConcurrency = Number(settings?.wclConcurrency || 0);
    const maxConcurrency = Math.max(
      1,
      Math.min(8, Math.floor(Number(settings?.wclMaxConcurrency || 1))),
    );
    const concurrency = Math.min(
      membersToProcess.length,
      Math.max(
        1,
        Math.min(
          maxConcurrency,
          Math.floor(configuredConcurrency > 0 ? configuredConcurrency : 1),
        ),
      ),
    );

    const { results } = await mapConcurrent(
      membersToProcess,
      async (member) => {
        try {
          const summary = await fetchWarcraftLogsCharacterSummary({
            region: member.region,
            realmSlug: member.realmSlug,
            name: member.name,
            mode: "roster",
          });
          const warcraftLogs = buildWarcraftLogsRosterSnapshot(member, summary);
          const hasMetric = Boolean(
            warcraftLogs.primaryMetric?.pulls ||
              warcraftLogs.hps?.pulls ||
              warcraftLogs.dps?.pulls ||
              warcraftLogs.tankDps?.pulls ||
              warcraftLogs.tankHps?.pulls,
          );
          if (summary.status !== "ready") {
            const logKey = `wcl-status:${member.key}:${summary.status}:${summary.error || ""}`;
            const shouldPersist = summary.status === "error"
              && settings?.warningAuditLogs !== false
              && shouldLogMemberWarning(logKey);
            if (shouldPersist) {
              await recordDashboardSystemLog("warning", "guild.roster.wcl.member_status", {
                summary: `Warcraft Logs не дав ready для ${member.name}`,
                character: member.name,
                realmSlug: member.realmSlug,
                region: member.region,
                role: member.role,
                status: summary.status,
                error: summary.error || null,
                profileUrl: summary.profileUrl || null,
              }, { persist: true });
            } else if (settings?.debugAuditLogs && shouldLogMemberWarning(logKey, 10 * 60_000)) {
              await recordDashboardSystemLog("debug", "guild.roster.wcl.member_status", {
                summary: `Warcraft Logs статус ${summary.status} для ${member.name}`,
                character: member.name,
                realmSlug: member.realmSlug,
                region: member.region,
                role: member.role,
                status: summary.status,
                error: summary.error || null,
              }, { debugEnabled: true, persist: true });
            }
          } else if (settings?.debugAuditLogs && !hasMetric) {
            await recordDashboardSystemLog("debug", "guild.roster.wcl.member_no_metric", {
              summary: `Warcraft Logs ready без DPS/HPS для ${member.name}`,
              character: member.name,
              realmSlug: member.realmSlug,
              region: member.region,
              role: member.role,
              coverage: summary.sourceCoverage,
            }, { debugEnabled: true, persist: true });
          }

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

          return { key: member.key, member: { ...member, warcraftLogs } };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || "unknown");
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
            error: message || "Warcraft Logs step failed",
          };
          if (settings?.warningAuditLogs !== false && shouldLogMemberWarning(`wcl-failed:${member.key}:${message}`)) {
            await recordDashboardSystemLog("warning", "guild.roster.wcl.member_failed", {
              summary: `Warcraft Logs не оновив ${member.name}`,
              character: member.name,
              realmSlug: member.realmSlug,
              region: member.region,
              role: member.role,
              error: message,
            }, { persist: true });
          }
          return {
            key: member.key,
            member: { ...member, warcraftLogs: failed },
          };
        }
      },
      {
        profile: "external-api",
        concurrency,
        max: concurrency,
        failFast: false,
      },
    );

    for (const result of results) {
      if (!result) continue;
      updates.set(result.key, result.member);
      changedMemberKeys.add(result.key);
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
  return getFirebaseAdminDb()
    .collection(CACHE_COLLECTION)
    .doc(SYNC_JOB_DOCUMENT);
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

function normalizeSyncJob(job: GuildRosterSyncJob): GuildRosterSyncJob {
  return {
    ...job,
    phase:
      job.phase === "roster" ||
      job.phase === "battlenet" ||
      job.phase === "raiderio" ||
      job.phase === "warcraftlogs" ||
      job.phase === "completed" ||
      job.phase === "failed"
        ? job.phase
        : "battlenet",
    processed: {
      roster: Number(job.processed?.roster || 0),
      battleNet: Number(job.processed?.battleNet || 0),
      raiderIo: Number(job.processed?.raiderIo || 0),
      warcraftLogs: Number(job.processed?.warcraftLogs || 0),
    },
    errors: Array.isArray(job.errors) ? job.errors.slice(-20).map(String) : [],
  };
}

async function readGuildRosterSyncJob(): Promise<GuildRosterSyncJob | null> {
  if (globalThis.__mistblossomGuildRosterSyncJob)
    return normalizeSyncJob(globalThis.__mistblossomGuildRosterSyncJob);
  const doc = syncJobDoc();
  if (!doc) return null;
  const snapshot = await doc.get().catch(() => null);
  const data = snapshot?.exists ? snapshot.data() : null;
  const job = isSyncJob(data) ? normalizeSyncJob(data) : null;
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

function syncJobStale(
  job: GuildRosterSyncJob | null,
  settings?: Pick<GuildRosterRuntimeSettings, "syncJobTtlSeconds"> | null,
) {
  if (!job || job.status !== "running") return true;
  const updatedAt = Date.parse(job.updatedAt || "");
  if (!Number.isFinite(updatedAt)) return true;
  const ttlMs =
    Math.max(
      300,
      Math.min(21_600, Number(settings?.syncJobTtlSeconds || 1_800)),
    ) * 1000;
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
    phase: options.forceRoster || !hasCache ? "roster" : "battlenet",
    requestedAt: now,
    updatedAt: now,
    completedAt: null,
    forceRoster: Boolean(options.forceRoster),
    includeWarcraftLogs: options.includeWarcraftLogs !== false,
    forceWarcraftLogs: Boolean(options.forceWarcraftLogs),
    totalMembers: options.cached?.members?.length || 0,
    processed: { roster: 0, battleNet: 0, raiderIo: 0, warcraftLogs: 0 },
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
  settings?: GuildRosterRuntimeSettings | null,
) {
  const existing = await readGuildRosterSyncJob().catch(() => null);
  const cacheNeedsRosterRefresh = !cached || !isFresh(cached);
  const shouldRefreshRoster = Boolean(
    options.forceRoster || cacheNeedsRosterRefresh,
  );

  if (options.forceRoster || syncJobStale(existing, settings)) {
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

function completedJob(
  job: GuildRosterSyncJob,
  phase: GuildRosterSyncPhase = "completed",
) {
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
  settings?: GuildRosterRuntimeSettings | null,
): Promise<{
  cache: CachedRoster | null;
  job: GuildRosterSyncJob;
  rosterProgress: { refreshed: boolean; source: string };
  battleNetProgress: GuildRosterApiBatchProgress;
  raiderIoProgress: GuildRosterApiBatchProgress;
  warcraftLogsProgress: GuildRosterApiBatchProgress;
}> {
  const deadline = Date.now() + guildRosterStepBudgetMs(settings);
  let currentCache = cached;
  let currentJob = job;
  let rosterProgress = {
    refreshed: false,
    source: currentCache?.source || "cache",
  };
  let battleNetProgress: GuildRosterApiBatchProgress =
    emptyProgress("not_current_phase");
  let raiderIoProgress: GuildRosterApiBatchProgress =
    emptyProgress("not_current_phase");
  let warcraftLogsProgress: GuildRosterApiBatchProgress =
    emptyProgress("not_current_phase");

  try {
    if (currentJob.status !== "running") {
      return {
        cache: currentCache,
        job: currentJob,
        rosterProgress,
        battleNetProgress,
        raiderIoProgress,
        warcraftLogsProgress,
      };
    }

    if (currentJob.phase === "roster") {
      try {
        const next = await refreshGuildRosterAndCache(currentCache, settings);
        currentCache = next;
        currentJob = {
          ...currentJob,
          phase: "battlenet",
          totalMembers: next.members.length,
          processed: { ...currentJob.processed, roster: next.members.length },
          updatedAt: nowIso(),
        };
        rosterProgress = { refreshed: true, source: next.source };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || "unknown");
        if (!currentCache?.members.length) throw error;

        await recordDashboardSystemLog(
          "warning",
          "guild.roster.roster_refresh_cache_fallback",
          {
            summary:
              "Battle.net guild roster refresh failed. Continuing sync with the last cached roster.",
            error: message,
            memberCount: currentCache.members.length,
            source: currentCache.source,
          },
          { persist: settings?.warningAuditLogs !== false },
        );

        currentJob = {
          ...currentJob,
          phase: "battlenet",
          totalMembers: currentCache.members.length,
          processed: {
            ...currentJob.processed,
            roster: currentCache.members.length,
          },
          updatedAt: nowIso(),
        };
        rosterProgress = {
          refreshed: false,
          source: `${currentCache.source} • stale-roster-fallback`,
        };
      }

      await writeGuildRosterSyncJob(currentJob);
      return {
        cache: currentCache,
        job: currentJob,
        rosterProgress,
        battleNetProgress,
        raiderIoProgress,
        warcraftLogsProgress,
      };
    }

    if (!currentCache) {
      currentJob = { ...currentJob, phase: "roster", updatedAt: nowIso() };
      await writeGuildRosterSyncJob(currentJob);
      return {
        cache: currentCache,
        job: currentJob,
        rosterProgress,
        battleNetProgress,
        raiderIoProgress,
        warcraftLogsProgress,
      };
    }

    if (currentJob.phase === "battlenet") {
      const step = await enrichGuildMembersWithBattleNetStep(
        currentCache.members,
        nowIso(),
        {
          force: currentJob.forceRoster,
          deadline,
          settings,
          jobRequestedAt: currentJob.requestedAt,
        },
      );
      battleNetProgress = {
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
            source: `${LIVE_SOURCE} • Battle.net profile step`,
            error: currentCache.error || null,
          },
          { changedMemberKeys: step.changedMemberKeys, settings },
        );
      }

      const nextPhase: GuildRosterSyncPhase =
        step.remaining > 0 ? "battlenet" : "raiderio";
      currentJob = {
        ...currentJob,
        phase: nextPhase,
        status: "running",
        totalMembers: currentCache?.members.length || currentJob.totalMembers,
        processed: {
          ...currentJob.processed,
          battleNet: processedCountAfterStep(
            currentJob.processed.battleNet,
            currentCache?.members.length || currentJob.totalMembers,
            step,
          ),
        },
        lastMemberKey:
          Array.from(step.changedMemberKeys).at(-1) ||
          currentJob.lastMemberKey ||
          null,
        updatedAt: nowIso(),
        completedAt: null,
      };
      await writeGuildRosterSyncJob(currentJob);
      return {
        cache: currentCache,
        job: currentJob,
        rosterProgress,
        battleNetProgress,
        raiderIoProgress,
        warcraftLogsProgress,
      };
    }

    if (currentJob.phase === "raiderio") {
      const step = await enrichGuildMembersWithRaiderIoStep(
        currentCache.members,
        nowIso(),
        {
          force: currentJob.forceRoster,
          deadline,
          settings,
          jobRequestedAt: currentJob.requestedAt,
        },
      );
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
          { changedMemberKeys: step.changedMemberKeys, settings },
        );
      }

      const nextPhase: GuildRosterSyncPhase =
        step.remaining > 0
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
          raiderIo: processedCountAfterStep(
            currentJob.processed.raiderIo,
            currentCache?.members.length || currentJob.totalMembers,
            step,
          ),
        },
        lastMemberKey:
          Array.from(step.changedMemberKeys).at(-1) ||
          currentJob.lastMemberKey ||
          null,
        updatedAt: nowIso(),
        completedAt: nextPhase === "completed" ? nowIso() : null,
      };
      await writeGuildRosterSyncJob(currentJob);
      return {
        cache: currentCache,
        job: currentJob,
        rosterProgress,
        battleNetProgress,
        raiderIoProgress,
        warcraftLogsProgress,
      };
    }

    if (currentJob.phase === "warcraftlogs") {
      const step = await enrichGuildMembersWithWarcraftLogsStep(
        currentCache.members,
        {
          force: currentJob.forceWarcraftLogs,
          deadline,
          settings,
          jobRequestedAt: currentJob.requestedAt,
        },
      );
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
          { changedMemberKeys: step.changedMemberKeys, settings },
        );
      }

      const nextPhase: GuildRosterSyncPhase =
        step.remaining > 0 ? "warcraftlogs" : "completed";
      currentJob = {
        ...currentJob,
        phase: nextPhase,
        status: nextPhase === "completed" ? "completed" : "running",
        totalMembers: currentCache?.members.length || currentJob.totalMembers,
        processed: {
          ...currentJob.processed,
          warcraftLogs: processedCountAfterStep(
            currentJob.processed.warcraftLogs,
            currentCache?.members.length || currentJob.totalMembers,
            step,
          ),
        },
        lastMemberKey:
          Array.from(step.changedMemberKeys).at(-1) ||
          currentJob.lastMemberKey ||
          null,
        updatedAt: nowIso(),
        completedAt: nextPhase === "completed" ? nowIso() : null,
      };
      await writeGuildRosterSyncJob(currentJob);
      return {
        cache: currentCache,
        job: currentJob,
        rosterProgress,
        battleNetProgress,
        raiderIoProgress,
        warcraftLogsProgress,
      };
    }

    if (currentJob.phase === "completed") {
      currentJob = completedJob(currentJob);
      await writeGuildRosterSyncJob(currentJob);
    }

    return {
      cache: currentCache,
      job: currentJob,
      rosterProgress,
      battleNetProgress,
      raiderIoProgress,
      warcraftLogsProgress,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error || "unknown");
    await recordDashboardSystemLog("error", "guild.roster.sync.step_failed", {
      summary: message,
      phase: currentJob.phase,
      status: currentJob.status,
      totalMembers: currentJob.totalMembers,
      processed: currentJob.processed,
      error: message,
    }, { persist: true });
    currentJob = {
      ...currentJob,
      status: "failed",
      phase: "failed",
      updatedAt: nowIso(),
      completedAt: nowIso(),
      errors: [...(currentJob.errors || []).slice(-9), message],
    };
    await writeGuildRosterSyncJob(currentJob);
    return {
      cache: currentCache,
      job: currentJob,
      rosterProgress,
      battleNetProgress,
      raiderIoProgress,
      warcraftLogsProgress,
    };
  }
}

export async function refreshGuildRosterApiBatch(
  options: {
    forceRoster?: boolean;
    includeWarcraftLogs?: boolean;
    forceWarcraftLogs?: boolean;
    continueSync?: boolean;
    cacheOnly?: boolean;
  } = {},
): Promise<GuildRosterLoadResult & { refresh: GuildRosterRefreshProgress }> {
  const settings = await getGuildRosterSyncSettings().catch(() => null);
  let cached = await readCachedRoster().catch(() => null);

  if (options.cacheOnly) {
    const existingJob = await readGuildRosterSyncJob().catch(() => null);
    const activeJob = existingJob?.status === "running" ? existingJob : null;
    const base = cached
      ? publicFromCache(cached)
      : {
          members: [],
          stats: fallbackStats(),
          source: "stored-cache-missing",
          error: "Склад гільдії ще не має кешу. Запустіть синхронізацію складу.",
        };

    return {
      ...base,
      refresh: {
        roster: { refreshed: false, source: base.source },
        battleNet: emptyProgress("served_from_cache"),
        raiderIo: emptyProgress("served_from_cache"),
        warcraftLogs: emptyProgress("served_from_cache"),
        sync: syncProgress(activeJob),
      },
    };
  }

  const shouldStart =
    options.forceRoster || options.continueSync || !cached || !isFresh(cached);
  let job = shouldStart
    ? await getOrCreateGuildRosterSyncJob(options, cached, settings)
    : await readGuildRosterSyncJob().catch(() => null);
  const isActiveRequest = shouldStart || job?.status === "running";

  let rosterProgress = { refreshed: false, source: cached?.source || "cache" };
  let battleNetProgress: GuildRosterApiBatchProgress =
    emptyProgress("served_from_cache");
  let raiderIoProgress: GuildRosterApiBatchProgress =
    emptyProgress("served_from_cache");
  let warcraftLogsProgress: GuildRosterApiBatchProgress =
    emptyProgress("served_from_cache");

  if (job?.status === "running" && shouldStart) {
    const step = await advanceGuildRosterSyncStep(job, cached, settings);
    cached = step.cache || cached;
    job = step.job;
    rosterProgress = step.rosterProgress;
    battleNetProgress = step.battleNetProgress;
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
        battleNet: emptyProgress("cache_missing"),
        raiderIo: emptyProgress("cache_missing"),
        warcraftLogs: emptyProgress("cache_missing"),
        sync: syncProgress(isActiveRequest ? job : null),
      },
    };
  }

  const publicRoster = publicFromCache(cached);
  return {
    ...publicRoster,
    refresh: {
      roster: { ...rosterProgress, source: publicRoster.source },
      battleNet: battleNetProgress,
      raiderIo: raiderIoProgress,
      warcraftLogs: warcraftLogsProgress,
      sync: syncProgress(isActiveRequest ? job : null),
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
  void options;
  const cached = await readCachedRoster().catch(() => null);

  if (cached) return publicFromCache(cached);

  return {
    members: [],
    stats: fallbackStats(),
    source: "stored-cache-missing",
    error: "Склад гільдії ще не має кешу або кеш тимчасово недоступний. Запусти покрокову синхронізацію — сторінка більше не блокується live-збором.",
  };
}
