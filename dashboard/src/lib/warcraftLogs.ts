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

export type WarcraftLogsBossPull = {
  encounterId: number | null;
  encounterName: string;
  spec: string | null;
  metric: string | null;
  difficulty: number | null;
  percentile: number | null;
  historicalPercentile: number | null;
  todayPercentile: number | null;
  rank: number | null;
  amount: number | null;
  durationMs: number | null;
  itemLevel: number | null;
  totalParses: number | null;
  killedWith: string | null;
  reportCode: string | null;
  reportFightId: number | null;
  reportUrl: string | null;
  startTime: string | null;
  source: "zone" | "encounter";
};

export type WarcraftLogsEncounterRanking = {
  encounterId: number | null;
  encounterName: string;
  spec: string | null;
  metric: string | null;
  difficulty: number | null;
  percentile: number | null;
  medianPercentile: number | null;
  rankPercent: number | null;
  bestAmount: number | null;
  totalKills: number | null;
  fastestKillMs: number | null;
  allStarsPoints: number | null;
  allStarsRank: number | null;
  reportCode: string | null;
  reportUrl: string | null;
  startTime: string | null;
};

export type WarcraftLogsBossSummary = WarcraftLogsEncounterRanking & {
  bestPercentile: number | null;
  todayPercentile: number | null;
  pulls: WarcraftLogsBossPull[];
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
  allStarsRank: number | null;
  encounterRankings: WarcraftLogsEncounterRanking[];
  bossRankings: WarcraftLogsBossSummary[];
  updatedAt: string;
  error?: string | null;
};

const ENCOUNTER_HISTORY_LIMIT = 10;
const ENCOUNTER_HISTORY_BOSS_LIMIT = 12;

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
  if (typeof value === "string" && !value.trim()) return null;
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

function firstValue(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = numberOrNull(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstInteger(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = integerOrNull(record[key]);
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

function reportUrl(baseUrl: string, reportCode: string | null, fightId: number | null) {
  if (!reportCode) return null;
  const suffix = fightId !== null ? `#fight=${encodeURIComponent(String(fightId))}` : "";
  return `${baseUrl}/reports/${encodeURIComponent(reportCode)}${suffix}`;
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
    record.metric || record.type || record.bracket || record.rankingMetric,
    40,
  ).toLowerCase();
  if (metric) return metric;
  if (record.hps !== undefined || record.healing !== undefined) return "hps";
  if (record.dps !== undefined || record.damage !== undefined) return "dps";
  return null;
}

function nestedRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const nested = asRecord(record[key]);
    if (nested) return nested;
  }
  return null;
}

function encounterNameFromRecord(record: Record<string, unknown>, fallback?: string | null) {
  const encounter = nestedRecord(record, ["encounter", "boss", "fight"]);
  return (
    cleanText(
      firstValue(record, ["encounterName", "encounter_name", "bossName", "name"]) ||
        firstValue(encounter, ["name", "encounterName"]),
      140,
    ) ||
    cleanText(fallback, 140) ||
    null
  );
}

function encounterIdFromRecord(record: Record<string, unknown>, fallback?: number | null) {
  const encounter = nestedRecord(record, ["encounter", "boss", "fight"]);
  return (
    firstInteger(encounter, ["id", "encounterID", "encounterId"]) ??
    firstInteger(record, ["encounterID", "encounterId", "bossID", "bossId"]) ??
    fallback ??
    null
  );
}

function difficultyFromRecord(record: Record<string, unknown>) {
  return firstInteger(record, ["difficulty", "difficultyID", "difficultyId"]);
}

function reportInfoFromRecord(record: Record<string, unknown>) {
  const report = nestedRecord(record, ["report", "log"]);
  const reportCode =
    cleanText(
      firstValue(record, ["reportCode", "reportID", "reportId", "code"]) ||
        firstValue(report, ["code", "id", "reportCode"]),
      80,
    ) || null;
  const reportFightId =
    firstInteger(record, ["reportFightID", "reportFightId", "fightID", "fightId", "fight"]);
  const startTime = timestampOrNull(
    firstValue(record, ["startTime", "start_time", "date", "timestamp"]) ||
      firstValue(report, ["startTime", "start_time", "date", "timestamp"]),
  );
  return { reportCode, reportFightId, startTime };
}

