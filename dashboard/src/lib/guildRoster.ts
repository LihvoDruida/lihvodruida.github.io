import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { ApiHttpError, apiFetchJson } from "@/lib/apiHttp";
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
import { resilientRead, resilientWrite, getRuntimeCachedValue, runtimeCircuitOpen } from "@/lib/runtimeResilience";
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
const GUILD_RECORDS_COLLECTION = "guildRosterRecords";
const GUILD_RECORDS_MEMBERS_COLLECTION = "members";
const GUILD_RECORDS_CHUNKS_COLLECTION = "memberChunks";
const GUILD_RECORDS_CHUNK_FORMAT_VERSION = 2;
const GUILD_RECORDS_MAX_CHUNKS = 80;
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
  var __mistblossomRaiderIoRateLimitState: { blockedUntil: number; reason: string; loggedAt?: number } | undefined;
  var __mistblossomRaiderIoLastRequestAt: number | undefined;
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

function getGuildConfig(settings?: Pick<GuildRosterRuntimeSettings, "region" | "realm" | "guildName"> | null) {
  const region = normalizeBattleNetRegion(
    settings?.region ||
      process.env.GUILD_ROSTER_REGION ||
      process.env.WOW_REGION ||
      getDefaultBattleNetRegion(),
  );
  const realmSlug =
    slugify(
      settings?.realm ||
        process.env.GUILD_ROSTER_REALM ||
        process.env.WOW_REALM ||
        process.env.WOW_GUILD_REALM ||
        DEFAULT_GUILD_REALM,
    ) || DEFAULT_GUILD_REALM;
  const guildName = cleanText(
    settings?.guildName ||
      process.env.GUILD_ROSTER_NAME ||
      process.env.WOW_GUILD_NAME ||
      process.env.BATTLENET_ALLOWED_GUILD_NAME ||
      DEFAULT_GUILD_NAME,
    DEFAULT_GUILD_NAME,
  );
  const guildSlug = slugify(guildName) || slugify(DEFAULT_GUILD_NAME);
  return { region, realmSlug, guildName, guildSlug };
}

function cacheTtlMs(settings?: Pick<GuildRosterRuntimeSettings, "cacheTtlSeconds"> | null) {
  return (
    Math.max(300, Math.min(86_400, Math.floor(Number(settings?.cacheTtlSeconds || readIntegerEnv("GUILD_ROSTER_CACHE_TTL_SECONDS", 1800, 300, 86_400))))) * 1000
  );
}

function refreshConcurrency(
  total: number,
  settings?: Pick<GuildRosterRuntimeSettings, "refreshConcurrency" | "refreshMaxConcurrency"> | null,
) {
  if (settings?.refreshConcurrency) {
    return Math.max(1, Math.min(total || 1, Math.min(settings.refreshConcurrency, settings.refreshMaxConcurrency || settings.refreshConcurrency)));
  }
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

function raiderIoTimeoutMs(settings?: Pick<GuildRosterRuntimeSettings, "raiderIoRequestTimeoutMs"> | null) {
  return Math.max(2_500, Math.min(30_000, Math.floor(Number(settings?.raiderIoRequestTimeoutMs || readIntegerEnv("RAIDERIO_REQUEST_TIMEOUT_MS", 10_000, 2_500, 30_000)))));
}

function raiderIoAccessKey() {
  return cleanText(process.env.RAIDERIO_ACCESS_KEY);
}

class RaiderIoRateLimitError extends Error {
  retryAfterMs: number;
  blockedUntil: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RaiderIoRateLimitError";
    this.retryAfterMs = Math.max(1_000, retryAfterMs);
    this.blockedUntil = Date.now() + this.retryAfterMs;
  }
}

function isRaiderIoRateLimitError(error: unknown): error is RaiderIoRateLimitError {
  return error instanceof RaiderIoRateLimitError;
}

function raiderIoCooldownMs(
  settings?: Pick<GuildRosterRuntimeSettings, "raiderIoRateLimitCooldownSeconds"> | null,
) {
  const seconds = Number(
    settings?.raiderIoRateLimitCooldownSeconds ??
      readIntegerEnv("RAIDERIO_RATE_LIMIT_COOLDOWN_SECONDS", 900, 60, 86_400),
  );
  return Math.max(60_000, Math.min(86_400_000, Math.floor(seconds) * 1000));
}

function raiderIoRequestMinDelayMs(
  settings?: Pick<GuildRosterRuntimeSettings, "raiderIoRequestMinDelayMs"> | null,
) {
  const value = Number(
    settings?.raiderIoRequestMinDelayMs ??
      readIntegerEnv("RAIDERIO_REQUEST_MIN_DELAY_MS", 350, 0, 10_000),
  );
  return Math.max(0, Math.min(10_000, Math.floor(value)));
}

function getRaiderIoRateLimitBlock() {
  const state = globalThis.__mistblossomRaiderIoRateLimitState;
  if (!state) return null;
  if (state.blockedUntil <= Date.now()) {
    globalThis.__mistblossomRaiderIoRateLimitState = undefined;
    return null;
  }
  return state;
}

