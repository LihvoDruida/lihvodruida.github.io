import { createHash } from "crypto";

import { apiFetchJson } from "@/lib/apiHttp";
import { mapConcurrentSettled, readIntegerEnv } from "@/lib/concurrency";
import { recordSystemAudit } from "@/lib/accessGroups";
import { logDashboardEvent } from "@/lib/security";
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

export type WarcraftLogsRoleKey = "overall" | "healer" | "dps" | "tank";
export type WarcraftLogsMetricKey = "points" | "hps" | "dps";

export type WarcraftLogsRecentStats = {
  pullCount: number;
  maxAmount: number | null;
  averageAmount: number | null;
  maxPercentile: number | null;
  averagePercentile: number | null;
};

export type WarcraftLogsBossPull = {
  encounterId: number | null;
  encounterName: string;
  role: WarcraftLogsRoleKey | null;
  spec: string | null;
  metric: WarcraftLogsMetricKey | string | null;
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
  source: "zone" | "encounter" | "report";
};

export type WarcraftLogsEncounterRanking = {
  encounterId: number | null;
  encounterName: string;
  role: WarcraftLogsRoleKey | null;
  spec: string | null;
  metric: WarcraftLogsMetricKey | string | null;
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
  recentStats: WarcraftLogsRecentStats;
  pulls: WarcraftLogsBossPull[];
};

export type WarcraftLogsMetricSummary = {
  key: string;
  role: WarcraftLogsRoleKey;
  roleLabel: string;
  metric: WarcraftLogsMetricKey;
  metricLabel: string;
  title: string;
  description: string;
  sourceLabel: string;
  bestPerformanceAverage: number | null;
  medianPerformanceAverage: number | null;
  allStarsPoints: number | null;
  allStarsRank: number | null;
  recentStats: WarcraftLogsRecentStats;
  encounterRankings: WarcraftLogsEncounterRanking[];
  bossRankings: WarcraftLogsBossSummary[];
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
  metricSummaries: WarcraftLogsMetricSummary[];
  updatedAt: string;
  error?: string | null;
};

type WarcraftLogsSliceConfig = {
  key: string;
  zoneAlias: string;
  fallbackZoneAlias?: string;
  role: WarcraftLogsRoleKey;
  roleLabel: string;
  metric: WarcraftLogsMetricKey;
  metricLabel: string;
  title: string;
  description: string;
  sourceLabel: string;
  graphqlMetric?: "hps" | "dps";
  graphqlRole?: "Healer" | "DPS" | "Tank";
};

const ENCOUNTER_HISTORY_LIMIT = 10;
const ENCOUNTER_HISTORY_BOSS_LIMIT = 10;
const RECENT_REPORT_FIGHT_TABLE_LIMIT = 16;

const WCL_SLICES: WarcraftLogsSliceConfig[] = [
  {
    key: "healer-hps",
    zoneAlias: "healerHps",
    fallbackZoneAlias: "hpsAnyRole",
    role: "healer",
    roleLabel: "Хіл",
    metric: "hps",
    metricLabel: "HPS",
    title: "Хіл HPS",
    description: "Healing ranking / HPS по healer-ролі, з fallback на HPS без role-фільтра.",
    sourceLabel: "metric=hps · role=Healer",
    graphqlMetric: "hps",
    graphqlRole: "Healer",
  },
  {
    key: "dps-dps",
    zoneAlias: "dpsDamage",
    fallbackZoneAlias: "dpsAnyRole",
    role: "dps",
    roleLabel: "ДД",
    metric: "dps",
    metricLabel: "DPS",
    title: "ДД DPS",
    description: "Damage ranking / DPS по dps-ролі, з fallback на DPS без role-фільтра.",
    sourceLabel: "metric=dps · role=DPS",
    graphqlMetric: "dps",
    graphqlRole: "DPS",
  },
  {
    key: "tank-dps",
    zoneAlias: "tankDamage",
    fallbackZoneAlias: "tankDamageAnyRoleFallback",
    role: "tank",
    roleLabel: "Танк",
    metric: "dps",
    metricLabel: "DPS",
    title: "Танк DPS",
    description: "Damage ranking для tank-ролі.",
    sourceLabel: "metric=dps · role=Tank",
    graphqlMetric: "dps",
    graphqlRole: "Tank",
  },
  {
    key: "tank-hps",
    zoneAlias: "tankHealing",
    role: "tank",
    roleLabel: "Танк",
    metric: "hps",
    metricLabel: "HPS",
    title: "Танк HPS",
    description: "Healing/self-sustain ranking для tank-ролі, якщо WCL має такі дані.",
    sourceLabel: "metric=hps · role=Tank",
    graphqlMetric: "hps",
    graphqlRole: "Tank",
  },
  {
    key: "overall",
    zoneAlias: "overallRankings",
    role: "overall",
    roleLabel: "Загалом",
    metric: "points",
    metricLabel: "Parse",
    title: "Загальний parse",
    description: "Стандартний Warcraft Logs ranking без додаткового role/metric фільтра.",
    sourceLabel: "default zoneRankings",
  },
];

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

function warcraftLogsRecentReportLimit() {
  return readIntegerEnv("WARCRAFTLOGS_RECENT_REPORT_LIMIT", 8, 1, 20);
}

function warcraftLogsDebugAuditEnabled() {
  return process.env.WARCRAFTLOGS_DEBUG_AUDIT_LOGS !== "0";
}

function compactForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length > 900 ? `${value.slice(0, 900)}…` : value;
  }
  if (depth >= 4) {
    if (Array.isArray(value)) return `[array:${value.length}]`;
    if (typeof value === "object") return "[object]";
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => compactForLog(item, depth + 1));
  }
  const record = asRecord(value);
  if (!record) return String(value);
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record).slice(0, 40)) {
    if (/token|secret|authorization|clientSecret|access_token/i.test(key)) {
      result[key] = "[redacted]";
    } else {
      result[key] = compactForLog(nested, depth + 1);
    }
  }
  const extra = Object.keys(record).length - Object.keys(result).length;
  if (extra > 0) result.__truncatedKeys = extra;
  return result;
}

function warcraftLogsDebugAudit(action: string, details: Record<string, unknown>) {
  if (!warcraftLogsDebugAuditEnabled()) return;

  const compact = compactForLog(details) as Record<string, unknown>;
  const payload = {
    ...compact,
    status: details.status || "info",
    temporaryDebug: true,
    summary: cleanText(details.summary || action, 220),
  };

  logDashboardEvent("info", action, undefined, payload);
  void recordSystemAudit(action, payload).catch((error) => {
    logDashboardEvent("warn", "warcraft_logs.debug_audit_failed", undefined, {
      action,
      message: error instanceof Error ? error.message : String(error || "unknown"),
    });
  });
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

function metricFromRecord(record: Record<string, unknown>, fallback?: WarcraftLogsMetricKey) {
  const metric = cleanText(
    record.metric || record.type || record.bracket || record.rankingMetric,
    40,
  ).toLowerCase();
  if (metric) return metric;
  if (record.hps !== undefined || record.healing !== undefined) return "hps";
  if (record.dps !== undefined || record.damage !== undefined) return "dps";
  return fallback ?? null;
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

function durationMsFromRecord(record: Record<string, unknown>) {
  const direct = firstNumber(record, [
    "durationMs",
    "durationMS",
    "durationMillis",
    "fightDurationMs",
  ]);
  if (direct !== null) return direct;

  const duration = firstNumber(record, ["duration", "fightDuration", "length"]);
  if (duration !== null) return duration > 10_000 ? duration : duration * 1000;

  const start = firstNumber(record, ["startTime", "start_time", "start"]);
  const end = firstNumber(record, ["endTime", "end_time", "end"]);
  if (start !== null && end !== null && end > start) return end - start;

  return null;
}

function normalizeNameKey(value: unknown) {
  return cleanText(value, 180)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яіїєґё]+/gi, "");
}