function normalizePull(
  value: unknown,
  options: {
    encounterId?: number | null;
    encounterName?: string | null;
    baseUrl: string;
    source: "zone" | "encounter";
  },
): WarcraftLogsBossPull | null {
  const record = asRecord(value);
  if (!record) return null;

  const encounterName = encounterNameFromRecord(record, options.encounterName);
  if (!encounterName) return null;

  const percentile = firstNumber(record, [
    "percentile",
    "rankPercent",
    "bestPercent",
    "bestPercentile",
    "historicalPercentile",
    "todayPercentile",
  ]);
  const amount = firstNumber(record, [
    "amount",
    "bestAmount",
    "perSecondAmount",
    "persecondamount",
    "hps",
    "dps",
    "healing",
    "damage",
  ]);
  const { reportCode, reportFightId, startTime } = reportInfoFromRecord(record);
  const hasPullSignal =
    percentile !== null ||
    amount !== null ||
    reportCode !== null ||
    startTime !== null ||
    firstInteger(record, ["rank", "worldRank", "serverRank", "regionRank"]) !== null;

  if (!hasPullSignal) return null;

  return {
    encounterId: encounterIdFromRecord(record, options.encounterId ?? null),
    encounterName,
    spec:
      cleanText(
        firstValue(record, ["spec", "specName", "spec_name", "bestSpec"]),
        80,
      ) || null,
    metric: metricFromRecord(record),
    difficulty: difficultyFromRecord(record),
    percentile,
    historicalPercentile: firstNumber(record, [
      "historicalPercentile",
      "historical_percentile",
      "histPercent",
      "histPercentile",
    ]),
    todayPercentile: firstNumber(record, [
      "todayPercentile",
      "today_percentile",
      "todayPercent",
    ]),
    rank: firstInteger(record, ["rank", "worldRank", "serverRank", "regionRank"]),
    amount,
    durationMs: firstNumber(record, ["duration", "durationMS", "durationMs", "fightDuration"]),
    itemLevel: firstNumber(record, ["ilvl", "itemLevel", "itemLevelEquipped"]),
    totalParses: firstInteger(record, ["totalParses", "size", "parseCount", "parses"]),
    killedWith:
      cleanText(firstValue(record, ["killedWith", "killDifficulty", "bracket"]), 80) ||
      null,
    reportCode,
    reportFightId,
    reportUrl: reportUrl(options.baseUrl, reportCode, reportFightId),
    startTime,
    source: options.source,
  };
}

function normalizeEncounterRanking(
  value: unknown,
  baseUrl: string,
): WarcraftLogsEncounterRanking | null {
  const record = asRecord(value);
  if (!record) return null;

  const encounterName = encounterNameFromRecord(record);
  if (!encounterName) return null;

  const allStars = asRecord(record.allStars) || asRecord(record.allstars);
  const { reportCode, reportFightId, startTime } = reportInfoFromRecord(record);

  return {
    encounterId: encounterIdFromRecord(record),
    encounterName,
    spec:
      cleanText(
        firstValue(record, ["spec", "specName", "spec_name", "bestSpec"]),
        80,
      ) || null,
    metric: metricFromRecord(record),
    difficulty: difficultyFromRecord(record),
    percentile: firstNumber(record, [
      "percentile",
      "historicalPercentile",
      "todayPercentile",
      "rankPercent",
      "bestPercent",
      "bestPercentile",
    ]),
    medianPercentile: firstNumber(record, [
      "medianPercentile",
      "medianPercent",
      "medianPerformance",
      "median",
    ]),
    rankPercent: firstNumber(record, ["rankPercent", "percentile"]),
    bestAmount: firstNumber(record, [
      "bestAmount",
      "amount",
      "perSecondAmount",
      "persecondamount",
      "dps",
      "hps",
      "healing",
      "damage",
    ]),
    totalKills: firstInteger(record, ["totalKills", "kills", "killCount"]),
    fastestKillMs: firstNumber(record, [
      "fastestKill",
      "fastestKillMs",
      "fastestDuration",
      "fastest",
    ]),
    allStarsPoints: firstNumber(allStars, ["points", "score", "amount"]),
    allStarsRank: firstInteger(allStars, ["rank", "worldRank", "regionRank"]),
    reportCode,
    reportUrl: reportUrl(baseUrl, reportCode, reportFightId),
    startTime,
  };
}