function raiderIoRateLimitMessage(error: unknown) {
  if (error instanceof RaiderIoRateLimitError) return error.message;
  const parts = [
    error instanceof Error ? error.message : String(error || ""),
    error instanceof ApiHttpError ? JSON.stringify(error.body || "") : "",
  ];
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function isRaiderIoRateLimited(error: unknown) {
  if (error instanceof RaiderIoRateLimitError) return true;
  const message = raiderIoRateLimitMessage(error).toLowerCase();
  return (
    (error instanceof ApiHttpError && error.status === 429) ||
    message.includes("too many requests") ||
    message.includes("request limit") ||
    message.includes("patreon")
  );
}

async function waitForRaiderIoSlot(
  settings?: Pick<GuildRosterRuntimeSettings, "raiderIoRequestMinDelayMs"> | null,
) {
  const delayMs = raiderIoRequestMinDelayMs(settings);
  if (!delayMs) return;

  const last = globalThis.__mistblossomRaiderIoLastRequestAt || 0;
  const waitMs = Math.max(0, last + delayMs - Date.now());
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  globalThis.__mistblossomRaiderIoLastRequestAt = Date.now();
}

async function recordRaiderIoRateLimit(
  error: unknown,
  settings?: Pick<GuildRosterRuntimeSettings, "raiderIoRateLimitCooldownSeconds" | "warningAuditLogs"> | null,
) {
  const retryAfterMs = error instanceof ApiHttpError && error.retryAfterMs
    ? error.retryAfterMs
    : raiderIoCooldownMs(settings);
  const message = raiderIoRateLimitMessage(error) || "Raider.IO rate limit";
  const blockedUntil = Date.now() + Math.max(60_000, retryAfterMs);
  const previous = globalThis.__mistblossomRaiderIoRateLimitState;
  globalThis.__mistblossomRaiderIoRateLimitState = {
    blockedUntil: Math.max(blockedUntil, previous?.blockedUntil || 0),
    reason: message,
    loggedAt: previous?.loggedAt,
  };

  const state = globalThis.__mistblossomRaiderIoRateLimitState;
  const lastLogged = state.loggedAt || 0;
  if (settings?.warningAuditLogs !== false && Date.now() - lastLogged > 10 * 60_000) {
    state.loggedAt = Date.now();
    await recordDashboardSystemLog(
      "warning",
      "guild.roster.raiderio.rate_limited",
      {
        summary: "Raider.IO тимчасово обмежив API. Синхронізація M+ score буде продовжена після паузи.",
        error: message,
        retryAfterSeconds: Math.ceil((state.blockedUntil - Date.now()) / 1000),
      },
      { persist: true },
    ).catch(() => false);
  }

  return new RaiderIoRateLimitError(message, state.blockedUntil - Date.now());
}

async function fetchJsonWithTimeout(
  url: URL,
  label: string,
  settings?: Pick<GuildRosterRuntimeSettings, "raiderIoRequestTimeoutMs" | "raiderIoRequestRetries" | "raiderIoRateLimitCooldownSeconds" | "raiderIoRequestMinDelayMs" | "warningAuditLogs"> | null,
) {
  const activeLimit = getRaiderIoRateLimitBlock();
  if (activeLimit) {
    throw new RaiderIoRateLimitError(
      activeLimit.reason || "Raider.IO rate limit",
      activeLimit.blockedUntil - Date.now(),
    );
  }

  await waitForRaiderIoSlot(settings);

  try {
    return await apiFetchJson<any>(url, {
      label,
      timeoutMs: raiderIoTimeoutMs(settings),
      retries: Math.max(0, Math.min(4, Math.floor(Number(settings?.raiderIoRequestRetries ?? readIntegerEnv("RAIDERIO_REQUEST_RETRIES", 1, 0, 4))))),
      retryStatuses: [408, 425, 500, 502, 503, 504],
      cache: "no-store",
      userAgent: "mistblossom-dashboard",
    });
  } catch (error) {
    if (isRaiderIoRateLimited(error)) throw await recordRaiderIoRateLimit(error, settings);
    throw error;
  }
}

async function fetchRaiderGuild(
  region: BattleNetRegion,
  realmSlug: string,
  guildName: string,
  settings?: GuildRosterRuntimeSettings | null,
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
    return await fetchJsonWithTimeout(url, "Raider.IO guild", settings);
  } catch (error) {
    if (!isRaiderIoRateLimitError(error)) return null;
    return null;
  }
}

