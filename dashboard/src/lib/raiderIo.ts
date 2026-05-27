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

function raiderIoTimeoutMs() {
  return readIntegerEnv("RAIDERIO_REQUEST_TIMEOUT_MS", 10_000, 2_500, 30_000);
}

function raiderIoRetryCount() {
  return readIntegerEnv("RAIDERIO_REQUEST_RETRIES", 1, 0, 4);
}



function raiderIoAccessKey() {
  return cleanText(process.env.RAIDERIO_ACCESS_KEY, 240);
}


function scoreSegmentFromValue(value: any): RaiderIoScoreSegment {
  if (value && typeof value === "object") {
    const color = cleanText(value.color, 16);
    return {
      score: numberOrNull(value.score),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : null,
    };
  }

  return { score: numberOrNull(value), color: null };
}

function currentSeasonSegments(payload: any) {
  const seasons = Array.isArray(payload?.mythic_plus_scores_by_season) ? payload.mythic_plus_scores_by_season : [];
  return seasons[0]?.segments && typeof seasons[0].segments === "object" ? seasons[0].segments : {};
}

function normalizeCurrentScores(payload: any): Record<RaiderIoScoreSegmentKey, RaiderIoScoreSegment> {
  const segments = currentSeasonSegments(payload);
  return SCORE_SEGMENTS.reduce((acc, segment) => {
    acc[segment] = scoreSegmentFromValue(segments?.[segment] || segments?.[segment.toUpperCase()]);
    return acc;
  }, {} as Record<RaiderIoScoreSegmentKey, RaiderIoScoreSegment>);
}

function normalizeRaiderIoCharacterPayload(payload: any): RaiderIoCharacterProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const currentScores = normalizeCurrentScores(payload);
  const equipped = positiveNumberOrNull(payload?.gear?.item_level_equipped);
  const fallback = positiveNumberOrNull(payload?.gear?.item_level_total);

  return {
    profileUrl: cleanText(payload.profile_url, 500) || null,
    thumbnailUrl: cleanText(payload.thumbnail_url || payload.avatar_url, 500) || null,
    itemLevelEquipped: equipped ?? fallback,
    currentScore: currentScores.all.score,
    currentScores,
    updatedAt: new Date().toISOString(),
    raw: payload,
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
  const { raw: _raw, ...rest } = snapshot as RaiderIoCharacterProfile;
  return rest;
}
