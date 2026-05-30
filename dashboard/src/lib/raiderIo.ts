import { readIntegerEnv } from "@/lib/concurrency";
import { apiFetchJson } from "@/lib/apiHttp";
import type { BattleNetRegion } from "@/lib/battlenet";
import { normalizeBattleNetNameSlug, normalizeBattleNetRealmSlug } from "@/lib/wowCharacters";

export type RaiderIoScoreSegmentKey = "all" | "dps" | "healer" | "tank";

export type RaiderIoScoreSegment = {
  score: number | null;
  color: string | null;
};

export type RaiderIoCharacterSnapshot = {
  profileUrl: string | null;
  thumbnailUrl: string | null;
  itemLevelEquipped: number | null;
  currentScore: number | null;
  currentScores: Record<RaiderIoScoreSegmentKey, RaiderIoScoreSegment>;
  updatedAt: string;
};

export type RaiderIoCharacterProfile = RaiderIoCharacterSnapshot & {
  raw?: Record<string, unknown>;
};

export type RaiderIoDungeonRun = {
  dungeon: string;
  shortName: string | null;
  level: number | null;
  score: number | null;
  upgrades: number | null;
  completedAt: string | null;
  url: string | null;
};

export type RaiderIoRaidProgress = {
  slug: string;
  name: string;
  summary: string | null;
  totalBosses: number | null;
  normalKills: number | null;
  heroicKills: number | null;
  mythicKills: number | null;
};

export type RaiderIoCharacterDetails = {
  snapshot: RaiderIoCharacterSnapshot | null;
  bestRuns: RaiderIoDungeonRun[];
  recentRuns: RaiderIoDungeonRun[];
  highestRuns: RaiderIoDungeonRun[];
  raidProgression: RaiderIoRaidProgress[];
};

const SCORE_SEGMENTS: RaiderIoScoreSegmentKey[] = ["all", "dps", "healer", "tank"];
const DEFAULT_FIELDS = "gear,mythic_plus_scores_by_season:current";
export const RAIDERIO_CHARACTER_DETAIL_FIELDS = "gear,mythic_plus_scores_by_season:current,mythic_plus_best_runs,mythic_plus_recent_runs,mythic_plus_highest_level_runs,raid_progression";

function cleanText(value: unknown, maxLength = 500) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(0, maxLength));
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function positiveNumberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRecordValue(record: Record<string, unknown> | null, key: string): unknown {
  return record ? record[key] : undefined;
}

function arrayFromValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function timestampOrNull(value: unknown) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : text;
}

function raiderIoTimeoutMs() {
  return readIntegerEnv("RAIDERIO_REQUEST_TIMEOUT_MS", 10_000, 2_500, 30_000);
}

function raiderIoRetryCount() {
  return readIntegerEnv("RAIDERIO_REQUEST_RETRIES", 1, 0, 4);
}



function raiderIoAccessKey() {
  return cleanText(process.env.RAIDERIO_ACCESS_KEY, 240);
}


function scoreSegmentFromValue(value: unknown): RaiderIoScoreSegment {
  const record = asRecord(value);
  if (record) {
    const color = cleanText(record.color, 16);
    return {
      score: numberOrNull(record.score),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : null,
    };
  }

  return { score: numberOrNull(value), color: null };
}

function currentSeasonSegments(payload: Record<string, unknown>) {
  const seasons = Array.isArray(payload.mythic_plus_scores_by_season) ? payload.mythic_plus_scores_by_season : [];
  const season = asRecord(seasons[0]);
  return asRecord(season?.segments) || {};
}

function normalizeCurrentScores(payload: Record<string, unknown>): Record<RaiderIoScoreSegmentKey, RaiderIoScoreSegment> {
  const segments = currentSeasonSegments(payload);
  return SCORE_SEGMENTS.reduce((acc, segment) => {
    acc[segment] = scoreSegmentFromValue(getRecordValue(segments, segment) || getRecordValue(segments, segment.toUpperCase()));
    return acc;
  }, {} as Record<RaiderIoScoreSegmentKey, RaiderIoScoreSegment>);
}

function normalizeRaiderIoCharacterPayload(payload: unknown): RaiderIoCharacterProfile | null {
  const record = asRecord(payload);
  if (!record) return null;
  const currentScores = normalizeCurrentScores(record);
  const gear = asRecord(record.gear);
  const equipped = positiveNumberOrNull(gear?.item_level_equipped);
  const fallback = positiveNumberOrNull(gear?.item_level_total);

  return {
    profileUrl: cleanText(record.profile_url, 500) || null,
    thumbnailUrl: cleanText(record.thumbnail_url || record.avatar_url, 500) || null,
    itemLevelEquipped: equipped ?? fallback,
    currentScore: currentScores.all.score,
    currentScores,
    updatedAt: new Date().toISOString(),
    raw: record,
  };
}

