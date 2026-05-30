import { createHash } from "crypto";

import { apiFetchJson } from "@/lib/apiHttp";
import { readIntegerEnv } from "@/lib/concurrency";
import type { BattleNetRegion } from "@/lib/battlenet";
import {
  getWarcraftLogsApiCredentials,
  type WarcraftLogsApiCredentials,
} from "@/lib/dashboardApiSettings";
import {
  normalizeBattleNetNameSlug,
  normalizeBattleNetRealmSlug,
} from "@/lib/wowCharacters";

type WarcraftLogsTokenCache = {
  token: string;
  expiresAt: number;
  cacheKey: string;
} | null;

type WarcraftLogsGraphqlResponse = {
  data?: {
    characterData?: {
      character?: Record<string, unknown> | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }>;
};

export type WarcraftLogsEncounterRanking = {
  encounterName: string;
  spec: string | null;
  metric: string | null;
  difficulty: number | null;
  percentile: number | null;
  rankPercent: number | null;
  bestAmount: number | null;
  totalKills: number | null;
  reportCode: string | null;
  startTime: string | null;
};

export type WarcraftLogsCharacterSummary = {
  status: "ready" | "not_configured" | "not_found" | "error";
  profileUrl: string;
  characterId: number | null;
  canonicalId: number | null;
  classId: number | null;
  bestPerformanceAverage: number | null;
  medianPerformanceAverage: number | null;
  allStarsPoints: number | null;
  encounterRankings: WarcraftLogsEncounterRanking[];
  updatedAt: string;
  error?: string | null;
};

let tokenCache: WarcraftLogsTokenCache = null;

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

function integerOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseMaybeJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function firstNumber(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = numberOrNull(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function timestampOrNull(value: unknown) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    const millis = number > 9_999_999_999 ? number : number * 1000;
    return new Date(millis).toISOString();
  }

  const text = cleanText(value, 80);
  if (!text) return null;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function warcraftLogsTimeoutMs() {
  return readIntegerEnv(
    "WARCRAFTLOGS_REQUEST_TIMEOUT_MS",
    12_000,
    2_500,
    45_000,
  );
}

function warcraftLogsRetryCount() {
  return readIntegerEnv("WARCRAFTLOGS_REQUEST_RETRIES", 1, 0, 4);
}

function envWarcraftLogsBaseUrl() {
  const configured = cleanText(process.env.WARCRAFTLOGS_BASE_URL, 240).replace(
    /\/+$/g,
    "",
  );
  return configured || "https://www.warcraftlogs.com";
}

function credentialCacheKey(credentials: WarcraftLogsApiCredentials) {
  return createHash("sha256")
    .update(
      `${credentials.baseUrl}\0${credentials.clientId}\0${credentials.clientSecret}`,
    )
    .digest("hex");
}

function characterUrl(input: {
  region: BattleNetRegion | string;
  realmSlug: string;
  name: string;
  baseUrl?: string;
}) {
  const region = cleanText(input.region, 12).toLowerCase() || "eu";
  const realm = normalizeBattleNetRealmSlug(input.realmSlug);
  const name =
    normalizeBattleNetNameSlug(input.name) || cleanText(input.name, 80);
  const baseUrl =
    cleanText(input.baseUrl, 240).replace(/\/+$/g, "") ||
    envWarcraftLogsBaseUrl();
  return `${baseUrl}/character/${encodeURIComponent(region)}/${encodeURIComponent(realm)}/${encodeURIComponent(name)}`;
}

export function warcraftLogsCharacterUrl(input: {
  region: BattleNetRegion | string;
  realmSlug: string;
  name: string;
}) {
  return characterUrl(input);
}

async function getWarcraftLogsToken(credentials: WarcraftLogsApiCredentials) {
  const now = Date.now();
  const cacheKey = credentialCacheKey(credentials);
  if (
    tokenCache?.token &&
    tokenCache.cacheKey === cacheKey &&
    tokenCache.expiresAt > now + 60_000
  )
    return tokenCache.token;

  if (!credentials.configured) return null;

  const tokenUrl = `${credentials.baseUrl}/oauth/token`;
  const payload = await apiFetchJson<{
    access_token?: string;
    expires_in?: number;
  }>(tokenUrl, {
    method: "POST",
    label: "Warcraft Logs OAuth token",
    timeoutMs: warcraftLogsTimeoutMs(),
    retries: warcraftLogsRetryCount(),
    retryMethods: ["POST"],
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const token = cleanText(payload.access_token, 3000);
  if (!token) return null;
  const expiresIn = Number(payload.expires_in);
  tokenCache = {
    token,
    cacheKey,
    expiresAt:
      now + Math.max(300, Number.isFinite(expiresIn) ? expiresIn : 1800) * 1000,
  };
  return token;
}

function metricFromRecord(record: Record<string, unknown>) {
  const metric = cleanText(
    record.metric || record.type || record.bracket,
    40,
  ).toLowerCase();
  if (metric) return metric;
  if (record.hps !== undefined || record.healing !== undefined) return "hps";
  if (record.dps !== undefined || record.damage !== undefined) return "dps";
  return null;
}

function normalizeEncounterRanking(
  value: unknown,
): WarcraftLogsEncounterRanking | null {
  const record = asRecord(value);
  if (!record) return null;

  const encounterName = cleanText(
    record.encounterName || record.encounter_name || record.name,
    140,
  );
  if (!encounterName) return null;

  return {
    encounterName,
    spec:
      cleanText(record.spec || record.specName || record.spec_name, 80) || null,
    metric: metricFromRecord(record),
    difficulty: integerOrNull(record.difficulty),
    percentile: firstNumber(record, [
      "percentile",
      "historicalPercentile",
      "todayPercentile",
      "rankPercent",
    ]),
    rankPercent: firstNumber(record, ["rankPercent", "percentile"]),
    bestAmount: firstNumber(record, [
      "bestAmount",
      "amount",
      "dps",
      "hps",
      "healing",
      "damage",
    ]),
    totalKills: integerOrNull(record.totalKills || record.kills),
    reportCode:
      cleanText(record.reportCode || record.reportID || record.reportId, 80) ||
      null,
    startTime: timestampOrNull(record.startTime || record.start_time),
  };
}

function collectEncounterRankings(
  value: unknown,
  limit = 12,
): WarcraftLogsEncounterRanking[] {
  const collected: WarcraftLogsEncounterRanking[] = [];
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();

  while (stack.length && collected.length < limit) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const ranking = normalizeEncounterRanking(current);
    if (ranking) {
      collected.push(ranking);
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;
    for (const [key, nested] of Object.entries(record)) {
      if (
        [
          "bestPerformanceAverage",
          "medianPerformanceAverage",
          "allStars",
        ].includes(key)
      )
        continue;
      if (Array.isArray(nested) || asRecord(nested)) stack.push(nested);
    }
  }

  return collected;
}

function normalizeZoneRankings(value: unknown) {
  const root = parseMaybeJsonObject(value);
  const allStars = asRecord(root?.allStars);
  return {
    bestPerformanceAverage: firstNumber(root, [
      "bestPerformanceAverage",
      "bestPerfAvg",
      "bestAverage",
      "best",
    ]),
    medianPerformanceAverage: firstNumber(root, [
      "medianPerformanceAverage",
      "medianPerfAvg",
      "medianAverage",
      "median",
    ]),
    allStarsPoints: firstNumber(allStars, ["points", "rank", "score"]),
    encounterRankings: collectEncounterRankings(
      root?.rankings ||
        root?.encounterRankings ||
        root?.encounters ||
        root ||
        [],
      12,
    ),
  };
}

export async function fetchWarcraftLogsCharacterSummary(input: {
  region: BattleNetRegion | string;
  realmSlug: string;
  name: string;
}): Promise<WarcraftLogsCharacterSummary> {
  const region = cleanText(input.region, 12).toLowerCase() || "eu";
  const realmSlug = normalizeBattleNetRealmSlug(input.realmSlug);
  const name =
    normalizeBattleNetNameSlug(input.name) || cleanText(input.name, 80);
  const credentials = await getWarcraftLogsApiCredentials();
  const profileUrl = characterUrl({
    region,
    realmSlug,
    name,
    baseUrl: credentials.baseUrl,
  });
  const updatedAt = new Date().toISOString();

  if (!realmSlug || !name) {
    return {
      status: "error",
      profileUrl,
      characterId: null,
      canonicalId: null,
      classId: null,
      bestPerformanceAverage: null,
      medianPerformanceAverage: null,
      allStarsPoints: null,
      encounterRankings: [],
      updatedAt,
      error: "Недостатньо даних персонажа для Warcraft Logs.",
    };
  }

  if (!credentials.configured) {
    return {
      status: "not_configured",
      profileUrl,
      characterId: null,
      canonicalId: null,
      classId: null,
      bestPerformanceAverage: null,
      medianPerformanceAverage: null,
      allStarsPoints: null,
      encounterRankings: [],
      updatedAt,
      error: null,
    };
  }

  try {
    const token = await getWarcraftLogsToken(credentials);
    if (!token) throw new Error("Warcraft Logs token is empty");

    const query = `query CharacterZoneRankings($name: String!, $serverSlug: String!, $serverRegion: String!) {\n  characterData {\n    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {\n      id\n      canonicalID\n      name\n      classID\n      zoneRankings\n    }\n  }\n}`;

    const response = await apiFetchJson<WarcraftLogsGraphqlResponse>(
      `${credentials.baseUrl}/api/v2/client`,
      {
        method: "POST",
        label: `Warcraft Logs character ${input.name}`,
        timeoutMs: warcraftLogsTimeoutMs(),
        retries: warcraftLogsRetryCount(),
        retryMethods: ["POST"],
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            name: input.name,
            serverSlug: realmSlug,
            serverRegion: region,
          },
        }),
        cache: "no-store",
      },
    );

    const firstError = response.errors
      ?.map((item) => cleanText(item.message, 240))
      .find(Boolean);
    if (firstError) throw new Error(firstError);

    const character = response.data?.characterData?.character || null;
    if (!character) {
      return {
        status: "not_found",
        profileUrl,
        characterId: null,
        canonicalId: null,
        classId: null,
        bestPerformanceAverage: null,
        medianPerformanceAverage: null,
        allStarsPoints: null,
        encounterRankings: [],
        updatedAt,
        error: null,
      };
    }

    const zone = normalizeZoneRankings(character.zoneRankings);
    return {
      status: "ready",
      profileUrl,
      characterId: integerOrNull(character.id),
      canonicalId: integerOrNull(character.canonicalID),
      classId: integerOrNull(character.classID),
      ...zone,
      updatedAt,
      error: null,
    };
  } catch (error) {
    return {
      status: "error",
      profileUrl,
      characterId: null,
      canonicalId: null,
      classId: null,
      bestPerformanceAverage: null,
      medianPerformanceAverage: null,
      allStarsPoints: null,
      encounterRankings: [],
      updatedAt,
      error:
        error instanceof Error ? error.message : "Warcraft Logs request failed",
    };
  }
}