function rankingArrays(root: Record<string, unknown> | null) {
  if (!root) return [] as unknown[];
  const direct = [
    root.rankings,
    root.encounterRankings,
    root.encounters,
    root.bosses,
    root.entries,
    root.rows,
  ].find(Array.isArray);
  if (Array.isArray(direct)) return direct;

  const nestedRankings = asRecord(root.rankings);
  const nestedDirect = [
    nestedRankings?.rankings,
    nestedRankings?.encounters,
    nestedRankings?.entries,
  ].find(Array.isArray);
  return Array.isArray(nestedDirect) ? nestedDirect : [];
}

function collectEncounterRankings(
  value: unknown,
  baseUrl: string,
  limit = 24,
): WarcraftLogsEncounterRanking[] {
  const root = parseMaybeJsonObject(value);
  const direct = rankingArrays(root);
  const source = direct.length ? direct : [root || value];
  const collected: WarcraftLogsEncounterRanking[] = [];
  const stack: unknown[] = [...source];
  const seen = new Set<unknown>();
  const seenKeys = new Set<string>();

  while (stack.length && collected.length < limit) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const ranking = normalizeEncounterRanking(current, baseUrl);
    if (ranking) {
      const key = `${ranking.encounterId ?? ranking.encounterName}:${ranking.metric ?? ""}:${ranking.difficulty ?? ""}`;
      if (!seenKeys.has(key)) {
        collected.push(ranking);
        seenKeys.add(key);
      }
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
          "allstars",
        ].includes(key)
      )
        continue;
      if (Array.isArray(nested) || asRecord(nested)) stack.push(nested);
    }
  }

  return collected;
}

function collectPulls(
  value: unknown,
  options: {
    encounterId?: number | null;
    encounterName?: string | null;
    baseUrl: string;
    source: "zone" | "encounter";
    limit?: number;
  },
) {
  const collected: WarcraftLogsBossPull[] = [];
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  const seenKeys = new Set<string>();
  const limit = options.limit ?? ENCOUNTER_HISTORY_LIMIT;

  while (stack.length && collected.length < limit * 6) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const pull = normalizePull(current, options);
    if (pull) {
      const key = [
        pull.reportCode,
        pull.reportFightId,
        pull.startTime,
        pull.percentile,
        pull.amount,
        pull.encounterId ?? pull.encounterName,
      ].join(":");
      if (!seenKeys.has(key)) {
        collected.push(pull);
        seenKeys.add(key);
      }
    }

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested) || asRecord(nested)) stack.push(nested);
    }
  }

  return collected
    .sort((left, right) => {
      const leftTime = left.startTime ? new Date(left.startTime).getTime() : 0;
      const rightTime = right.startTime ? new Date(right.startTime).getTime() : 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return (right.percentile ?? 0) - (left.percentile ?? 0);
    })
    .slice(0, limit);
}

function mergeBossPulls(
  ranking: WarcraftLogsEncounterRanking,
  encounterData: unknown,
  baseUrl: string,
) {
  const pulls = collectPulls(encounterData, {
    encounterId: ranking.encounterId,
    encounterName: ranking.encounterName,
    baseUrl,
    source: "encounter",
    limit: ENCOUNTER_HISTORY_LIMIT,
  });

  if (pulls.length) return pulls;

  const fallback = normalizePull(ranking, {
    encounterId: ranking.encounterId,
    encounterName: ranking.encounterName,
    baseUrl,
    source: "zone",
  });
  return fallback ? [fallback] : [];
}

function normalizeBossSummaries(
  rankings: WarcraftLogsEncounterRanking[],
  encounterRankingsById: Record<string, unknown>,
  baseUrl: string,
): WarcraftLogsBossSummary[] {
  return rankings.map((ranking) => {
    const key = ranking.encounterId !== null ? String(ranking.encounterId) : "";
    const pulls = mergeBossPulls(ranking, encounterRankingsById[key], baseUrl);
    const sortedByPercent = [...pulls].sort(
      (left, right) => (right.percentile ?? -1) - (left.percentile ?? -1),
    );
    const bestPull = sortedByPercent[0] || null;
    return {
      ...ranking,
      bestPercentile: bestPull?.percentile ?? ranking.percentile,
      todayPercentile:
        bestPull?.todayPercentile ?? ranking.rankPercent ?? ranking.percentile,
      pulls,
    };
  });
}

