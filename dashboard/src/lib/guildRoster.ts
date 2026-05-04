import { FieldValue } from "firebase-admin/firestore";
import { fetchBattleNetApplicationData, getDefaultBattleNetRegion, normalizeBattleNetRegion, type BattleNetRegion } from "@/lib/battlenet";
import { getAdaptiveConcurrency, mapConcurrent, readIntegerEnv } from "@/lib/concurrency";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";

export type GuildScoreSegment = "all" | "dps" | "healer" | "tank";
export type GuildRosterRole = "tank" | "healer" | "dps" | "unknown";

export type GuildRosterMember = {
  key: string;
  ownerProfileId?: string | null;
  ownerDisplayName?: string | null;
  rank: number | null;
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
  // eslint-disable-next-line no-var
  var __mistblossomGuildRosterCache: CachedRoster | undefined;
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).normalize("NFC").replace(/\s+/g, " ").trim();
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
  if (["healer", "healing", "heal", "хіл", "хілер", "лікар"].includes(role)) return "healer";
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
  if (typeof value.name?.en_GB === "string") return cleanText(value.name.en_GB) || null;
  if (typeof value.name?.en_US === "string") return cleanText(value.name.en_US) || null;
  const localized = Object.values(value.name || {}).find((item) => typeof item === "string" && cleanText(item));
  return localized ? cleanText(localized) || null : null;
}

function scoreFromSegments(segments: Record<string, any> | null | undefined, segment: GuildScoreSegment) {
  const entry = segments?.[segment] || segments?.[segment.toUpperCase()];
  if (entry && typeof entry === "object") return parsePositiveNumber(entry.score);
  return parsePositiveNumber(entry);
}

function scoreColorFromSegments(segments: Record<string, any> | null | undefined, segment: GuildScoreSegment) {
  const entry = segments?.[segment] || segments?.[segment.toUpperCase()];
  if (!entry || typeof entry !== "object") return undefined;
  const color = cleanText(entry.color);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}

function extractCurrentSeasonSegments(payload: RaiderIoCharacterPayload | null | undefined) {
  const seasons = Array.isArray(payload?.mythic_plus_scores_by_season) ? payload?.mythic_plus_scores_by_season : [];
  return (seasons[0]?.segments || {}) as Record<string, any>;
}

function characterKey(region: string, realmSlug: string, name: string, id?: unknown) {
  const safeName = slugify(name) || cleanText(name).toLocaleLowerCase();
  return `${region.toLowerCase()}:${realmSlug.toLowerCase()}:${safeName}:${cleanText(id || "")}`;
}

function getGuildConfig() {
  const region = normalizeBattleNetRegion(process.env.GUILD_ROSTER_REGION || process.env.WOW_REGION || getDefaultBattleNetRegion());
  const realmSlug = slugify(process.env.GUILD_ROSTER_REALM || process.env.WOW_REALM || process.env.WOW_GUILD_REALM || DEFAULT_GUILD_REALM) || DEFAULT_GUILD_REALM;
  const guildName = cleanText(process.env.GUILD_ROSTER_NAME || process.env.WOW_GUILD_NAME || process.env.BATTLENET_ALLOWED_GUILD_NAME || DEFAULT_GUILD_NAME, DEFAULT_GUILD_NAME);
  const guildSlug = slugify(guildName) || slugify(DEFAULT_GUILD_NAME);
  return { region, realmSlug, guildName, guildSlug };
}