function isRaidBossEncounterId(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isEligibleRaidBossPull(pull: WarcraftLogsBossPull, encounterId?: number | null) {
  const id = pull.encounterId ?? encounterId ?? null;
  return isRaidBossEncounterId(id);
}

function preferNumber(primary: number | null, fallback: number | null) {
  return typeof primary === "number" && Number.isFinite(primary) ? primary : fallback;
}

function preferText(primary: string | null, fallback: string | null) {
  return primary && primary.trim() ? primary : fallback;
}

function mergePullData(left: WarcraftLogsBossPull, right: WarcraftLogsBossPull): WarcraftLogsBossPull {
  return {
    ...left,
    encounterId: preferNumber(left.encounterId, right.encounterId),
    encounterName: preferText(left.encounterName, right.encounterName) || left.encounterName,
    role: left.role || right.role,
    spec: preferText(left.spec, right.spec),
    metric: left.metric || right.metric,
    difficulty: preferNumber(left.difficulty, right.difficulty),
    percentile: preferNumber(left.percentile, right.percentile),
    historicalPercentile: preferNumber(left.historicalPercentile, right.historicalPercentile),
    todayPercentile: preferNumber(left.todayPercentile, right.todayPercentile),
    rank: preferNumber(left.rank, right.rank),
    amount: preferNumber(left.amount, right.amount),
    durationMs: preferNumber(left.durationMs, right.durationMs),
    itemLevel: preferNumber(left.itemLevel, right.itemLevel),
    totalParses: preferNumber(left.totalParses, right.totalParses),
    killedWith: preferText(left.killedWith, right.killedWith),
    reportCode: preferText(left.reportCode, right.reportCode),
    reportFightId: preferNumber(left.reportFightId, right.reportFightId),
    reportUrl: preferText(left.reportUrl, right.reportUrl),
    startTime: preferText(left.startTime, right.startTime),
    source: left.source === "report" ? left.source : right.source,
  };
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

function amountKeysForMetric(metric: WarcraftLogsMetricKey) {
  if (metric === "hps") {
    return [
      "hps",
      "HPS",
      "healingPerSecond",
      "healing_per_second",
      "healing",
      "amount",
      "bestAmount",
      "perSecondAmount",
      "persecondamount",
    ];
  }
  if (metric === "dps") {
    return [
      "dps",
      "DPS",
      "damagePerSecond",
      "damage_per_second",
      "damage",
      "amount",
      "bestAmount",
      "perSecondAmount",
      "persecondamount",
    ];
  }
  return [
    "amount",
    "bestAmount",
    "points",
    "score",
    "perSecondAmount",
    "persecondamount",
    "dps",
    "hps",
    "healing",
    "damage",
  ];
}

function normalizePull(
  value: unknown,
  options: {
    encounterId?: number | null;
    encounterName?: string | null;
    role: WarcraftLogsRoleKey;
    metric: WarcraftLogsMetricKey;
    baseUrl: string;
    source: "zone" | "encounter" | "report";
  },
): WarcraftLogsBossPull | null {
  const record = asRecord(value);
  if (!record) return null;

  const encounterName = encounterNameFromRecord(record, options.encounterName);
  if (!encounterName) return null;

  const encounterId = encounterIdFromRecord(record, options.encounterId ?? null);
  if (!isRaidBossEncounterId(encounterId)) return null;

  const percentile = firstNumber(record, [
    "percentile",
    "rankPercent",
    "bestPercent",
    "bestPercentile",
    "historicalPercentile",
    "todayPercentile",
  ]);
  const amount = firstNumber(record, amountKeysForMetric(options.metric));
  const durationMs = durationMsFromRecord(record);
  const { reportCode, reportFightId, startTime } = reportInfoFromRecord(record);
  const hasPullSignal =
    percentile !== null ||
    amount !== null ||
    reportCode !== null ||
    startTime !== null ||
    firstInteger(record, ["rank", "worldRank", "serverRank", "regionRank"]) !== null;

  if (!hasPullSignal) return null;

  return {
    encounterId,
    encounterName,
    role: options.role,
    spec:
      cleanText(
        firstValue(record, ["spec", "specName", "spec_name", "bestSpec"]),
        80,
      ) || null,
    metric: metricFromRecord(record, options.metric),
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
    durationMs,
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
  options: Pick<WarcraftLogsSliceConfig, "role" | "metric">,
): WarcraftLogsEncounterRanking | null {
  const record = asRecord(value);
  if (!record) return null;

  const encounterName = encounterNameFromRecord(record);
  if (!encounterName) return null;

  const encounterId = encounterIdFromRecord(record);
  if (!isRaidBossEncounterId(encounterId)) return null;

  const allStars = asRecord(record.allStars) || asRecord(record.allstars);
  const { reportCode, reportFightId, startTime } = reportInfoFromRecord(record);

  return {
    encounterId,
    encounterName,
    role: options.role,
    spec:
      cleanText(
        firstValue(record, ["spec", "specName", "spec_name", "bestSpec"]),
        80,
      ) || null,
    metric: metricFromRecord(record, options.metric),
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
    bestAmount: firstNumber(record, amountKeysForMetric(options.metric)),
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
  options: Pick<WarcraftLogsSliceConfig, "role" | "metric"> & { limit?: number },
): WarcraftLogsEncounterRanking[] {
  const root = parseMaybeJsonObject(value);
  const direct = rankingArrays(root);
  const source = direct.length ? direct : [root || value];
  const collected: WarcraftLogsEncounterRanking[] = [];
  const stack: unknown[] = [...source];
  const seen = new Set<unknown>();
  const seenKeys = new Set<string>();
  const limit = options.limit ?? 32;

  while (stack.length && collected.length < limit) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const ranking = normalizeEncounterRanking(current, baseUrl, options);
    if (ranking) {
      const key = `${ranking.encounterId ?? ranking.encounterName}:${ranking.metric ?? ""}:${ranking.difficulty ?? ""}:${ranking.role ?? ""}`;
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

function pullIdentity(pull: WarcraftLogsBossPull) {
  if (pull.reportCode && pull.reportFightId !== null) {
    return `${pull.reportCode}:${pull.reportFightId}:${pull.encounterId ?? pull.encounterName}:${pull.metric ?? ""}`;
  }

  return [
    pull.reportCode,
    pull.startTime,
    pull.encounterId ?? pull.encounterName,
    pull.durationMs,
    pull.role,
    pull.metric,
  ].join(":");
}

function sortPullsByDate(pulls: WarcraftLogsBossPull[]) {
  return [...pulls].sort((left, right) => {
    const leftTime = left.startTime ? new Date(left.startTime).getTime() : 0;
    const rightTime = right.startTime ? new Date(right.startTime).getTime() : 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return (right.percentile ?? 0) - (left.percentile ?? 0);
  });
}

function mergePullList(pulls: WarcraftLogsBossPull[], limit = ENCOUNTER_HISTORY_LIMIT) {
  const merged = new Map<string, WarcraftLogsBossPull>();
  for (const pull of pulls) {
    if (!isEligibleRaidBossPull(pull)) continue;
    const key = pullIdentity(pull);
    const existing = merged.get(key);
    merged.set(key, existing ? mergePullData(existing, pull) : pull);
  }
  return sortPullsByDate([...merged.values()]).slice(0, limit);
}

function collectPulls(
  value: unknown,
  options: {
    encounterId?: number | null;
    encounterName?: string | null;
    role: WarcraftLogsRoleKey;
    metric: WarcraftLogsMetricKey;
    baseUrl: string;
    source: "zone" | "encounter" | "report";
    limit?: number;
  },
) {
  const collected: WarcraftLogsBossPull[] = [];
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  const limit = options.limit ?? ENCOUNTER_HISTORY_LIMIT;

  while (stack.length && collected.length < limit * 16) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const pull = normalizePull(current, options);
    if (pull && isEligibleRaidBossPull(pull, options.encounterId ?? null)) {
      collected.push(pull);
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

  return mergePullList(collected, limit);
}

function recentStats(pulls: WarcraftLogsBossPull[]): WarcraftLogsRecentStats {
  const recent = [...pulls]
    .sort((left, right) => {
      const leftTime = left.startTime ? new Date(left.startTime).getTime() : 0;
      const rightTime = right.startTime ? new Date(right.startTime).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, ENCOUNTER_HISTORY_LIMIT);
  const amounts = recent
    .map((pull) => pull.amount)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const percentiles = recent
    .map((pull) => pull.percentile)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    pullCount: recent.length,
    maxAmount: amounts.length ? Math.max(...amounts) : null,
    averageAmount: amounts.length ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : null,
    maxPercentile: percentiles.length ? Math.max(...percentiles) : null,
    averagePercentile: percentiles.length ? percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length : null,
  };
}

type WarcraftLogsReportFightSeed = {
  reportCode: string;
  reportStartMs: number;
  fightId: number;
  encounterId: number;
  encounterName: string;
  difficulty: number | null;
  durationMs: number;
  startOffsetMs: number;
  endOffsetMs: number;
  startTime: string | null;
  killedWith: string | null;
};

type WarcraftLogsReportPullsBySlice = Record<string, Record<string, WarcraftLogsBossPull[]>>;

function emptyReportPullsBySlice(): WarcraftLogsReportPullsBySlice {
  return {};
}

function knownRaidBossIds(metricSummaries: WarcraftLogsMetricSummary[]) {
  const ids = new Set<number>();
  for (const summary of metricSummaries) {
    for (const ranking of summary.encounterRankings) {
      const encounterId = ranking.encounterId;
      if (isRaidBossEncounterId(encounterId)) ids.add(encounterId);
    }
  }
  return ids;
}

function reportPaginationData(character: Record<string, unknown> | null) {
  const recentReports = asRecord(character?.recentReports);
  const data = recentReports?.data;
  return Array.isArray(data) ? data : [];
}

function actorMatchesRealm(actor: Record<string, unknown>, realmSlug: string) {
  const server = normalizeBattleNetRealmSlug(cleanText(firstValue(actor, ["server", "serverSlug", "realm", "realmSlug"]), 120));
  return !server || !realmSlug || server === realmSlug;
}

function findReportActorId(report: Record<string, unknown>, characterName: string, realmSlug: string) {
  const masterData = asRecord(report.masterData);
  const actors = Array.isArray(masterData?.actors) ? masterData.actors : [];
  const characterKey = normalizeNameKey(characterName);

  let fallback: number | null = null;
  for (const item of actors) {
    const actor = asRecord(item);
    if (!actor) continue;
    if (normalizeNameKey(firstValue(actor, ["name", "characterName"])) !== characterKey) continue;

    const id = firstInteger(actor, ["id", "actorID", "sourceID"]);
    if (id === null) continue;
    if (actorMatchesRealm(actor, realmSlug)) return id;
    fallback = fallback ?? id;
  }

  return fallback;
}

function normalizeReportFightSeed(
  report: Record<string, unknown>,
  fight: unknown,
  knownBosses: Set<number>,
): WarcraftLogsReportFightSeed | null {
  const record = asRecord(fight);
  if (!record) return null;

  const reportCode = cleanText(report.code, 80);
  if (!reportCode) return null;

  const reportStartMs = firstNumber(report, ["startTime", "start_time", "date", "timestamp"]);
  if (reportStartMs === null) return null;

  const encounterId = firstInteger(record, ["encounterID", "encounterId", "originalEncounterID", "originalEncounterId"]);
  if (!isRaidBossEncounterId(encounterId)) return null;
  if (!knownBosses.has(encounterId)) return null;

  const durationMs = durationMsFromRecord(record);
  if (durationMs === null || durationMs <= 0) return null;

  const fightId = firstInteger(record, ["id", "fightID", "fightId"]);
  if (fightId === null) return null;

  const startOffsetMs = firstNumber(record, ["startTime", "start_time", "start"]);
  const endOffsetMs = firstNumber(record, ["endTime", "end_time", "end"]);
  if (startOffsetMs === null || endOffsetMs === null || endOffsetMs <= startOffsetMs) return null;

  const encounterName = encounterNameFromRecord(record);
  if (!encounterName) return null;

  const kill = Boolean(record.kill || record.isKill || record.killed);

  return {
    reportCode,
    reportStartMs,
    fightId,
    encounterId,
    encounterName,
    difficulty: difficultyFromRecord(record),
    durationMs,
    startOffsetMs,
    endOffsetMs,
    startTime: new Date(reportStartMs + startOffsetMs).toISOString(),
    killedWith: kill ? "Kill" : "Wipe",
  };
}

function reportFightSeeds(report: Record<string, unknown>, knownBosses: Set<number>) {
  const fights = Array.isArray(report.fights) ? report.fights : [];
  return fights
    .map((fight) => normalizeReportFightSeed(report, fight, knownBosses))
    .filter((fight): fight is WarcraftLogsReportFightSeed => Boolean(fight))
    .sort((left, right) => right.reportStartMs + right.startOffsetMs - (left.reportStartMs + left.startOffsetMs))
    .slice(0, RECENT_REPORT_FIGHT_TABLE_LIMIT);
}

function collectTableRows(value: unknown) {
  const root = parseMaybeJsonObject(value) || value;
  const rows: Record<string, unknown>[] = [];
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();

  while (stack.length && rows.length < 200) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    const looksLikeRow =
      firstNumber(record, [
        "amount",
        "total",
        "totalDamage",
        "totalHealing",
        "damage",
        "healing",
        "dps",
        "DPS",
        "hps",
        "HPS",
        "perSecondAmount",
      ]) !== null ||
      firstValue(record, ["sourceID", "sourceId", "name", "guid"]) !== undefined;

    if (looksLikeRow) rows.push(record);

    for (const nested of Object.values(record)) {
      if (Array.isArray(nested) || asRecord(nested)) stack.push(nested);
    }
  }

  return rows;
}

function amountFromReportTable(value: unknown, metric: WarcraftLogsMetricKey, durationMs: number) {
  const rows = collectTableRows(value);
  const metricKeys =
    metric === "hps"
      ? ["hps", "HPS", "healingPerSecond", "healing_per_second", "perSecondAmount", "persecondamount"]
      : ["dps", "DPS", "damagePerSecond", "damage_per_second", "perSecondAmount", "persecondamount"];
  const totalKeys =
    metric === "hps"
      ? ["totalHealing", "healingTotal", "healing", "total", "amount"]
      : ["totalDamage", "damageTotal", "damage", "total", "amount"];

  for (const row of rows) {
    const direct = firstNumber(row, metricKeys);
    if (direct !== null) return direct;

    const total = firstNumber(row, totalKeys);
    if (total === null) continue;

    const activeTime = firstNumber(row, [
      "activeTime",
      "activeTimeMs",
      "activeTimeMS",
      "totalTime",
      "time",
      "duration",
    ]);
    const divisorMs = activeTime !== null && activeTime > 0 ? (activeTime > 10_000 ? activeTime : activeTime * 1000) : durationMs;
    if (divisorMs > 0) return total / (divisorMs / 1000);
  }

  return null;
}

function reportPullFromFight(
  fight: WarcraftLogsReportFightSeed,
  config: WarcraftLogsSliceConfig,
  amount: number | null,
  baseUrl: string,
): WarcraftLogsBossPull {
  return {
    encounterId: fight.encounterId,
    encounterName: fight.encounterName,
    role: config.role,
    spec: null,
    metric: config.metric,
    difficulty: fight.difficulty,
    percentile: null,
    historicalPercentile: null,
    todayPercentile: null,
    rank: null,
    amount,
    durationMs: fight.durationMs,
    itemLevel: null,
    totalParses: null,
    killedWith: fight.killedWith,
    reportCode: fight.reportCode,
    reportFightId: fight.fightId,
    reportUrl: reportUrl(baseUrl, fight.reportCode, fight.fightId),
    startTime: fight.startTime,
    source: "report",
  };
}

function addReportPull(
  target: WarcraftLogsReportPullsBySlice,
  config: WarcraftLogsSliceConfig,
  pull: WarcraftLogsBossPull,
) {
  if (!isEligibleRaidBossPull(pull)) return;
  const encounterKey = String(pull.encounterId);
  target[config.key] ||= {};
  target[config.key][encounterKey] ||= [];
  target[config.key][encounterKey].push(pull);
}

function recentReportsQuery(limit: number) {
  return `query CharacterRecentRaidReports($name: String!, $serverSlug: String!, $serverRegion: String!) {\n  characterData {\n    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {\n      recentReports(limit: ${limit}) {\n        data {\n          code\n          title\n          startTime\n          endTime\n          zone { id name }\n          fights(killType: Encounters) {\n            id\n            encounterID\n            originalEncounterID\n            name\n            kill\n            startTime\n            endTime\n            difficulty\n            size\n          }\n          masterData(translate: true) {\n            actors(type: \"Player\") {\n              id\n              gameID\n              server\n              subType\n              name\n            }\n          }\n        }\n      }\n    }\n  }\n}`;
}

function reportFightTablesQuery(fights: WarcraftLogsReportFightSeed[]) {
  const fields = fights
    .map((fight, index) => {
      const start = Math.max(0, Math.floor(fight.startOffsetMs));
      const end = Math.max(start + 1, Math.floor(fight.endOffsetMs));
      return [
        `    d${index}: table(dataType: DamageDone, startTime: ${start}, endTime: ${end}, viewBy: Source, sourceID: $sourceID)`,
        `    h${index}: table(dataType: Healing, startTime: ${start}, endTime: ${end}, viewBy: Source, sourceID: $sourceID)`,
      ].join("\n");
    })
    .join("\n");

  return `query ReportCharacterBossTables($code: String!, $sourceID: Int!) {\n  reportData {\n    report(code: $code) {\n      code\n${fields}\n    }\n  }\n}`;
}

async function fetchRecentReportRecords(input: {
  credentials: WarcraftLogsApiCredentials;
  token: string;
  name: string;
  realmSlug: string;
  region: string;
}) {
  const response = await apiFetchJson<WarcraftLogsGraphqlResponse>(
    `${input.credentials.baseUrl}/api/v2/client`,
    {
      method: "POST",
      label: `Warcraft Logs recent reports ${input.name}`,
      timeoutMs: warcraftLogsTimeoutMs(),
      retries: warcraftLogsRetryCount(),
      retryMethods: ["POST"],
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: recentReportsQuery(warcraftLogsRecentReportLimit()),
        variables: {
          name: input.name,
          serverSlug: input.realmSlug,
          serverRegion: input.region,
        },
      }),
      cache: "no-store",
    },
  );

  const character = response.data?.characterData?.character || null;
  const reports = response.errors?.length
    ? []
    : reportPaginationData(character)
        .map((report) => asRecord(report))
        .filter((report): report is Record<string, unknown> => Boolean(report));

  warcraftLogsDebugAudit("warcraft_logs.api.recent_reports_response", {
    summary: `WCL recent reports: ${input.name} — ${reports.length} reports`,
    character: input.name,
    realmSlug: input.realmSlug,
    region: input.region,
    reportCount: reports.length,
    errors: response.errors?.map((item) => cleanText(item.message, 240)).filter(Boolean) || [],
    responsePreview: compactForLog(response),
  });

  return reports;
}

async function fetchReportFightTables(input: {
  credentials: WarcraftLogsApiCredentials;
  token: string;
  reportCode: string;
  sourceId: number;
  fights: WarcraftLogsReportFightSeed[];
}) {
  if (!input.fights.length) return null;

  const response = await apiFetchJson<{
    data?: { reportData?: { report?: Record<string, unknown> | null } | null } | null;
    errors?: Array<{ message?: string }>;
  }>(`${input.credentials.baseUrl}/api/v2/client`, {
    method: "POST",
    label: `Warcraft Logs report boss tables ${input.reportCode}`,
    timeoutMs: warcraftLogsTimeoutMs(),
    retries: warcraftLogsRetryCount(),
    retryMethods: ["POST"],
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: reportFightTablesQuery(input.fights),
      variables: {
        code: input.reportCode,
        sourceID: input.sourceId,
      },
    }),
    cache: "no-store",
  });

  const report = response.errors?.length ? null : response.data?.reportData?.report || null;

  warcraftLogsDebugAudit("warcraft_logs.api.report_tables_response", {
    summary: `WCL report tables: ${input.reportCode} — ${input.fights.length} fights`,
    reportCode: input.reportCode,
    sourceId: input.sourceId,
    fightCount: input.fights.length,
    tableKeys: report ? Object.keys(report).filter((key) => /^(d|h)\d+$/.test(key)).slice(0, 40) : [],
    errors: response.errors?.map((item) => cleanText(item.message, 240)).filter(Boolean) || [],
    responsePreview: compactForLog(response),
  });

  return report;
}

async function fetchRecentRaidBossPulls(input: {
  credentials: WarcraftLogsApiCredentials;
  token: string;
  name: string;
  realmSlug: string;
  region: string;
  metricSummaries: WarcraftLogsMetricSummary[];
}) {
  const knownBosses = knownRaidBossIds(input.metricSummaries);
  if (!knownBosses.size) return emptyReportPullsBySlice();

  try {
    const reports = await fetchRecentReportRecords(input);
    const startedAt = Date.now();

    const mapped = await mapConcurrentSettled(
      reports,
      async (report) => {
        const sourceId = findReportActorId(report, input.name, input.realmSlug);
        if (sourceId === null) {
          return {
            reportCode: cleanText(report.code, 80) || null,
            skipped: "actor_not_found",
            pulls: [] as Array<{ config: WarcraftLogsSliceConfig; pull: WarcraftLogsBossPull }>,
          };
        }

        const fights = reportFightSeeds(report, knownBosses);
        if (!fights.length) {
          return {
            reportCode: cleanText(report.code, 80) || null,
            skipped: "no_known_raid_boss_fights",
            pulls: [] as Array<{ config: WarcraftLogsSliceConfig; pull: WarcraftLogsBossPull }>,
          };
        }

        const reportCode = cleanText(report.code, 80);
        if (!reportCode) {
          return {
            reportCode: null,
            skipped: "missing_report_code",
            pulls: [] as Array<{ config: WarcraftLogsSliceConfig; pull: WarcraftLogsBossPull }>,
          };
        }

        const tables = await fetchReportFightTables({
          credentials: input.credentials,
          token: input.token,
          reportCode,
          sourceId,
          fights,
        });
        if (!tables) {
          return {
            reportCode,
            skipped: "table_response_empty",
            pulls: [] as Array<{ config: WarcraftLogsSliceConfig; pull: WarcraftLogsBossPull }>,
          };
        }

        const pulls: Array<{ config: WarcraftLogsSliceConfig; pull: WarcraftLogsBossPull }> = [];
        for (const [index, fight] of fights.entries()) {
          const damageAmount = amountFromReportTable(tables[`d${index}`], "dps", fight.durationMs);
          const healingAmount = amountFromReportTable(tables[`h${index}`], "hps", fight.durationMs);

          for (const config of WCL_SLICES) {
            if (config.metric === "points") continue;
            const amount = config.metric === "hps" ? healingAmount : damageAmount;
            pulls.push({
              config,
              pull: reportPullFromFight(fight, config, amount, input.credentials.baseUrl),
            });
          }
        }

        return {
          reportCode,
          skipped: null,
          fightCount: fights.length,
          pulls,
        };
      },
      {
        profile: "external-api",
        envKey: "WARCRAFTLOGS_REPORT_TABLE_CONCURRENCY",
        maxEnvKey: "WARCRAFTLOGS_MAX_CONCURRENCY",
        max: 4,
        failFast: false,
      },
    );

    const result = emptyReportPullsBySlice();
    let producedPulls = 0;
    for (const item of mapped.results) {
      if (!item.ok) continue;
      for (const entry of item.value.pulls) {
        addReportPull(result, entry.config, entry.pull);
        producedPulls += 1;
      }
    }

    warcraftLogsDebugAudit("warcraft_logs.parser.recent_raid_boss_pulls", {
      summary: `WCL parser: ${input.name} — ${producedPulls} report pull rows`,
      character: input.name,
      realmSlug: input.realmSlug,
      region: input.region,
      reportsChecked: reports.length,
      knownBosses: knownBosses.size,
      producedPullRows: producedPulls,
      durationMs: Date.now() - startedAt,
      concurrency: mapped.meta.concurrency,
      failedReports: mapped.meta.failed,
      reportResults: mapped.results.map((item) => item.ok
        ? {
            ok: true,
            reportCode: item.value.reportCode,
            skipped: item.value.skipped,
            fightCount: item.value.fightCount || 0,
            producedPulls: item.value.pulls.length,
          }
        : {
            ok: false,
            reportCode: cleanText(item.item.code, 80) || null,
            error: item.error instanceof Error ? item.error.message : String(item.error || "unknown"),
          }),
    });

    return result;
  } catch (error) {
    warcraftLogsDebugAudit("warcraft_logs.parser.recent_raid_boss_pulls_failed", {
      status: "warning",
      summary: `WCL parser failed: ${input.name}`,
      character: input.name,
      realmSlug: input.realmSlug,
      region: input.region,
      error: error instanceof Error ? error.message : String(error || "unknown"),
    });
    return emptyReportPullsBySlice();
  }
}

function mergeBossPulls(
  ranking: WarcraftLogsEncounterRanking,
  encounterData: unknown,
  reportPulls: WarcraftLogsBossPull[],
  config: WarcraftLogsSliceConfig,
  baseUrl: string,
) {
  const encounterPulls = collectPulls(encounterData, {
    encounterId: ranking.encounterId,
    encounterName: ranking.encounterName,
    role: config.role,
    metric: config.metric,
    baseUrl,
    source: "encounter",
    limit: ENCOUNTER_HISTORY_LIMIT,
  });

  return mergePullList([...reportPulls, ...encounterPulls], ENCOUNTER_HISTORY_LIMIT);
}

function normalizeBossSummaries(
  rankings: WarcraftLogsEncounterRanking[],
  encounterRankingsById: Record<string, unknown>,
  reportPullsById: Record<string, WarcraftLogsBossPull[]>,
  config: WarcraftLogsSliceConfig,
  baseUrl: string,
): WarcraftLogsBossSummary[] {
  return rankings.map((ranking) => {
    const key = ranking.encounterId !== null ? String(ranking.encounterId) : "";
    const pulls = mergeBossPulls(
      ranking,
      encounterRankingsById[key],
      reportPullsById[key] || [],
      config,
      baseUrl,
    );
    const sortedByPercent = [...pulls].sort(
      (left, right) => (right.percentile ?? -1) - (left.percentile ?? -1),
    );
    const bestPull = sortedByPercent[0] || null;
    return {
      ...ranking,
      bestPercentile: bestPull?.percentile ?? ranking.percentile,
      todayPercentile:
        bestPull?.todayPercentile ?? ranking.rankPercent ?? ranking.percentile,
      recentStats: recentStats(pulls),
      pulls,
    };
  });
}

function hasZoneRankingData(value: unknown, config: WarcraftLogsSliceConfig, baseUrl: string) {
  const root = parseMaybeJsonObject(value);
  if (!root) return false;
  if (firstNumber(root, ["bestPerformanceAverage", "bestPerfAvg", "bestAverage", "best"]) !== null) return true;
  if (firstNumber(root, ["medianPerformanceAverage", "medianPerfAvg", "medianAverage", "median"]) !== null) return true;
  return collectEncounterRankings(root, baseUrl, { role: config.role, metric: config.metric, limit: 1 }).length > 0;
}

function normalizeMetricSummary(
  value: unknown,
  encounterRankingsById: Record<string, unknown>,
  reportPullsById: Record<string, WarcraftLogsBossPull[]>,
  config: WarcraftLogsSliceConfig,
  baseUrl: string,
): WarcraftLogsMetricSummary {
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
    { role: config.role, metric: config.metric, limit: 32 },
  );
  const bossRankings = normalizeBossSummaries(
    rankings,
    encounterRankingsById,
    reportPullsById,
    config,
    baseUrl,
  );
  const pulls = bossRankings.flatMap((boss) => boss.pulls);

  return {
    key: config.key,
    role: config.role,
    roleLabel: config.roleLabel,
    metric: config.metric,
    metricLabel: config.metricLabel,
    title: config.title,
    description: config.description,
    sourceLabel: config.sourceLabel,
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
    recentStats: recentStats(pulls),
    encounterRankings: rankings,
    bossRankings,
  };
}

function zoneRankingsField(config: WarcraftLogsSliceConfig) {
  const args = [] as string[];
  if (config.graphqlMetric) args.push(`metric: ${config.graphqlMetric}`);
  if (config.graphqlRole) args.push(`role: ${config.graphqlRole}`);
  return `${config.zoneAlias}: zoneRankings${args.length ? `(${args.join(", ")})` : ""}`;
}

function zoneRankingsQuery() {
  const fields = [
    ...WCL_SLICES.map(zoneRankingsField),
    "hpsAnyRole: zoneRankings(metric: hps)",
    "dpsAnyRole: zoneRankings(metric: dps)",
    "tankDamageAnyRoleFallback: zoneRankings(metric: dps, role: Tank)",
  ]
    .map((field) => `      ${field}`)
    .join("\n");

  return `query CharacterZoneRankings($name: String!, $serverSlug: String!, $serverRegion: String!) {\n  characterData {\n    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {\n      id\n      canonicalID\n      name\n      classID\n${fields}\n    }\n  }\n}`;
}

function chooseZoneValue(
  character: Record<string, unknown>,
  config: WarcraftLogsSliceConfig,
  baseUrl: string,
) {
  const primary = character[config.zoneAlias];
  if (hasZoneRankingData(primary, config, baseUrl)) return primary;
  if (config.fallbackZoneAlias) {
    const fallback = character[config.fallbackZoneAlias];
    if (hasZoneRankingData(fallback, config, baseUrl)) return fallback;
  }
  return primary;
}

function encounterRankingArgs(config: WarcraftLogsSliceConfig, encounterId: number) {
  const args = [`encounterID: ${encounterId}`];
  if (config.graphqlMetric) args.push(`metric: ${config.graphqlMetric}`);
  if (config.graphqlRole) args.push(`role: ${config.graphqlRole}`);
  return args.join(", ");
}

function bossHistoryQuery(metricSummaries: WarcraftLogsMetricSummary[]) {
  const jobs = metricSummaries.flatMap((summary) => {
    const config = WCL_SLICES.find((slice) => slice.key === summary.key);
    if (!config) return [];
    return summary.encounterRankings
      .filter((ranking): ranking is WarcraftLogsEncounterRanking & { encounterId: number } =>
        isRaidBossEncounterId(ranking.encounterId),
      )
      .slice(0, ENCOUNTER_HISTORY_BOSS_LIMIT)
      .map((ranking) => ({ config, ranking }));
  });

  if (!jobs.length) return null;

  const fields = jobs
    .map(
      ({ config, ranking }, index) =>
        `    h${index}: encounterRankings(${encounterRankingArgs(config, ranking.encounterId)})`,
    )
    .join("\n");

  return {
    jobs,
    query: `query CharacterEncounterHistory($name: String!, $serverSlug: String!, $serverRegion: String!) {\n  characterData {\n    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {\n${fields}\n    }\n  }\n}`,
  };
}

async function fetchEncounterHistory(input: {
  credentials: WarcraftLogsApiCredentials;
  token: string;
  name: string;
  realmSlug: string;
  region: string;
  metricSummaries: WarcraftLogsMetricSummary[];
}) {
  const built = bossHistoryQuery(input.metricSummaries);
  if (!built) return {} as Record<string, Record<string, unknown>>;

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

    const character = response.data?.characterData?.character || null;
    const mapped = !response.errors?.length && character
      ? built.jobs.reduce<Record<string, Record<string, unknown>>>((acc, job, index) => {
          if (job.ranking.encounterId !== null) {
            acc[job.config.key] ||= {};
            acc[job.config.key][String(job.ranking.encounterId)] = character[`h${index}`];
          }
          return acc;
        }, {})
      : ({} as Record<string, Record<string, unknown>>);

    warcraftLogsDebugAudit("warcraft_logs.api.encounter_history_response", {
      summary: `WCL encounter history: ${input.name} — ${built.jobs.length} boss queries`,
      character: input.name,
      realmSlug: input.realmSlug,
      region: input.region,
      requestedBossQueries: built.jobs.length,
      mappedSlices: Object.keys(mapped).length,
      mappedBosses: Object.values(mapped).reduce((sum, item) => sum + Object.keys(item).length, 0),
      errors: response.errors?.map((item) => cleanText(item.message, 240)).filter(Boolean) || [],
      responsePreview: compactForLog(response),
    });

    return mapped;
  } catch {
    return {} as Record<string, Record<string, unknown>>;
  }
}