async function fetchRaiderCharacter(
  region: BattleNetRegion,
  realmSlug: string,
  name: string,
  settings?: GuildRosterRuntimeSettings | null,
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
      settings,
    )) as RaiderIoCharacterPayload;
  } catch (error) {
    if (isRaiderIoRateLimitError(error)) throw error;
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

function scoresFromProfileRaiderIo(snapshot: any): Record<GuildScoreSegment, number> {
  const source = snapshot?.currentScores || {};
  return SEGMENTS.reduce((acc, segment) => {
    const entry = source[segment] || source[segment.toUpperCase?.()];
    const value = typeof entry === "object" && entry ? entry.score : entry;
    acc[segment] = parsePositiveNumber(value);
    return acc;
  }, {} as Record<GuildScoreSegment, number>);
}

function scoreColorsFromProfileRaiderIo(snapshot: any): Partial<Record<GuildScoreSegment, string>> {
  const source = snapshot?.currentScores || {};
  return SEGMENTS.reduce((acc, segment) => {
    const entry = source[segment] || source[segment.toUpperCase?.()];
    const color = cleanText(entry && typeof entry === "object" ? entry.color : "");
    if (/^#[0-9a-f]{6}$/i.test(color)) acc[segment] = color;
    return acc;
  }, {} as Partial<Record<GuildScoreSegment, string>>);
}

async function buildProfileSeedRoster(
  settings?: GuildRosterRuntimeSettings | null,
): Promise<CachedRoster | null> {
  if (!hasFirebaseProfileConfig()) return null;

  const config = getGuildConfig(settings);
  const updatedAt = nowIso();
  const limit = guildMemberLimit(settings);

  return resilientRead(
    "guild-roster-profile-seed",
    async () => {
      const snapshot = await getFirebaseAdminDb()
        .collection("dashboardProfiles")
        .limit(Math.max(50, Math.min(1000, limit)))
        .get();

      const membersByKey = new Map<string, GuildRosterMember>();
      for (const profileDoc of snapshot.docs) {
        const profile = profileDoc.data() || {};
        const characters = Array.isArray(profile.characters) ? profile.characters : [];
        for (const character of characters) {
          const name = cleanText(character?.name);
          if (!name) continue;

          const region = normalizeBattleNetRegion(character?.region || config.region);
          const realmSlug = slugify(character?.realmSlug || character?.realmName || config.realmSlug) || config.realmSlug;
          if (region !== config.region || realmSlug !== config.realmSlug) continue;

          const realmName = cleanText(character?.realmName || realmSlug).toUpperCase();
          const key = buildBattleNetCharacterKey(region, realmSlug, name) || characterKey(region, realmSlug, name, character?.key);
          if (!key || membersByKey.has(key)) continue;

          const rankInfo = guildStatusFromRank(character?.guildRank);
          const scores = scoresFromProfileRaiderIo(character?.raiderIo);
          const member: GuildRosterMember = {
            key,
            ownerProfileId: profileDoc.id,
            ownerDisplayName: cleanText(profile.displayName || profile.preferredName || profile.login) || null,
            rank: rankInfo.rank,
            guildStatus: character?.guildStatus || rankInfo.status,
            guildStatusLabel: character?.guildStatusLabel || rankInfo.label,
            name,
            realmSlug,
            realmName,
            region: region.toUpperCase(),
            className: cleanText(character?.className || "Unknown"),
            raceName: cleanText(character?.raceName || "Unknown"),
            faction: normalizeFaction(character?.faction || "Alliance"),
            gender: cleanText(character?.genderName || ""),
            specName: cleanText(character?.activeSpecName || "Unknown"),
            role: normalizeRole(character?.activeSpecRole),
            avatarUrl: cleanText(character?.avatarUrl) || null,
            profileUrl: cleanText(character?.raiderIo?.profileUrl || character?.profileUrl) || null,
            itemLevel: Math.round(parsePositiveNumber(character?.itemLevel) || 0),
            battleNetUpdatedAt: cleanText(character?.lastSeenAt || character?.addedAt) || updatedAt,
            scores,
            scoreColors: scoreColorsFromProfileRaiderIo(character?.raiderIo),
            hasRaiderIo: Boolean(character?.raiderIo?.profileUrl || hasUsefulScores(scores)),
            raiderIoUpdatedAt: cleanText(character?.raiderIo?.updatedAt) || null,
            warcraftLogs: normalizeWarcraftLogsStoredSnapshot(character?.warcraftLogs),
          };
          membersByKey.set(key, member);
          if (membersByKey.size >= limit) break;
        }
        if (membersByKey.size >= limit) break;
      }

      const members = sortMembers(Array.from(membersByKey.values()));
      if (!members.length) return null;

      return stripUndefined({
        members,
        stats: buildStats({
          guildSummary: {
            name: config.guildName,
            realm: { slug: config.realmSlug, name: config.realmSlug },
            faction: { type: "Alliance" },
          },
          raiderGuild: null,
          members,
          updatedAt,
          configuredGuildName: config.guildName,
          configuredRealmSlug: config.realmSlug,
        }),
        source: `${LIVE_SOURCE} • profile-seed-records`,
        error: "Battle.net roster тимчасово недоступний; створено Firebase-записи складу зі збережених профілів.",
        cachedAt: updatedAt,
      } satisfies CachedRoster);
    },
    {
      ttlMs: Math.max(30_000, Math.min(300_000, Number(settings?.cacheReadTtlMs || 120_000))),
      timeoutMs: 3_000,
      circuitKey: "firebase-profile-read",
      circuitTtlMs: 90_000,
      fallback: () => getRuntimeCachedValue<CachedRoster | null>("guild-roster-profile-seed", 24 * 60 * 60 * 1000) || null,
      logEvent: "guild.roster.profile_seed_read_failed",
    },
  );
}

async function fetchLiveGuildRoster(
  options: {
    previous?: CachedRoster | null;
    settings?: GuildRosterRuntimeSettings | null;
  } = {},
): Promise<GuildRosterLoadResult> {
  const config = getGuildConfig(options.settings);
  const updatedAt = new Date().toISOString();

  const guildNamespace = { namespace: `dynamic-${config.region}` };
  const [guildSummary, roster, raiderGuild] = await Promise.all([
    fetchBattleNetApplicationData(
      `/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}`,
      guildNamespace,
      config.region,
      {
        timeoutMs: options.settings?.battleNetRequestTimeoutMs,
        retries: options.settings?.battleNetRequestRetries,
      },
    ),
    fetchBattleNetApplicationData(
      `/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}/roster`,
      guildNamespace,
      config.region,
      {
        timeoutMs: options.settings?.battleNetRequestTimeoutMs,
        retries: options.settings?.battleNetRequestRetries,
      },
    ),
    fetchRaiderGuild(config.region, config.realmSlug, config.guildName, options.settings),
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
  const concurrency = refreshConcurrency(rawMembers.length, options.settings);
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

function guildRosterCacheWriteBatchSize(
  settings?: Pick<GuildRosterRuntimeSettings, "cacheWriteBatchSize"> | null,
) {
  const parsed = Number(settings?.cacheWriteBatchSize || process.env.GUILD_ROSTER_CACHE_WRITE_BATCH_SIZE || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(250, Math.floor(parsed)));
}

function guildRosterRecordsChunkSize() {
  const parsed = Number(process.env.GUILD_ROSTER_RECORDS_CHUNK_SIZE || 64);
  if (!Number.isFinite(parsed)) return 64;
  return Math.max(25, Math.min(120, Math.floor(parsed)));
}

function guildRosterLegacyMemberDocsReadEnabled() {
  return /^(1|true|yes|on)$/i.test(
    String(process.env.GUILD_ROSTER_READ_LEGACY_MEMBER_DOCS || ""),
  );
}

function guildRosterLegacyMemberDocsWriteEnabled() {
  return /^(1|true|yes|on)$/i.test(
    String(process.env.GUILD_ROSTER_WRITE_LEGACY_MEMBER_DOCS || ""),
  );
}

function guildRosterChunkDocId(index: number) {
  return `chunk-${String(index).padStart(4, "0")}`;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function guildRosterChunkReadySet() {
  const set = globalThis.__mistblossomGuildRosterChunkReadyByDocId || new Set<string>();
  globalThis.__mistblossomGuildRosterChunkReadyByDocId = set;
  return set;
}

function markGuildRosterChunkStoreReady(docId: string) {
  guildRosterChunkReadySet().add(docId);
}

function guildRosterChunkStoreReady(docId: string) {
  return guildRosterChunkReadySet().has(docId);
}

function readGuildRosterChunkCount(data: any) {
  const value = Number(data?.memberChunks?.count ?? data?.chunkCount ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(GUILD_RECORDS_MAX_CHUNKS, Math.floor(value)));
}

function normalizeMembersFromChunkData(data: any) {
  const rows = Array.isArray(data?.members) ? data.members : [];
  return rows
    .map((item) => normalizeMemberRecord(item))
    .filter((member): member is GuildRosterMember => Boolean(member?.key));
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

function guildRecordsDocId(
  settings?: Pick<GuildRosterRuntimeSettings, "region" | "realm" | "guildName"> | null,
) {
  const config = getGuildConfig(settings);
  return createHash("sha1")
    .update(`${config.region}:${config.realmSlug}:${config.guildSlug}`.toLowerCase())
    .digest("hex");
}

function guildRecordsDoc(
  settings?: Pick<GuildRosterRuntimeSettings, "region" | "realm" | "guildName"> | null,
) {
  return getFirebaseAdminDb()
    .collection(GUILD_RECORDS_COLLECTION)
    .doc(guildRecordsDocId(settings));
}

function normalizeMemberRecord(data: any): GuildRosterMember | null {
  const raw = data?.member || data;
  if (!raw || typeof raw !== "object") return null;
  const name = cleanText(raw.name);
  const region = cleanText(raw.region).toUpperCase();
  const realmSlug = slugify(raw.realmSlug);
  if (!name || !region || !realmSlug) return null;

  const fallbackKey = buildBattleNetCharacterKey(region, realmSlug, name);
  const scores = SEGMENTS.reduce(
    (acc, segment) => {
      acc[segment] = parsePositiveNumber(raw.scores?.[segment]);
      return acc;
    },
    {} as Record<GuildScoreSegment, number>,
  );

  return stripUndefined({
    key: cleanText(raw.key) || fallbackKey || characterKey(region, realmSlug, name),
    ownerProfileId: cleanText(raw.ownerProfileId) || null,
    ownerDisplayName: cleanText(raw.ownerDisplayName) || null,
    rank: raw.rank === null || raw.rank === undefined ? null : Number(raw.rank),
    guildStatus: raw.guildStatus || null,
    guildStatusLabel: raw.guildStatusLabel || null,
    name,
    realmSlug,
    realmName: cleanText(raw.realmName || realmSlug).toUpperCase(),
    region,
    className: cleanText(raw.className || "Unknown"),
    raceName: cleanText(raw.raceName || "Unknown"),
    faction: normalizeFaction(raw.faction || "Unknown"),
    gender: cleanText(raw.gender),
    specName: cleanText(raw.specName || "Unknown"),
    role: normalizeRole(raw.role),
    avatarUrl: cleanText(raw.avatarUrl) || null,
    profileUrl: cleanText(raw.profileUrl) || null,
    itemLevel: Math.round(parsePositiveNumber(raw.itemLevel) || 0),
    battleNetUpdatedAt: cleanText(raw.battleNetUpdatedAt) || null,
    scores,
    scoreColors: raw.scoreColors && typeof raw.scoreColors === "object" ? raw.scoreColors : {},
    hasRaiderIo: Boolean(raw.hasRaiderIo || raw.profileUrl || hasUsefulScores(scores)),
    raiderIoUpdatedAt: cleanText(raw.raiderIoUpdatedAt) || null,
    warcraftLogs: normalizeWarcraftLogsStoredSnapshot(raw.warcraftLogs),
  } satisfies GuildRosterMember);
}

function buildRosterFromFirebaseRecords(data: any, members: GuildRosterMember[]) {
  if (!members.length) return null;
  const config = getGuildConfig({
    region: data?.region,
    realm: data?.realmSlug || data?.realm,
    guildName: data?.guildName,
  });
  const updatedAt = cleanText(data?.updatedAtIso || data?.cachedAt) || null;
  return stripUndefined({
    members: sortMembers(members),
    stats: data?.stats || buildStats({
      guildSummary: {
        name: cleanText(data?.guildName) || config.guildName,
        realm: {
          slug: cleanText(data?.realmSlug) || config.realmSlug,
          name: cleanText(data?.realmName) || config.realmSlug,
        },
        faction: { type: cleanText(data?.guildFaction) || "Alliance" },
      },
      raiderGuild: null,
      members,
      updatedAt: updatedAt || new Date().toISOString(),
      configuredGuildName: config.guildName,
      configuredRealmSlug: config.realmSlug,
    }),
    source: cleanText(data?.source) || `${LIVE_SOURCE} • Firebase records`,
    error: typeof data?.error === "string" ? data.error : null,
    cachedAt: cleanText(data?.cachedAt || data?.updatedAtIso) || new Date().toISOString(),
  } satisfies CachedRoster);
}

async function readGuildRosterRecords(
  settings?: Pick<GuildRosterRuntimeSettings, "region" | "realm" | "guildName" | "cacheReadTtlMs"> | null,
): Promise<CachedRoster | null> {
  if (!hasFirebaseProfileConfig()) return null;

  const recordsDocId = guildRecordsDocId(settings);
  const cacheKey = `guild-roster-records:${recordsDocId}`;

  return resilientRead<CachedRoster | null>(
    cacheKey,
    async () => {
      const doc = guildRecordsDoc(settings);
      const snapshot = await doc.get();
      if (!snapshot.exists) return null;

      const data = snapshot.data() || {};
      const chunkCount = readGuildRosterChunkCount(data);
      let members: GuildRosterMember[] = [];

      if (chunkCount > 0) {
        const refs = Array.from({ length: chunkCount }, (_, index) =>
          doc.collection(GUILD_RECORDS_CHUNKS_COLLECTION).doc(guildRosterChunkDocId(index)),
        );
        const chunkSnapshots = await getFirebaseAdminDb().getAll(...refs);
        members = chunkSnapshots.flatMap((item) => normalizeMembersFromChunkData(item.data() || {}));
        markGuildRosterChunkStoreReady(recordsDocId);
      } else if (guildRosterLegacyMemberDocsReadEnabled()) {
        const memberSnapshots = await doc
          .collection(GUILD_RECORDS_MEMBERS_COLLECTION)
          .limit(1100)
          .get();
        members = memberSnapshots.docs
          .map((item) => normalizeMemberRecord(item.data()))
          .filter((member): member is GuildRosterMember => Boolean(member?.key));
      }

      const cache = buildRosterFromFirebaseRecords(data, members);
      if (cache) globalThis.__mistblossomGuildRosterCache = cache;
      return cache;
    },
    {
      ttlMs: Math.max(10_000, Math.min(300_000, Number(settings?.cacheReadTtlMs || process.env.GUILD_ROSTER_CACHE_READ_TTL_MS || 120_000))),
      timeoutMs: 3_500,
      circuitKey: "firebase-guild-roster-records-read",
      circuitTtlMs: 300_000,
      fallback: () => getRuntimeCachedValue<CachedRoster | null>(cacheKey, 24 * 60 * 60 * 1000) || null,
      logEvent: "guild.roster.records_read_failed",
    },
  );
}

async function writeGuildRosterRecords(
  cache: CachedRoster,
  options: CachedRosterWriteOptions = {},
) {
  if (!hasFirebaseProfileConfig()) return false;
  const config = getGuildConfig(options.settings);
  const recordsDocId = guildRecordsDocId(options.settings);
  const doc = guildRecordsDoc(options.settings);
  const changedKeys = options.changedMemberKeys;
  const recordChunkSize = guildRosterRecordsChunkSize();
  const memberChunks = chunkArray(cache.members, recordChunkSize);
  const updatedAtIso = new Date().toISOString();
  const shouldWriteAllChunks =
    options.fullMemberRewrite ||
    !changedKeys?.size ||
    !guildRosterChunkStoreReady(recordsDocId);
  const changedChunkIndexes = shouldWriteAllChunks
    ? new Set(memberChunks.map((_, index) => index))
    : new Set(
        memberChunks
          .map((chunk, index) =>
            chunk.some((member) => changedKeys?.has(member.key)) ? index : -1,
          )
          .filter((index) => index >= 0),
      );

  await doc.set(
    stripUndefined({
      region: config.region,
      realmSlug: config.realmSlug,
      guildName: config.guildName,
      guildKey: recordsDocId,
      stats: cache.stats,
      source: `${LIVE_SOURCE} • Firebase records`,
      error: cache.error || null,
      memberCount: cache.members.length,
      cachedAt: cache.cachedAt,
      memberChunks: {
        version: GUILD_RECORDS_CHUNK_FORMAT_VERSION,
        collection: GUILD_RECORDS_CHUNKS_COLLECTION,
        count: memberChunks.length,
        chunkSize: recordChunkSize,
        memberCount: cache.members.length,
        writtenAtIso: updatedAtIso,
      },
      chunkCount: memberChunks.length,
      updatedAtIso,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    { merge: true },
  );

  const chunkBatchSize = guildRosterCacheWriteBatchSize(options.settings);
  const chunkIndexes = Array.from(changedChunkIndexes).sort((a, b) => a - b);
  for (let index = 0; index < chunkIndexes.length; index += chunkBatchSize) {
    const batch = getFirebaseAdminDb().batch();
    for (const chunkIndex of chunkIndexes.slice(index, index + chunkBatchSize)) {
      batch.set(
        doc.collection(GUILD_RECORDS_CHUNKS_COLLECTION).doc(guildRosterChunkDocId(chunkIndex)),
        stripUndefined({
          version: GUILD_RECORDS_CHUNK_FORMAT_VERSION,
          chunkIndex,
          count: memberChunks[chunkIndex]?.length || 0,
          members: memberChunks[chunkIndex] || [],
          updatedAtIso,
          updatedAt: FieldValue.serverTimestamp(),
        }),
        { merge: true },
      );
    }
    await batch.commit();
  }

  markGuildRosterChunkStoreReady(recordsDocId);

  if (!guildRosterLegacyMemberDocsWriteEnabled()) return true;

  const membersToWrite = changedKeys?.size
    ? cache.members.filter((member) => changedKeys.has(member.key))
    : cache.members;
  const memberBatchSize = guildRosterCacheWriteBatchSize(options.settings);
  for (let index = 0; index < membersToWrite.length; index += memberBatchSize) {
    const batch = getFirebaseAdminDb().batch();
    for (const member of membersToWrite.slice(index, index + memberBatchSize)) {
      batch.set(
        doc.collection(GUILD_RECORDS_MEMBERS_COLLECTION).doc(memberDocId(member)),
        stripUndefined({
          key: member.key,
          battleNetKey: memberBattleNetKey(member),
          name: member.name,
          realmSlug: member.realmSlug,
          region: member.region,
          presentInGuild: true,
          member: { ...member, key: member.key },
          updatedAtIso,
          updatedAt: FieldValue.serverTimestamp(),
        }),
        { merge: true },
      );
    }
    await batch.commit();
  }

  return true;
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
    source: cleanText(meta.source) || `${LIVE_SOURCE} • Firebase records`,
    error: typeof meta.error === "string" ? meta.error : null,
    cachedAt: meta.cachedAt,
  } satisfies CachedRoster);
}

async function readCachedRoster(settings?: Pick<GuildRosterRuntimeSettings, "region" | "realm" | "guildName" | "cacheReadTtlMs"> | null): Promise<CachedRoster | null> {
  const records = await readGuildRosterRecords(settings).catch(() => null);
  if (records) return records;
  if (globalThis.__mistblossomGuildRosterCache)
    return globalThis.__mistblossomGuildRosterCache;
  if (!hasFirebaseProfileConfig()) return null;

  return resilientRead(
    "guild-roster-cache",
    async () => {
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

      if (data.payloadSharded && guildRosterLegacyMemberDocsReadEnabled()) {
        const memberSnapshots = await doc
          .collection(CACHE_MEMBERS_COLLECTION)
          .limit(1100)
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
    },
    {
      ttlMs: Math.max(30_000, Math.min(300_000, Number(settings?.cacheReadTtlMs || process.env.GUILD_ROSTER_CACHE_READ_TTL_MS || 60_000))),
      timeoutMs: 4_000,
      circuitKey: "firebase-guild-roster-read",
      circuitTtlMs: 120_000,
      fallback: () => getRuntimeCachedValue<CachedRoster | null>("guild-roster-cache", 24 * 60 * 60 * 1000) || globalThis.__mistblossomGuildRosterCache || null,
      logEvent: "guild.roster.cache_read_failed",
    },
  );
}

function firebaseGuildRosterStorageLimited() {
  return (
    runtimeCircuitOpen("firebase-guild-roster-records-read") ||
    runtimeCircuitOpen("firebase-guild-roster-read") ||
    runtimeCircuitOpen("firebase-guild-roster-write")
  );
}

function emptyGuildRosterFallback(message?: string): GuildRosterLoadResult {
  const storageLimited = firebaseGuildRosterStorageLimited();
  return {
    members: [],
    stats: fallbackStats(),
    source: storageLimited ? "firebase-temporary-unavailable" : "firebase-records-missing",
    error: storageLimited
      ? message || "Тимчасова технічна помилка: сховище Firebase недоступне або перевищило ліміти. Сайт зупинив важкі Firebase-запити, щоб не збільшувати перевищення квоти."
      : message || "Firebase-записи складу ще створюються. Синхронізація створить базові записи з Battle.net або зі збережених профілів.",
  };
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
  const chunkSize = guildRosterCacheWriteBatchSize(options.settings);

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

  if (options.fullMemberRewrite && options.settings?.cacheDeleteStaleMembers) {
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
    source: `${LIVE_SOURCE} • Firebase records`,
    cachedAt: new Date().toISOString(),
  } satisfies CachedRoster);

  globalThis.__mistblossomGuildRosterCache = cache;

  if (hasFirebaseProfileConfig()) {
    await resilientWrite(
      "guild-roster-cache-write",
      async () => {
        await writeGuildRosterRecords(cache, options);
        const doc = getFirebaseAdminDb()
          .collection(CACHE_COLLECTION)
          .doc(CACHE_DOCUMENT);
        await doc.set(
          {
            payload: FieldValue.delete(),
            payloadSharded: stripUndefined({
              stats: cache.stats,
              source: cache.source,
              error: cache.error || null,
              cachedAt: cache.cachedAt,
              memberCount: cache.members.length,
              primaryStore: GUILD_RECORDS_COLLECTION,
              recordsDocId: guildRecordsDocId(options.settings),
            }),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return true;
      },
      {
        circuitKey: "firebase-guild-roster-write",
        circuitTtlMs: 120_000,
        timeoutMs: 12_000,
        fallback: () => false,
        logEvent: "guild.roster.cache_write_failed",
      },
    );
  }

  return cache;
}

function publicFromCache(cache: CachedRoster): GuildRosterLoadResult {
  return {
    members: cache.members,
    stats: cache.stats,
    source: cache.source || `${LIVE_SOURCE} • Firebase records`,
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
        summary: "Guild roster live data was fetched, but Firebase record write failed. Using volatile in-memory data for this step.",
        error: message,
        memberCount: live.members.length,
      },
      { persist: settings?.warningAuditLogs !== false },
    );

    const volatileCache = stripUndefined({
      ...live,
      source: `${live.source} • volatile-Firebase-records`,
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
  const activeLimit = getRaiderIoRateLimitBlock();
  if (activeLimit && totalCandidates) {
    return {
      members,
      changedMemberKeys: new Set(),
      checked: 0,
      remaining: totalCandidates,
      totalCandidates,
      skipped: true,
      reason: `raiderio_rate_limited:${Math.ceil((activeLimit.blockedUntil - Date.now()) / 1000)}s`,
    };
  }

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
        options.settings,
      );
      const next = applyRaiderIoPayload(member, raider, updatedAt);
      updates.set(member.key, next);
      changedMemberKeys.add(member.key);
      checked += 1;
    } catch (error) {
      if (isRaiderIoRateLimitError(error)) {
        reason = `raiderio_rate_limited:${Math.ceil(error.retryAfterMs / 1000)}s`;
        break;
      }

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
  return resilientRead(
    "guild-roster-sync-job",
    async () => {
      const snapshot = await doc.get();
      const data = snapshot.exists ? snapshot.data() : null;
      const job = isSyncJob(data) ? normalizeSyncJob(data) : null;
      if (job) globalThis.__mistblossomGuildRosterSyncJob = job;
      return job;
    },
    {
      ttlMs: 10_000,
      timeoutMs: 2_000,
      circuitKey: "firebase-guild-roster-read",
      circuitTtlMs: 90_000,
      fallback: () => globalThis.__mistblossomGuildRosterSyncJob ? normalizeSyncJob(globalThis.__mistblossomGuildRosterSyncJob) : null,
      logEvent: "guild.roster.sync_job_read_failed",
    },
  );
}

async function writeGuildRosterSyncJob(job: GuildRosterSyncJob) {
  const next = stripUndefined(job);
  globalThis.__mistblossomGuildRosterSyncJob = next;
  const doc = syncJobDoc();
  if (doc) {
    await resilientWrite(
      "guild-roster-sync-job-write",
      () => doc.set(next, { merge: false }),
      {
        circuitKey: "firebase-guild-roster-write",
        circuitTtlMs: 120_000,
        timeoutMs: 2_000,
        fallback: () => undefined,
        logEvent: "guild.roster.sync_job_write_failed",
      },
    );
  }
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
        if (!currentCache?.members.length) {
          const seed = await buildProfileSeedRoster(settings).catch(() => null);
          if (seed?.members.length) {
            currentCache = await writeCachedRoster(seed, {
              fullMemberRewrite: true,
              settings,
            });
            currentJob = {
              ...currentJob,
              phase: "battlenet",
              status: "running",
              totalMembers: currentCache.members.length,
              processed: {
                ...currentJob.processed,
                roster: currentCache.members.length,
              },
              updatedAt: nowIso(),
              errors: [
                ...(currentJob.errors || []).slice(-8),
                `Battle.net roster unavailable; used profile seed Firebase records: ${message}`,
              ],
            };
            rosterProgress = {
              refreshed: true,
              source: `${currentCache.source} • Battle.net-fallback`,
            };
            await recordDashboardSystemLog(
              "warning",
              "guild.roster.profile_seed_used",
              {
                summary: "Battle.net roster не дав відповідь, створено Firebase-записи складу зі збережених профілів.",
                error: message,
                memberCount: currentCache.members.length,
              },
              { persist: settings?.warningAuditLogs !== false },
            );
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

          const friendly = message === "Not Found"
            ? `Battle.net не знайшов гільдію ${getGuildConfig(settings).guildName} на ${getGuildConfig(settings).realmSlug}-${getGuildConfig(settings).region}. Перевір назву, realm і region у Керуванні → Фоновий API.`
            : message;
          currentJob = {
            ...currentJob,
            status: "failed",
            phase: "failed",
            updatedAt: nowIso(),
            completedAt: nowIso(),
            errors: [...(currentJob.errors || []).slice(-9), friendly],
          };
          rosterProgress = { refreshed: false, source: "Battle.net roster unavailable" };
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
  let cached = await readCachedRoster(settings).catch(() => null);

  if (options.cacheOnly) {
    const existingJob = await readGuildRosterSyncJob().catch(() => null);
    const activeJob = existingJob?.status === "running" ? existingJob : null;
    const base = cached
      ? publicFromCache(cached)
      : emptyGuildRosterFallback();

    return {
      ...base,
      refresh: {
        roster: { refreshed: false, source: base.source },
        battleNet: emptyProgress("served_from_firebase"),
        raiderIo: emptyProgress("served_from_firebase"),
        warcraftLogs: emptyProgress("served_from_firebase"),
        sync: syncProgress(activeJob),
      },
    };
  }

  const shouldStart =
    options.forceRoster || options.continueSync || !cached || !isFresh(cached, cacheTtlMs(settings));
  let job = shouldStart
    ? await getOrCreateGuildRosterSyncJob(options, cached, settings)
    : await readGuildRosterSyncJob().catch(() => null);
  const isActiveRequest = shouldStart || job?.status === "running";

  let rosterProgress = { refreshed: false, source: cached?.source || "Firebase records" };
  let battleNetProgress: GuildRosterApiBatchProgress =
    emptyProgress("served_from_firebase");
  let raiderIoProgress: GuildRosterApiBatchProgress =
    emptyProgress("served_from_firebase");
  let warcraftLogsProgress: GuildRosterApiBatchProgress =
    emptyProgress("served_from_firebase");

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
    const fallback = emptyGuildRosterFallback();
    return {
      ...fallback,
      refresh: {
        roster: rosterProgress,
        battleNet: emptyProgress("firebase_records_missing"),
        raiderIo: emptyProgress("firebase_records_missing"),
        warcraftLogs: emptyProgress("firebase_records_missing"),
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
  const settings = await getGuildRosterSyncSettings().catch(() => null);
  const cached = await readCachedRoster(settings).catch(() => null);
  if (cached) return publicFromCache(cached);

  return emptyGuildRosterFallback("У Firebase ще немає нормалізованих записів складу гільдії.");
}

export async function loadGuildRosterData(
  options: GuildRosterLoadOptions = {},
): Promise<GuildRosterLoadResult> {
  void options;
  const settings = await getGuildRosterSyncSettings().catch(() => null);
  const cached = await readCachedRoster(settings).catch(() => null);

  if (cached) return publicFromCache(cached);

  return emptyGuildRosterFallback(
    firebaseGuildRosterStorageLimited()
      ? "Тимчасова технічна помилка: сховище Firebase недоступне або перевищило ліміти. Сайт не запускає додаткові важкі читання, щоб не добивати квоту."
      : "У Firebase ще немає нормалізованих записів складу або вони тимчасово недоступні. Сторінка не запускає live-збір під час render; синхронізація створює записи покроково.",
  );
}