function cacheTtlMs() {
  return readIntegerEnv("GUILD_ROSTER_CACHE_TTL_SECONDS", 1800, 300, 86_400) * 1000;
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), raiderIoTimeoutMs());

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "mistblossom-dashboard" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw new Error(`${label} timeout after ${raiderIoTimeoutMs()}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || raw || `${label} returned ${response.status}`);
  }

  return data;
}

async function fetchRaiderGuild(region: BattleNetRegion, realmSlug: string, guildName: string) {
  const url = new URL("https://raider.io/api/v1/guilds/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realmSlug);
  url.searchParams.set("name", guildName);
  url.searchParams.set("fields", "raid_progression:current-expansion:previous-expansion,raid_rankings:current-expansion:previous-expansion");
  const key = raiderIoAccessKey();
  if (key) url.searchParams.set("access_key", key);

  try {
    return await fetchJsonWithTimeout(url, "Raider.IO guild");
  } catch {
    return null;
  }
}

async function fetchRaiderCharacter(region: BattleNetRegion, realmSlug: string, name: string) {
  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realmSlug);
  url.searchParams.set("name", name);
  url.searchParams.set("fields", "gear,mythic_plus_scores_by_season:current");
  const key = raiderIoAccessKey();
  if (key) url.searchParams.set("access_key", key);

  try {
    return await fetchJsonWithTimeout(url, `Raider.IO character ${name}`) as RaiderIoCharacterPayload;
  } catch {
    return null;
  }
}

function buildScores(raider: RaiderIoCharacterPayload | null): Record<GuildScoreSegment, number> {
  const segments = extractCurrentSeasonSegments(raider);
  return SEGMENTS.reduce((acc, segment) => {
    acc[segment] = scoreFromSegments(segments, segment);
    return acc;
  }, {} as Record<GuildScoreSegment, number>);
}

function buildScoreColors(raider: RaiderIoCharacterPayload | null): Partial<Record<GuildScoreSegment, string>> {
  const segments = extractCurrentSeasonSegments(raider);
  return SEGMENTS.reduce((acc, segment) => {
    const color = scoreColorFromSegments(segments, segment);
    if (color) acc[segment] = color;
    return acc;
  }, {} as Partial<Record<GuildScoreSegment, string>>);
}

function numberFromHref(value: unknown) {
  const match = cleanText(value).match(/\/(\d+)(?:\?|$)/);
  return match ? Number(match[1]) : 0;
}

function rosterClassName(character: any) {
  const direct = pickLocalizedName(character?.playable_class || character?.character_class);
  if (direct) return direct;
  const id = Number(character?.playable_class?.id || character?.character_class?.id || numberFromHref(character?.playable_class?.key?.href));
  return CLASS_ID_FALLBACK[id] || "Unknown";
}

function rosterRaceName(character: any) {
  const direct = pickLocalizedName(character?.playable_race || character?.race);
  if (direct) return direct;
  const id = Number(character?.playable_race?.id || character?.race?.id || numberFromHref(character?.playable_race?.key?.href));
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

  const realmSlug = slugify(character.realm?.slug || character.realm?.name || raider?.realm || input.fallbackRealmSlug) || input.fallbackRealmSlug;
  const realmName = cleanText(character.realm?.name || raider?.realm || input.fallbackRealmName || realmSlug).toUpperCase();
  const className = cleanText(raider?.class || rosterClassName(character) || "Unknown");
  const raceName = cleanText(raider?.race || rosterRaceName(character) || "Unknown");
  const specName = cleanText(raider?.active_spec_name || "Unknown");
  const role = normalizeRole(raider?.active_spec_role || character.active_spec?.role || character.role);
  const scores = buildScores(raider);
  const profileUrl = cleanText(raider?.profile_url) || null;
  const avatarUrl = cleanText(raider?.thumbnail_url || raider?.avatar_url || character.avatarUrl || character.avatar) || null;

  return {
    key: characterKey(input.region, realmSlug, name, character.id || input.index),
    rank: Number.isFinite(Number(input.rosterEntry?.rank)) ? Number(input.rosterEntry.rank) : null,
    name,
    realmSlug,
    realmName,
    region: input.region.toUpperCase(),
    className,
    raceName,
    faction: normalizeFaction(raider?.faction || character.faction?.type || character.faction || input.fallbackFaction),
    gender: cleanText(raider?.gender || character.gender?.type || character.gender || ""),
    specName,
    role,
    avatarUrl,
    profileUrl,
    itemLevel: Math.round(parsePositiveNumber(raider?.gear?.item_level_equipped || character.itemLevel || character.item_level || character.ilvl)),
    scores,
    scoreColors: buildScoreColors(raider),
    hasRaiderIo: Boolean(profileUrl || Object.values(scores).some((score) => score > 0)),
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
    memberCount: members.length || Number(guild.member_count || guild.members_count || 0),
    guildName: cleanText(guild.name || input.configuredGuildName || DEFAULT_GUILD_NAME),
    guildRealm: cleanText(realm.name || realm.slug || input.configuredRealmSlug || DEFAULT_GUILD_REALM),
    guildFaction: normalizeFaction(faction.type || faction.name),
    profileUrl: cleanText(input.raiderGuild?.profile_url || guild.profile_url) || null,
    maxRioAll: Math.max(0, ...members.map((member) => member.scores.all)),
    maxItemLevel: Math.max(0, ...members.map((member) => member.itemLevel)),
    averageRioAll: average(members.map((member) => member.scores.all)),
    averageItemLevel: average(members.map((member) => member.itemLevel)),
  };
}

function sortMembers(members: GuildRosterMember[]) {
  return members.sort((a, b) => b.scores.all - a.scores.all || b.itemLevel - a.itemLevel || a.name.localeCompare(b.name, "uk"));
}

async function fetchLiveGuildRoster(): Promise<GuildRosterLoadResult> {
  const config = getGuildConfig();
  const updatedAt = new Date().toISOString();

  const [guildSummary, roster, raiderGuild] = await Promise.all([
    fetchBattleNetApplicationData(`/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}`, undefined, config.region),
    fetchBattleNetApplicationData(`/data/wow/guild/${encodeURIComponent(config.realmSlug)}/${encodeURIComponent(config.guildSlug)}/roster`, undefined, config.region),
    fetchRaiderGuild(config.region, config.realmSlug, config.guildName),
  ]);

  const guildBlock = roster?.guild || guildSummary || {};
  const fallbackRealmSlug = slugify(guildBlock?.realm?.slug || guildBlock?.realm?.name || config.realmSlug) || config.realmSlug;
  const fallbackRealmName = cleanText(guildBlock?.realm?.name || guildBlock?.realm?.slug || config.realmSlug);
  const fallbackFaction = cleanText(guildBlock?.faction?.type || guildSummary?.faction?.type || guildSummary?.faction?.name || "Alliance");
  const rawMembers: any[] = Array.isArray(roster?.members) ? roster.members.slice(0, guildMemberLimit()) : [];
  const concurrency = refreshConcurrency(rawMembers.length);

  const { results } = await mapConcurrent(rawMembers, async (entry, index) => {
    const character = entry?.character || {};
    const name = cleanText(character.name);
    const realmSlug = slugify(character.realm?.slug || character.realm?.name || fallbackRealmSlug) || fallbackRealmSlug;
    const raider = name ? await fetchRaiderCharacter(config.region, realmSlug, name) : null;
    return buildMemberFromSources({
      rosterEntry: entry,
      raider,
      region: config.region,
      fallbackRealmSlug,
      fallbackRealmName,
      fallbackFaction,
      index,
    });
  }, {
    profile: "external-api",
    concurrency,
    failFast: false,
  });

  const members = sortMembers(results.filter((member): member is GuildRosterMember => Boolean(member)));
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
  return Boolean(value && Array.isArray(value.members) && value.stats && typeof value.cachedAt === "string");
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
  if (globalThis.__mistblossomGuildRosterCache) return globalThis.__mistblossomGuildRosterCache;
  if (!hasFirebaseProfileConfig()) return null;

  const snapshot = await getFirebaseAdminDb().collection(CACHE_COLLECTION).doc(CACHE_DOCUMENT).get();
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
    await getFirebaseAdminDb().collection(CACHE_COLLECTION).doc(CACHE_DOCUMENT).set({
      payload: cache,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
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

export async function loadGuildRosterData(options: GuildRosterLoadOptions = {}): Promise<GuildRosterLoadResult> {
  const cached = await readCachedRoster().catch(() => null);
  if (!options.forceRefresh && isFresh(cached)) {
    return publicFromCache(cached as CachedRoster);
  }

  try {
    const live = await fetchLiveGuildRoster();
    const stored = await writeCachedRoster(live).catch(() => null);
    return stored ? publicFromCache(stored) : live;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Не вдалося оновити склад гільдії.");
    if (cached) {
      return {
        ...publicFromCache(cached),
        source: `${cached.source || LIVE_SOURCE} • stale`,
        error: message,
      };
    }

    return {
      members: [],
      stats: fallbackStats(),
      source: "not-configured",
      error: message || "Battle.net / Raider.IO інтеграція складу гільдії не налаштована.",
    };
  }
}
