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

type CachedRoster = GuildRosterLoadResult & {
  cachedAt: string;
};

type RaiderIoCharacterPayload = Record<string, any>;

const SEGMENTS: GuildScoreSegment[] = ["all", "dps", "healer", "tank"];
const DEFAULT_GUILD_NAME = "Mistblossom Vanguard";
const DEFAULT_GUILD_REALM = "terokkar";
const CACHE_COLLECTION = "guildRuntimeCache";
const CACHE_DOCUMENT = "guildRoster";
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

function wclRefreshConcurrency(
  total: number,
  configuredConcurrency: number,
  configuredMaxConcurrency: number,
) {
  const concurrency =
    Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
      ? Math.floor(configuredConcurrency)
      : undefined;
  const maxConcurrency = Math.max(
    1,
    Math.min(Math.floor(configuredMaxConcurrency || 3), 8),
  );

  return getAdaptiveConcurrency(total, {
    profile: "external-api",
    concurrency,
    min: 1,
    max: maxConcurrency,
  });
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

type GuildRosterWarcraftLogsBatchResult = GuildRosterApiBatchProgress & {
  members: GuildRosterMember[];
};

function guildRosterWclBatchLimit(total: number) {
  return Math.min(
    Math.max(0, total),
    readIntegerEnv("GUILD_ROSTER_WCL_BATCH_SIZE", 1, 0, 20),
  );
}

function storedWclSnapshotFreshForBatch(
  snapshot?: GuildRosterWarcraftLogsSnapshot | null,
  force = false,
) {
  if (force) return false;
  return storedWclSnapshotFresh(snapshot);
}

async function enrichGuildMembersWithWarcraftLogs(
  members: GuildRosterMember[],
  options: { force?: boolean; batchLimit?: number } = {},
): Promise<GuildRosterWarcraftLogsBatchResult> {
  if (!members.length) {
    return {
      members,
      checked: 0,
      remaining: 0,
      totalCandidates: 0,
      skipped: true,
      reason: "empty_roster",
    };
  }

  const settings = await getGuildRosterWarcraftLogsSettings().catch(() => ({
    enabled: true,
    memberLimit: 0,
    concurrency: 0,
    maxConcurrency: 3,
  }));
  if (!settings.enabled) {
    return {
      members,
      checked: 0,
      remaining: 0,
      totalCandidates: 0,
      skipped: true,
      reason: "disabled",
    };
  }

  const limit = guildRosterWclMemberLimit(members.length, settings.memberLimit);
  if (limit <= 0) {
    return {
      members,
      checked: 0,
      remaining: 0,
      totalCandidates: 0,
      skipped: true,
      reason: "limit_zero",
    };
  }

  const selected = members.slice(0, limit);
  const selectedKeys = new Set(selected.map((member) => member.key));
  const candidates = staleFirst(
    selected.filter(
      (member) =>
        !storedWclSnapshotFreshForBatch(member.warcraftLogs, options.force),
    ),
    (member) => member.warcraftLogs?.updatedAt,
  );
  const requestedLimit = Math.max(0, Math.floor(options.batchLimit || 0));
  const batchLimit = requestedLimit || guildRosterWclBatchLimit(candidates.length);
  const staleMembers = candidates.slice(0, batchLimit);

  if (!staleMembers.length) {
    return {
      members,
      checked: 0,
      remaining: 0,
      totalCandidates: candidates.length,
      skipped: true,
      reason: "fresh",
    };
  }

  const concurrency = wclRefreshConcurrency(
    staleMembers.length,
    settings.concurrency,
    settings.maxConcurrency,
  );
  const { results } = await mapConcurrent(
    staleMembers,
    async (member) => {
      const summary = await fetchWarcraftLogsCharacterSummary({
        region: member.region,
        realmSlug: member.realmSlug,
        name: member.name,
        mode: "roster",
      });
      const warcraftLogs = buildWarcraftLogsRosterSnapshot(member, summary);
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
      return {
        key: member.key,
        warcraftLogs,
      };
    },
    {
      profile: "external-api",
      concurrency,
      failFast: false,
    },
  );

  const wclByKey = new Map(
    results
      .filter(
        (
          item,
        ): item is {
          key: string;
          warcraftLogs: GuildRosterWarcraftLogsSnapshot;
        } => Boolean(item?.key && item?.warcraftLogs),
      )
      .map((item) => [item.key, item.warcraftLogs]),
  );

  return {
    members: members.map((member) =>
      selectedKeys.has(member.key)
        ? {
            ...member,
            warcraftLogs: wclByKey.get(member.key) || member.warcraftLogs || null,
          }
        : member,
    ),
    checked: wclByKey.size,
    remaining: Math.max(0, candidates.length - wclByKey.size),
    totalCandidates: candidates.length,
    skipped: false,
    reason: null,
  };
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

function guildRosterRaiderIoBatchLimit(total: number) {
  return Math.min(
    Math.max(0, total),
    readIntegerEnv("GUILD_ROSTER_RAIDERIO_BATCH_SIZE", 3, 0, 100),
  );
}

function guildRosterRaiderIoConcurrency(total: number) {
  return getAdaptiveConcurrency(total, {
    profile: "external-api",
    envKey: "GUILD_ROSTER_RAIDERIO_CONCURRENCY",
    maxEnvKey: "GUILD_ROSTER_RAIDERIO_MAX_CONCURRENCY",
    min: 1,
    max: 3,
  });
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

async function enrichGuildMembersWithRaiderIoBatch(
  members: GuildRosterMember[],
  updatedAt: string,
) {
  if (!members.length) return { members, checked: 0, remaining: 0 };

  const candidates = staleFirst(
    members.filter((member) => !raiderIoSnapshotFresh(member)),
    (member) => member.raiderIoUpdatedAt,
  );
  const batchLimit = guildRosterRaiderIoBatchLimit(candidates.length);
  const selected = candidates.slice(0, batchLimit);
  if (!selected.length) return { members, checked: 0, remaining: 0 };

  const selectedKeys = new Set(selected.map((member) => member.key));
  const { results } = await mapConcurrent(
    selected,
    async (member) => {
      const raider = await fetchRaiderCharacter(
        normalizeBattleNetRegion(member.region),
        member.realmSlug,
        member.name,
      );
      return applyRaiderIoPayload(member, raider, updatedAt);
    },
    {
      profile: "external-api",
      concurrency: guildRosterRaiderIoConcurrency(selected.length),
      failFast: false,
    },
  );

  const byKey = new Map(
    results
      .filter((member): member is GuildRosterMember => Boolean(member?.key))
      .map((member) => [member.key, member]),
  );

  return {
    members: members.map((member) =>
      selectedKeys.has(member.key) ? byKey.get(member.key) || member : member,
    ),
    checked: byKey.size,
    remaining: Math.max(0, candidates.length - byKey.size),
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
  const raiderIoBatch = await enrichGuildMembersWithRaiderIoBatch(
    linkedMembers,
    updatedAt,
  );
  const members = sortMembers(raiderIoBatch.members);
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

async function readCachedRoster(): Promise<CachedRoster | null> {
  if (globalThis.__mistblossomGuildRosterCache)
    return globalThis.__mistblossomGuildRosterCache;
  if (!hasFirebaseProfileConfig()) return null;

  const snapshot = await getFirebaseAdminDb()
    .collection(CACHE_COLLECTION)
    .doc(CACHE_DOCUMENT)
    .get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const cache = data.payload;
  if (!isCachedRoster(cache)) return null;
  globalThis.__mistblossomGuildRosterCache = cache;
  return cache;
}

async function writeCachedRoster(result: GuildRosterLoadResult) {
  const cache = stripUndefined({
    ...result,
    source: `${LIVE_SOURCE} • cache`,
    cachedAt: new Date().toISOString(),
  } satisfies CachedRoster);

  globalThis.__mistblossomGuildRosterCache = cache;

  if (hasFirebaseProfileConfig()) {
    await getFirebaseAdminDb()
      .collection(CACHE_COLLECTION)
      .doc(CACHE_DOCUMENT)
      .set(
        {
          payload: cache,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
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
  return writeCachedRoster(live).catch(() => null);
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

export async function refreshGuildRosterApiBatch(options: {
  forceRoster?: boolean;
  includeWarcraftLogs?: boolean;
  forceWarcraftLogs?: boolean;
} = {}): Promise<GuildRosterLoadResult & { refresh: GuildRosterRefreshProgress }> {
  let cached = await readCachedRoster().catch(() => null);
  let rosterRefreshed = false;

  if (!cached || options.forceRoster || !isFresh(cached)) {
    const next = await refreshGuildRosterAndCache(cached).catch(() => null);
    if (next) {
      cached = next;
      rosterRefreshed = true;
    }
  }

  if (!cached) {
    const fallback: GuildRosterLoadResult = {
      members: [],
      stats: fallbackStats(),
      source: "stored-cache-missing",
      error: "Склад гільдії ще не має кешу. Повторіть оновлення після налаштування Battle.net/Firebase.",
    };
    return {
      ...fallback,
      refresh: {
        roster: { refreshed: rosterRefreshed, source: fallback.source },
        raiderIo: emptyProgress("cache_missing"),
        warcraftLogs: emptyProgress("cache_missing"),
      },
    };
  }

  let warcraftLogsProgress: GuildRosterApiBatchProgress = emptyProgress(
    "disabled_for_request",
  );
  let finalCache = cached;

  if (options.includeWarcraftLogs !== false) {
    const wclBatch = await enrichGuildMembersWithWarcraftLogs(cached.members, {
      force: options.forceWarcraftLogs,
    }).catch((error) => ({
      members: cached?.members || [],
      checked: 0,
      remaining: 0,
      totalCandidates: 0,
      skipped: true,
      reason: error instanceof Error ? error.message : "wcl_failed",
    }));

    warcraftLogsProgress = {
      checked: wclBatch.checked,
      remaining: wclBatch.remaining,
      totalCandidates: wclBatch.totalCandidates,
      skipped: wclBatch.skipped,
      reason: wclBatch.reason ?? null,
    };

    if (wclBatch.checked > 0) {
      const updatedStats = {
        ...cached.stats,
        updatedAt: new Date().toISOString(),
      };
      const written = await writeCachedRoster({
        members: sortMembers(wclBatch.members),
        stats: updatedStats,
        source: `${LIVE_SOURCE} • WCL batch`,
        error: cached.error || null,
      }).catch(() => null);
      if (written) finalCache = written;
    }
  }

  const publicRoster = publicFromCache(finalCache);
  return {
    ...publicRoster,
    refresh: {
      roster: { refreshed: rosterRefreshed, source: publicRoster.source },
      // Raider.IO is refreshed inside the roster batch. Expose the remaining count
      // from cached timestamps so UI can show that this refresh is chunked.
      raiderIo: {
        checked: rosterRefreshed ? 1 : 0,
        remaining: finalCache.members.filter(
          (member) => !raiderIoSnapshotFresh(member),
        ).length,
        totalCandidates: finalCache.members.length,
        skipped: !rosterRefreshed,
        reason: rosterRefreshed ? null : "served_from_cache",
      },
      warcraftLogs: warcraftLogsProgress,
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
