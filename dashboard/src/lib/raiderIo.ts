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

const SCORE_SEGMENTS: RaiderIoScoreSegmentKey[] = ["all", "dps", "healer", "tank"];
const DEFAULT_FIELDS = "gear,mythic_plus_scores_by_season:current";

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

export function stripRaiderIoRaw(snapshot: RaiderIoCharacterProfile | RaiderIoCharacterSnapshot | null | undefined): RaiderIoCharacterSnapshot | null {
  if (!snapshot) return null;
  const clean = { ...snapshot } as RaiderIoCharacterProfile;
  delete clean.raw;
  return clean;
}