function normalizeAllMetricSummaries(
  character: Record<string, unknown>,
  encounterHistory: Record<string, Record<string, unknown>>,
  reportPulls: WarcraftLogsReportPullsBySlice,
  baseUrl: string,
) {
  return WCL_SLICES.map((config) =>
    normalizeMetricSummary(
      chooseZoneValue(character, config, baseUrl),
      encounterHistory[config.key] || {},
      reportPulls[config.key] || {},
      config,
      baseUrl,
    ),
  );
}

function primarySummary(metricSummaries: WarcraftLogsMetricSummary[]) {
  return (
    metricSummaries.find((summary) => summary.key === "healer-hps" && summary.encounterRankings.length) ||
    metricSummaries.find((summary) => summary.key === "dps-dps" && summary.encounterRankings.length) ||
    metricSummaries.find((summary) => summary.key === "tank-dps" && summary.encounterRankings.length) ||
    metricSummaries.find((summary) => summary.key === "overall") ||
    metricSummaries[0]
  );
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
    metricSummaries: [],
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
          query: zoneRankingsQuery(),
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

    warcraftLogsDebugAudit("warcraft_logs.api.zone_rankings_response", {
      summary: `WCL zone rankings: ${input.name}`,
      character: input.name,
      realmSlug,
      region,
      configuredBaseUrl: credentials.baseUrl,
      errors: response.errors?.map((item) => cleanText(item.message, 240)).filter(Boolean) || [],
      responsePreview: compactForLog(response),
    });

    if (firstError) throw new Error(firstError);

    const character = response.data?.characterData?.character || null;
    if (!character) {
      return emptySummary({ status: "not_found", profileUrl, updatedAt });
    }

    const initialMetricSummaries = normalizeAllMetricSummaries(
      character,
      {},
      emptyReportPullsBySlice(),
      credentials.baseUrl,
    );
    const encounterHistory = await fetchEncounterHistory({
      credentials,
      token,
      name: input.name,
      realmSlug,
      region,
      metricSummaries: initialMetricSummaries,
    });
    const reportPulls = await fetchRecentRaidBossPulls({
      credentials,
      token,
      name: input.name,
      realmSlug,
      region,
      metricSummaries: initialMetricSummaries,
    });
    const metricSummaries = normalizeAllMetricSummaries(
      character,
      encounterHistory,
      reportPulls,
      credentials.baseUrl,
    );
    const primary = primarySummary(metricSummaries);

    warcraftLogsDebugAudit("warcraft_logs.parser.summary", {
      summary: `WCL parser summary: ${input.name}`,
      character: input.name,
      realmSlug,
      region,
      primaryMetric: primary?.key || null,
      metricCount: metricSummaries.length,
      metrics: metricSummaries.map((metric) => ({
        key: metric.key,
        role: metric.role,
        metric: metric.metric,
        bestAverage: metric.bestPerformanceAverage,
        medianAverage: metric.medianPerformanceAverage,
        bosses: metric.bossRankings.length,
        pulls: metric.recentStats.pullCount,
        maxAmount: metric.recentStats.maxAmount,
        avgAmount: metric.recentStats.averageAmount,
        sampleBosses: metric.bossRankings.slice(0, 8).map((boss) => ({
          encounterId: boss.encounterId,
          name: boss.encounterName,
          bestPercentile: boss.bestPercentile,
          pulls: boss.pulls.length,
          maxAmount: boss.recentStats.maxAmount,
          avgAmount: boss.recentStats.averageAmount,
        })),
      })),
    });

    return {
      status: "ready",
      profileUrl,
      characterId: integerOrNull(character.id),
      canonicalId: integerOrNull(character.canonicalID),
      classId: integerOrNull(character.classID),
      bestPerformanceAverage: primary?.bestPerformanceAverage ?? null,
      medianPerformanceAverage: primary?.medianPerformanceAverage ?? null,
      allStarsPoints: primary?.allStarsPoints ?? null,
      allStarsRank: primary?.allStarsRank ?? null,
      encounterRankings: primary?.encounterRankings ?? [],
      bossRankings: primary?.bossRankings ?? [],
      metricSummaries,
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