export function buildRaiderIoCharacterUrl(input: { region: BattleNetRegion | string; realmSlug: string; name: string; fields?: string }) {
  const region = cleanText(input.region, 12).toLowerCase() || "eu";
  const realm = normalizeBattleNetRealmSlug(input.realmSlug);
  const name = normalizeBattleNetNameSlug(input.name) || cleanText(input.name, 80);
  if (!realm || !name) return null;

  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realm);
  url.searchParams.set("name", name);
  url.searchParams.set("fields", input.fields || DEFAULT_FIELDS);
  const key = raiderIoAccessKey();
  if (key) url.searchParams.set("access_key", key);
  return url;
}

export async function fetchRaiderIoCharacterProfile(input: {
  region: BattleNetRegion | string;
  realmSlug: string;
  name: string;
  fields?: string;
}): Promise<RaiderIoCharacterProfile | null> {
  const url = buildRaiderIoCharacterUrl(input);
  if (!url) return null;
  try {
    const payload = await apiFetchJson(url, {
      label: `Raider.IO character ${input.name}`,
      timeoutMs: raiderIoTimeoutMs(),
      retries: raiderIoRetryCount(),
      retryMethods: ["GET", "HEAD"],
      cache: "no-store",
    });
    return normalizeRaiderIoCharacterPayload(payload);
  } catch {
    return null;
  }
}

function normalizeDungeonRun(value: unknown): RaiderIoDungeonRun | null {
  const record = asRecord(value);
  if (!record) return null;

  const dungeon = cleanText(record.dungeon || record.dungeon_name || record.name, 140);
  const level = positiveNumberOrNull(record.mythic_level || record.level || record.keystone_level);
  if (!dungeon && !level) return null;

  return {
    dungeon: dungeon || "Невідомий підземелля",
    shortName: cleanText(record.short_name || record.shortName, 40) || null,
    level,
    score: numberOrNull(record.score),
    upgrades: numberOrNull(record.num_keystone_upgrades || record.upgrades),
    completedAt: timestampOrNull(record.completed_at || record.completedAt),
    url: cleanText(record.url, 700) || null,
  };
}

function normalizeDungeonRuns(value: unknown, limit = 8) {
  return arrayFromValue(value)
    .map(normalizeDungeonRun)
    .filter((item): item is RaiderIoDungeonRun => Boolean(item))
    .slice(0, Math.max(0, limit));
}

function normalizeRaidName(slug: string, value: Record<string, unknown>) {
  const explicit = cleanText(value.name || value.raid_name || value.raidName, 140);
  if (explicit) return explicit;
  return slug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Рейд";
}

function normalizeRaidProgression(value: unknown): RaiderIoRaidProgress[] {
  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(record).map(([slug, raw]) => {
    const raid = asRecord(raw) || {};
    return {
      slug,
      name: normalizeRaidName(slug, raid),
      summary: cleanText(raid.summary, 80) || null,
      totalBosses: numberOrNull(raid.total_bosses || raid.totalBosses),
      normalKills: numberOrNull(raid.normal_bosses_killed || raid.normalKills),
      heroicKills: numberOrNull(raid.heroic_bosses_killed || raid.heroicKills),
      mythicKills: numberOrNull(raid.mythic_bosses_killed || raid.mythicKills),
    };
  }).filter((item) => item.summary || item.totalBosses || item.normalKills || item.heroicKills || item.mythicKills);
}

export function buildRaiderIoCharacterDetails(profile: RaiderIoCharacterProfile | RaiderIoCharacterSnapshot | null | undefined): RaiderIoCharacterDetails {
  const raw = asRecord((profile as RaiderIoCharacterProfile | null | undefined)?.raw);
  return {
    snapshot: stripRaiderIoRaw(profile),
    bestRuns: normalizeDungeonRuns(raw?.mythic_plus_best_runs, 8),
    recentRuns: normalizeDungeonRuns(raw?.mythic_plus_recent_runs, 8),
    highestRuns: normalizeDungeonRuns(raw?.mythic_plus_highest_level_runs, 8),
    raidProgression: normalizeRaidProgression(raw?.raid_progression),
  };
}

export function stripRaiderIoRaw(snapshot: RaiderIoCharacterProfile | RaiderIoCharacterSnapshot | null | undefined): RaiderIoCharacterSnapshot | null {
  if (!snapshot) return null;
  const clean = { ...snapshot } as RaiderIoCharacterProfile;
  delete clean.raw;
  return clean;
}