function normalizeZoneRankings(
  value: unknown,
  encounterRankingsById: Record<string, unknown>,
  baseUrl: string,
) {
  const root = parseMaybeJsonObject(value);
  const allStars = asRecord(root?.allStars) || asRecord(root?.allstars);
  const rankings = collectEncounterRankings(
    root?.rankings ||
      root?.encounterRankings ||
      root?.encounters ||
      root?.bosses ||
      root ||
      [],
    baseUrl,
    24,
  );
  const bossRankings = normalizeBossSummaries(
    rankings,
    encounterRankingsById,
    baseUrl,
  );

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
    allStarsPoints: firstNumber(allStars, ["points", "score", "amount", "rank"]),
    allStarsRank: firstInteger(allStars, ["rank", "worldRank", "regionRank"]),
    encounterRankings: rankings,
    bossRankings,
  };
}

function bossHistoryQuery(rankings: WarcraftLogsEncounterRanking[]) {
  const encounters = rankings
    .filter((ranking) => ranking.encounterId !== null)
    .slice(0, ENCOUNTER_HISTORY_BOSS_LIMIT);

  if (!encounters.length) return null;

  const fields = encounters
    .map(
      (ranking, index) =>
        `    boss${index}: encounterRankings(encounterID: ${ranking.encounterId})`,
    )
    .join("\n");

  return {
    encounters,
    query: `query CharacterEncounterHistory($name: String!, $serverSlug: String!, $serverRegion: String!) {\n  characterData {\n    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {\n${fields}\n    }\n  }\n}`,
  };
}

async function fetchEncounterHistory(input: {
  credentials: WarcraftLogsApiCredentials;
  token: string;
  name: string;
  realmSlug: string;
  region: string;
  rankings: WarcraftLogsEncounterRanking[];
}) {
  const built = bossHistoryQuery(input.rankings);
  if (!built) return {} as Record<string, unknown>;

  try {
    const response = await apiFetchJson<WarcraftLogsGraphqlResponse>(
      `${input.credentials.baseUrl}/api/v2/client`,
      {
        method: "POST",
        label: `Warcraft Logs encounter history ${input.name}`,
        timeoutMs: warcraftLogsTimeoutMs(),
        retries: warcraftLogsRetryCount(),
        retryMethods: ["POST"],
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: built.query,
          variables: {
            name: input.name,
            serverSlug: input.realmSlug,
            serverRegion: input.region,
          },
        }),
        cache: "no-store",
      },
    );

    if (response.errors?.length) return {} as Record<string, unknown>;
    const character = response.data?.characterData?.character || null;
    if (!character) return {} as Record<string, unknown>;

    return built.encounters.reduce<Record<string, unknown>>((acc, ranking, index) => {
      if (ranking.encounterId !== null) {
        acc[String(ranking.encounterId)] = character[`boss${index}`];
      }
      return acc;
    }, {});
  } catch {
    return {} as Record<string, unknown>;
  }
}

function emptySummary(input: {
  status: WarcraftLogsCharacterSummary["status"];
  profileUrl: string;
  updatedAt: string;
  error?: string | null;
}): WarcraftLogsCharacterSummary {
  return {
    status: input.status,
    profileUrl: input.profileUrl,
    characterId: null,
    canonicalId: null,
    classId: null,
    bestPerformanceAverage: null,
    medianPerformanceAverage: null,
    allStarsPoints: null,
    allStarsRank: null,
    encounterRankings: [],
    bossRankings: [],
    updatedAt: input.updatedAt,
    error: input.error ?? null,
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
    return emptySummary({
      status: "error",
      profileUrl,
      updatedAt,
      error: "Недостатньо даних персонажа для Warcraft Logs.",
    });
  }

  if (!credentials.configured) {
    return emptySummary({
      status: "not_configured",
      profileUrl,
      updatedAt,
    });
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
      return emptySummary({ status: "not_found", profileUrl, updatedAt });
    }

    const initialZone = normalizeZoneRankings(
      character.zoneRankings,
      {},
      credentials.baseUrl,
    );
    const encounterHistory = await fetchEncounterHistory({
      credentials,
      token,
      name: input.name,
      realmSlug,
      region,
      rankings: initialZone.encounterRankings,
    });
    const zone = normalizeZoneRankings(
      character.zoneRankings,
      encounterHistory,
      credentials.baseUrl,
    );

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
    return emptySummary({
      status: "error",
      profileUrl,
      updatedAt,
      error:
        error instanceof Error ? error.message : "Warcraft Logs request failed",
    });
  }
}
