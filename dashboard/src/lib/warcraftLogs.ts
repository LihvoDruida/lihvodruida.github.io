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

type WarcraftLogsRateLimitSnapshot = {
  limitPerHour: number | null;
  pointsSpentThisHour: number | null;
  pointsResetIn: number | null;
};

type WarcraftLogsGraphqlResponse = {
  data?: {
    characterData?: {
      character?: Record<string, unknown> | null;
    } | null;
    rateLimitData?: Record<string, unknown> | null;
  } | null;
  errors?: Array<{ message?: string }>;
};

export type WarcraftLogsRoleKey = "overall" | "healer" | "dps" | "tank";
export type WarcraftLogsMetricKey = "points" | "hps" | "dps";
export type WarcraftLogsSummaryMode = "full" | "roster";

export type WarcraftLogsRecentStats = {
  pullCount: number;
  sampleSize: number;
  maxAmount: number | null;
  minAmount: number | null;
  averageAmount: number | null;
  arithmeticAverageAmount: number | null;
  weightedAverageAmount: number | null;
  medianAmount: number | null;
  standardDeviationAmount: number | null;
  consistencyScore: number | null;
  totalAmount: number | null;
  totalActiveTimeMs: number | null;
  maxPercentile: number | null;
  averagePercentile: number | null;
  medianPercentile: number | null;
  averageDurationMs: number | null;
  averageBossPercentage: number | null;
  bestBossPercentage: number | null;
  averageFightPercentage: number | null;
  deathCount: number;
  killCount: number;
  wipeCount: number;
  lastPullAt: string | null;
};

export type WarcraftLogsDifficultySummary = {
  difficulty: number | null;
  difficultyLabel: string;
  bosses: number;
  pulls: number;
  recentStats: WarcraftLogsRecentStats;
};

export type WarcraftLogsSourceCoverage = {
  zoneRankingSlices: number;
  encounterRankingSlices: number;
  reportsChecked: number;
  archivedReports: number;
  rankedCharacters: number;
  reportBossFightsChecked: number;
  reportPullRows: number;
  duplicatePullRows: number;
  uniqueReportPullRows: number;
  reportTableQueries: number;
  reportTableFallbacks: number;
  summaryTableRows: number;
  deathTableRows: number;
  rateLimitLimitPerHour: number | null;
  rateLimitPointsSpentThisHour: number | null;
  rateLimitPointsResetIn: number | null;
  roleTotals: Record<WarcraftLogsConcreteRoleKey, number>;
  skippedUnknownRole: number;
  skippedMissingAmount: number;
  durationMs: number | null;
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
  totalAmount: number | null;
  activeTimeMs: number | null;
  damageDone: number | null;
  healingDone: number | null;
  deathCount: number | null;
  interruptCount: number | null;
  dispelCount: number | null;
  bossPercentage: number | null;
  fightPercentage: number | null;
  durationMs: number | null;
  itemLevel: number | null;
  totalParses: number | null;
  fightSize: number | null;
  zoneName: string | null;
  reportTitle: string | null;
  archiveStatus: string | null;
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
  primaryDifficulty: number | null;
  primaryDifficultyLabel: string | null;
  difficultySummaries: WarcraftLogsDifficultySummary[];
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
  primaryDifficulty: number | null;
  primaryDifficultyLabel: string | null;
  difficultySummaries: WarcraftLogsDifficultySummary[];
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
  sourceCoverage: WarcraftLogsSourceCoverage;
  updatedAt: string;
  error?: string | null;
};

type WarcraftLogsConcreteRoleKey = Exclude<WarcraftLogsRoleKey, "overall">;

type WarcraftLogsReportActor = {
  id: number;
  name: string | null;
  realmSlug: string | null;
  role: WarcraftLogsConcreteRoleKey | null;
  spec: string | null;
  rawSubType: string | null;
};

type WarcraftLogsReportMeasure = {
  amount: number | null;
  totalAmount: number | null;
  activeTimeMs: number | null;
  role: WarcraftLogsConcreteRoleKey | null;
  spec: string | null;
  rowCount: number;
};

type WarcraftLogsReportRoleResolution = {
  role: WarcraftLogsConcreteRoleKey | null;
  spec: string | null;
  source: "combatantInfo" | "table" | "actor" | "metric" | "unknown";
};

type WarcraftLogsSliceConfig = {
  key: string;
  zoneAlias: string;
  role: WarcraftLogsRoleKey;
  roleLabel: string;
  metric: WarcraftLogsMetricKey;
  metricLabel: string;
  title: string;
  description: string;
  sourceLabel: string;
  graphqlMetric?: "hps" | "dps";
  graphqlRole?: "healer" | "dps" | "tank";
};

const ENCOUNTER_HISTORY_LIMIT = 30;
const RECENT_PULL_CALC_LIMIT = 10;
const ENCOUNTER_HISTORY_BOSS_LIMIT = 12;

const WCL_RAID_DIFFICULTIES = [
  { id: 5, label: "Міфік", aliasSuffix: "Mythic" },
  { id: 4, label: "Героїк", aliasSuffix: "Heroic" },
  { id: 3, label: "Нормал", aliasSuffix: "Normal" },
] as const;

type WarcraftLogsTrackedDifficulty =
  (typeof WCL_RAID_DIFFICULTIES)[number]["id"];

type WarcraftLogsCharacterCacheEntry = {
  expiresAt: number;
  value: WarcraftLogsCharacterSummary;
};

const characterSummaryCache = new Map<
  string,
  WarcraftLogsCharacterCacheEntry
>();

const WCL_SLICES: WarcraftLogsSliceConfig[] = [
  {
    key: "healer-hps",
    zoneAlias: "healerHps",
    role: "healer",
    roleLabel: "Хіл",
    metric: "hps",
    metricLabel: "HPS",
    title: "Хіл HPS",
    description:
      "Середній і максимальний HPS тільки з пулів, де персонаж був хілом.",
    sourceLabel: "Чисті хіл-пули",
    graphqlMetric: "hps",
    graphqlRole: "healer",
  },
  {
    key: "dps-dps",
    zoneAlias: "dpsDamage",
    role: "dps",
    roleLabel: "ДД",
    metric: "dps",
    metricLabel: "DPS",
    title: "ДД DPS",
    description:
      "Середній і максимальний DPS тільки з пулів, де персонаж був ДД.",
    sourceLabel: "Чисті ДД-пули",
    graphqlMetric: "dps",
    graphqlRole: "dps",
  },
  {
    key: "tank-dps",
    zoneAlias: "tankDamage",
    role: "tank",
    roleLabel: "Танк",
    metric: "dps",
    metricLabel: "DPS",
    title: "Танк DPS",
    description: "DPS тільки з пулів, де персонаж був танком.",
    sourceLabel: "Танк-пули / DPS",
    graphqlMetric: "dps",
    graphqlRole: "tank",
  },
  {
    key: "tank-hps",
    zoneAlias: "tankHealing",
    role: "tank",
    roleLabel: "Танк",
    metric: "hps",
    metricLabel: "HPS",
    title: "Танк HPS",
    description: "HPS / самопідхіл тільки з танкових пулів.",
    sourceLabel: "Танк-пули / HPS",
    graphqlMetric: "hps",
    graphqlRole: "tank",
  },
  {
    key: "overall",
    zoneAlias: "overallRankings",
    role: "overall",
    roleLabel: "Загалом",
    metric: "points",
    metricLabel: "Parse",
    title: "Загальний parse",
    description:
      "Загальний зріз Warcraft Logs без змішування з нашими рольовими підрахунками.",
    sourceLabel: "Загальний WCL",
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

function booleanOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  const normalized = cleanText(value, 40).toLowerCase();
  if (["true", "1", "kill", "killed", "yes", "y"].includes(normalized))
    return true;
  if (["false", "0", "wipe", "wiped", "no", "n"].includes(normalized))
    return false;
  return null;
}

function cloneJsonValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
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

function warcraftLogsRecentReportLimit(
  credentials?: Pick<WarcraftLogsApiCredentials, "recentReportLimit"> | null,
) {
  return (
    credentials?.recentReportLimit ??
    readIntegerEnv("WARCRAFTLOGS_RECENT_REPORT_LIMIT", 12, 1, 30)
  );
}

function warcraftLogsReportFightTableLimit(
  credentials?: Pick<
    WarcraftLogsApiCredentials,
    "reportFightTableLimit"
  > | null,
) {
  return (
    credentials?.reportFightTableLimit ??
    readIntegerEnv("WARCRAFTLOGS_REPORT_FIGHT_TABLE_LIMIT", 24, 4, 60)
  );
}

function warcraftLogsCharacterCacheTtlMs(
  credentials?: Pick<WarcraftLogsApiCredentials, "characterCacheTtlMs"> | null,
) {
  return (
    credentials?.characterCacheTtlMs ??
    readIntegerEnv("WARCRAFTLOGS_CHARACTER_CACHE_TTL_MS", 120_000, 0, 900_000)
  );
}

function warcraftLogsDebugAuditEnabled(
  credentials?: Pick<WarcraftLogsApiCredentials, "debugAuditLogs"> | null,
) {
  return Boolean(credentials?.debugAuditLogs);
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

function warcraftLogsDebugAudit(
  credentials:
    | Pick<WarcraftLogsApiCredentials, "debugAuditLogs">
    | null
    | undefined,
  action: string,
  details: Record<string, unknown>,
) {
  if (!warcraftLogsDebugAuditEnabled(credentials)) return;

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
      message:
        error instanceof Error ? error.message : String(error || "unknown"),
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

function reportUrl(
  baseUrl: string,
  reportCode: string | null,
  fightId: number | null,
) {
  if (!reportCode) return null;
  const suffix =
    fightId !== null ? `#fight=${encodeURIComponent(String(fightId))}` : "";
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

function metricFromRecord(
  record: Record<string, unknown>,
  fallback?: WarcraftLogsMetricKey,
) {
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

function encounterNameFromRecord(
  record: Record<string, unknown>,
  fallback?: string | null,
) {
  const encounter = nestedRecord(record, ["encounter", "boss", "fight"]);
  return (
    cleanText(
      firstValue(record, [
        "encounterName",
        "encounter_name",
        "bossName",
        "name",
      ]) || firstValue(encounter, ["name", "encounterName"]),
      140,
    ) ||
    cleanText(fallback, 140) ||
    null
  );
}

function encounterIdFromRecord(
  record: Record<string, unknown>,
  fallback?: number | null,
) {
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

const SPEC_ROLE_BY_KEY: Record<string, WarcraftLogsConcreteRoleKey> = {
  discipline: "healer",
  holy: "healer",
  mistweaver: "healer",
  preservation: "healer",
  restoration: "healer",
  blood: "tank",
  brewmaster: "tank",
  guardian: "tank",
  protection: "tank",
  vengeance: "tank",
  affliction: "dps",
  arcane: "dps",
  arms: "dps",
  assassination: "dps",
  augmentation: "dps",
  balance: "dps",
  beastmastery: "dps",
  demonology: "dps",
  destruction: "dps",
  devastation: "dps",
  elemental: "dps",
  enhancement: "dps",
  feral: "dps",
  fire: "dps",
  frost: "dps",
  fury: "dps",
  havoc: "dps",
  marksmanship: "dps",
  outlaw: "dps",
  retribution: "dps",
  shadow: "dps",
  subtlety: "dps",
  survival: "dps",
  unholy: "dps",
  windwalker: "dps",
};

const SPEC_INFO_BY_ID: Record<
  number,
  { spec: string; role: WarcraftLogsConcreteRoleKey }
> = {
  62: { spec: "Arcane", role: "dps" },
  63: { spec: "Fire", role: "dps" },
  64: { spec: "Frost", role: "dps" },
  65: { spec: "Holy", role: "healer" },
  66: { spec: "Protection", role: "tank" },
  70: { spec: "Retribution", role: "dps" },
  71: { spec: "Arms", role: "dps" },
  72: { spec: "Fury", role: "dps" },
  73: { spec: "Protection", role: "tank" },
  102: { spec: "Balance", role: "dps" },
  103: { spec: "Feral", role: "dps" },
  104: { spec: "Guardian", role: "tank" },
  105: { spec: "Restoration", role: "healer" },
  250: { spec: "Blood", role: "tank" },
  251: { spec: "Frost", role: "dps" },
  252: { spec: "Unholy", role: "dps" },
  253: { spec: "Beast Mastery", role: "dps" },
  254: { spec: "Marksmanship", role: "dps" },
  255: { spec: "Survival", role: "dps" },
  256: { spec: "Discipline", role: "healer" },
  257: { spec: "Holy", role: "healer" },
  258: { spec: "Shadow", role: "dps" },
  259: { spec: "Assassination", role: "dps" },
  260: { spec: "Outlaw", role: "dps" },
  261: { spec: "Subtlety", role: "dps" },
  262: { spec: "Elemental", role: "dps" },
  263: { spec: "Enhancement", role: "dps" },
  264: { spec: "Restoration", role: "healer" },
  265: { spec: "Affliction", role: "dps" },
  266: { spec: "Demonology", role: "dps" },
  267: { spec: "Destruction", role: "dps" },
  268: { spec: "Brewmaster", role: "tank" },
  269: { spec: "Windwalker", role: "dps" },
  270: { spec: "Mistweaver", role: "healer" },
  577: { spec: "Havoc", role: "dps" },
  581: { spec: "Vengeance", role: "tank" },
  1467: { spec: "Devastation", role: "dps" },
  1468: { spec: "Preservation", role: "healer" },
  1473: { spec: "Augmentation", role: "dps" },
};

function specInfoFromRecord(record: Record<string, unknown> | null) {
  const specId = firstInteger(record, [
    "specID",
    "specId",
    "currentSpecID",
    "currentSpecId",
    "talentSpecID",
    "talentSpecId",
  ]);
  return specId !== null ? SPEC_INFO_BY_ID[specId] || null : null;
}

function normalizeRoleText(value: unknown) {
  return cleanText(value, 120)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яіїєґё]+/gi, "");
}

function concreteRoleFromValue(
  value: unknown,
): WarcraftLogsConcreteRoleKey | null {
  const normalized = normalizeRoleText(value);
  if (!normalized) return null;
  if (
    [
      "healer",
      "heal",
      "healing",
      "hps",
      "хіл",
      "хил",
      "лікар",
      "лекарь",
      "целитель",
    ].some((token) => normalized.includes(token))
  ) {
    return "healer";
  }
  if (["tank", "tanking", "танк"].some((token) => normalized.includes(token)))
    return "tank";
  if (
    ["dps", "damage", "damager", "dd", "дд", "урон", "шкода"].some((token) =>
      normalized.includes(token),
    )
  )
    return "dps";
  return null;
}

function concreteRoleFromSpec(
  value: unknown,
): WarcraftLogsConcreteRoleKey | null {
  const normalized = normalizeRoleText(value);
  if (!normalized) return null;
  const direct = SPEC_ROLE_BY_KEY[normalized];
  if (direct) return direct;
  for (const [specKey, role] of Object.entries(SPEC_ROLE_BY_KEY)) {
    if (normalized.includes(specKey)) return role;
  }
  return concreteRoleFromValue(value);
}

function specFromRecord(record: Record<string, unknown>) {
  const byId = specInfoFromRecord(record);
  if (byId?.spec) return byId.spec;

  return (
    cleanText(
      firstValue(record, [
        "spec",
        "specName",
        "spec_name",
        "bestSpec",
        "subType",
        "subtype",
        "icon",
        "talentSpec",
        "talent_spec",
        "talentSpecName",
      ]),
      80,
    ) || null
  );
}

function roleFromRecord(
  record: Record<string, unknown>,
): WarcraftLogsConcreteRoleKey | null {
  const directRole = concreteRoleFromValue(
    firstValue(record, [
      "role",
      "roleType",
      "role_type",
      "playerRole",
      "player_role",
    ]),
  );
  if (directRole) return directRole;

  const byId = specInfoFromRecord(record);
  if (byId?.role) return byId.role;

  return concreteRoleFromSpec(specFromRecord(record));
}

function isReportMetricSlice(
  config: WarcraftLogsSliceConfig,
): config is WarcraftLogsSliceConfig & {
  role: WarcraftLogsConcreteRoleKey;
  metric: "hps" | "dps";
} {
  return (
    config.role !== "overall" &&
    (config.metric === "hps" || config.metric === "dps")
  );
}

function resolveReportFightRole(input: {
  actor: WarcraftLogsReportActor;
  damage: WarcraftLogsReportMeasure;
  healing: WarcraftLogsReportMeasure;
  combatantInfo?: {
    role: WarcraftLogsConcreteRoleKey | null;
    spec: string | null;
  } | null;
}): WarcraftLogsReportRoleResolution {
  const tableSpec = input.damage.spec || input.healing.spec;
  const combatantRole = input.combatantInfo?.role ?? null;
  const combatantSpec = input.combatantInfo?.spec ?? null;

  // COMBATANT_INFO is emitted at encounter start and contains the current
  // specialization. It is the safest per-pull role source for wipes, because
  // rankings often exist only for kills and damage/healing tables do not always
  // expose the player's role.
  if (combatantRole) {
    return {
      role: combatantRole,
      spec: combatantSpec || tableSpec || input.actor.spec,
      source: "combatantInfo",
    };
  }

  const tableRoles = [input.damage.role, input.healing.role].filter(
    (role): role is WarcraftLogsConcreteRoleKey => Boolean(role),
  );
  const uniqueTableRoles = [...new Set(tableRoles)];

  if (uniqueTableRoles.length === 1) {
    return {
      role: uniqueTableRoles[0],
      spec: tableSpec || input.actor.spec,
      source: "table",
    };
  }

  const tableSpecRole = concreteRoleFromSpec(tableSpec);
  if (tableSpecRole) {
    return {
      role: tableSpecRole,
      spec: tableSpec,
      source: "table",
    };
  }

  if (input.actor.role) {
    return {
      role: input.actor.role,
      spec: tableSpec || input.actor.spec,
      source: "actor",
    };
  }

  const actorSpecRole = concreteRoleFromSpec(input.actor.spec);
  if (actorSpecRole) {
    return {
      role: actorSpecRole,
      spec: tableSpec || input.actor.spec,
      source: "actor",
    };
  }

  // Last-resort role inference for source-filtered table data. This is not used
  // when the player has both meaningful damage and healing in the same pull, so
  // a healer's small DPS or a DPS player's self-healing is not mixed silently.
  const hasDamage = input.damage.amount !== null;
  const hasHealing = input.healing.amount !== null;
  if (hasDamage !== hasHealing) {
    return {
      role: hasHealing ? "healer" : "dps",
      spec: tableSpec || input.actor.spec,
      source: "metric",
    };
  }

  const damageAmount = input.damage.amount ?? 0;
  const healingAmount = input.healing.amount ?? 0;
  if (damageAmount > 0 && healingAmount > 0) {
    if (healingAmount >= damageAmount * 2) {
      return {
        role: "healer",
        spec: tableSpec || input.actor.spec,
        source: "metric",
      };
    }
    if (damageAmount >= healingAmount * 4) {
      return {
        role: "dps",
        spec: tableSpec || input.actor.spec,
        source: "metric",
      };
    }
  }

  return {
    role: null,
    spec: tableSpec || input.actor.spec,
    source: "unknown",
  };
}

function isRaidBossEncounterId(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isEligibleRaidBossPull(
  pull: WarcraftLogsBossPull,
  encounterId?: number | null,
) {
  const id = pull.encounterId ?? encounterId ?? null;
  return isRaidBossEncounterId(id);
}

function difficultyRank(value: number | null | undefined) {
  if (value === 5) return 50;
  if (value === 4) return 40;
  if (value === 3) return 30;
  if (value === 2) return 20;
  if (value === 1) return 10;
  return 0;
}

function difficultyLabel(value: number | null | undefined) {
  if (value === 5) return "Міфік";
  if (value === 4) return "Героїк";
  if (value === 3) return "Нормал";
  if (value === 2) return "Legacy/Flex";
  if (value === 1) return "LFR";
  return "Без складності";
}

function pullHasMetricData(
  pull: WarcraftLogsBossPull,
  metric?: WarcraftLogsMetricKey | null,
) {
  if (!isEligibleRaidBossPull(pull)) return false;
  if (metric === "hps" || metric === "dps") {
    return (
      typeof pull.amount === "number" &&
      Number.isFinite(pull.amount) &&
      pull.amount > 0
    );
  }
  return (
    typeof pull.percentile === "number" && Number.isFinite(pull.percentile)
  );
}

function pickHighestDifficulty(
  pulls: WarcraftLogsBossPull[],
  metric?: WarcraftLogsMetricKey | null,
) {
  let selected: number | null = null;
  const candidates = pulls.filter((pull) => pullHasMetricData(pull, metric));
  const source = candidates.length
    ? candidates
    : pulls.filter(isEligibleRaidBossPull);
  for (const pull of source) {
    if (pull.difficulty === null || pull.difficulty === undefined) continue;
    if (
      selected === null ||
      difficultyRank(pull.difficulty) > difficultyRank(selected)
    ) {
      selected = pull.difficulty;
    }
  }
  return selected;
}

function pullsForPrimaryDifficulty(
  pulls: WarcraftLogsBossPull[],
  primaryDifficulty: number | null,
) {
  if (primaryDifficulty === null) return pulls.filter(isEligibleRaidBossPull);
  return pulls.filter(
    (pull) =>
      isEligibleRaidBossPull(pull) && pull.difficulty === primaryDifficulty,
  );
}

function pullTimeMs(pull: WarcraftLogsBossPull) {
  if (!pull.startTime) return 0;
  const time = new Date(pull.startTime).getTime();
  return Number.isFinite(time) ? time : 0;
}

function pullDayKey(pull: WarcraftLogsBossPull) {
  const time = pullTimeMs(pull);
  if (!time) return "no-date";
  return new Date(time).toISOString().slice(0, 10);
}

function roundedMetricAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : "none";
}

function roundedDurationSeconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return "none";
  return Math.round((value > 10_000 ? value : value * 1000) / 1000);
}

function normalizedKillState(value: unknown) {
  const booleanValue = booleanOrNull(value);
  if (booleanValue === true) return "kill";
  if (booleanValue === false) return "wipe";

  const normalized = normalizeRoleText(value);
  if (normalized.includes("kill")) return "kill";
  if (normalized.includes("wipe")) return "wipe";
  return normalized || "unknown";
}

function normalizeBossProgressPercent(value: unknown) {
  const number = numberOrNull(value);
  if (number === null) return null;
  if (number <= 1) return Math.max(0, Math.min(100, number * 100));
  if (number > 100) return Math.max(0, Math.min(100, number / 100));
  return Math.max(0, Math.min(100, number));
}

function activeTimeMsFromRecord(
  record: Record<string, unknown>,
  fallbackDurationMs: number,
) {
  const raw = firstNumber(record, [
    "activeTimeMs",
    "activeTimeMS",
    "active_time_ms",
    "activeTime",
    "active_time",
    "totalTime",
    "total_time",
    "time",
    "durationMs",
    "duration",
  ]);
  if (raw === null || raw <= 0)
    return fallbackDurationMs > 0 ? fallbackDurationMs : null;
  return raw > 10_000 ? raw : raw * 1000;
}

function directPerSecondKeys(metric: WarcraftLogsMetricKey) {
  return metric === "hps"
    ? [
        "hps",
        "HPS",
        "healingPerSecond",
        "healing_per_second",
        "perSecondAmount",
        "persecondamount",
      ]
    : [
        "dps",
        "DPS",
        "damagePerSecond",
        "damage_per_second",
        "perSecondAmount",
        "persecondamount",
      ];
}

function totalAmountKeys(metric: WarcraftLogsMetricKey) {
  return metric === "hps"
    ? [
        "totalHealing",
        "healingTotal",
        "effectiveHealing",
        "rawHealing",
        "healingDone",
        "healing",
        "total",
      ]
    : [
        "totalDamage",
        "damageTotal",
        "effectiveDamage",
        "rawDamage",
        "damageDone",
        "damage",
        "total",
      ];
}

function amountDetailsFromTableRow(
  row: Record<string, unknown>,
  metric: WarcraftLogsMetricKey,
  durationMs: number,
) {
  const direct = firstNumber(row, directPerSecondKeys(metric));
  const total = firstNumber(row, totalAmountKeys(metric));
  const activeTimeMs = activeTimeMsFromRecord(row, durationMs);
  const calculated =
    total !== null && total > 0 && activeTimeMs !== null && activeTimeMs > 0
      ? total / (activeTimeMs / 1000)
      : null;
  const amount = direct !== null && direct > 0 ? direct : calculated;

  return {
    amount:
      amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
    totalAmount:
      total !== null && Number.isFinite(total) && total > 0 ? total : null,
    activeTimeMs,
  };
}

function firstIntegerFromRows(rows: Record<string, unknown>[], keys: string[]) {
  for (const row of rows) {
    const value = firstInteger(row, keys);
    if (value !== null) return value;
  }
  return null;
}

function summaryStatsFromReportTable(
  value: unknown,
  actor: WarcraftLogsReportActor,
) {
  const rows = collectTableRows(value);
  const actorRows = rows.filter((row) => rowMatchesReportActor(row, actor));
  const sourceRows = actorRows.length
    ? actorRows
    : rows.length === 1
      ? rows
      : [];
  return {
    rowCount: rows.length,
    role: sourceRows.map(roleFromRecord).find(Boolean) || null,
    spec: sourceRows.map(specFromRecord).find(Boolean) || null,
    itemLevel: firstNumber(sourceRows[0] || null, [
      "itemLevel",
      "ilvl",
      "itemLevelEquipped",
      "averageItemLevel",
    ]),
    deathCount: firstIntegerFromRows(sourceRows, [
      "deaths",
      "deathCount",
      "totalDeaths",
    ]),
    interruptCount: firstIntegerFromRows(sourceRows, [
      "interrupts",
      "interruptCount",
      "totalInterrupts",
    ]),
    dispelCount: firstIntegerFromRows(sourceRows, [
      "dispels",
      "dispelCount",
      "totalDispels",
    ]),
  };
}

function deathCountFromReportTable(
  value: unknown,
  actor: WarcraftLogsReportActor,
) {
  const rows = collectTableRows(value);
  const actorRows = rows.filter((row) => rowMatchesReportActor(row, actor));
  if (!actorRows.length)
    return { count: null as number | null, rowCount: rows.length };
  const explicit = firstIntegerFromRows(actorRows, [
    "deaths",
    "deathCount",
    "totalDeaths",
    "amount",
    "total",
  ]);
  return { count: explicit ?? actorRows.length, rowCount: rows.length };
}

function pullDuplicateSignature(pull: WarcraftLogsBossPull) {
  return [
    pull.encounterId ?? normalizeNameKey(pull.encounterName),
    pull.role || "role",
    pull.metric || "metric",
    pull.difficulty ?? "difficulty",
    pull.reportCode || "no-report",
    pull.reportFightId ?? "no-fight",
    pullTimeSecondKey(pull),
    pullDayKey(pull),
    roundedDurationSeconds(pull.durationMs),
    roundedMetricAmount(pull.amount),
    roundedMetricAmount(pull.totalAmount),
    pull.percentile !== null && pull.percentile !== undefined
      ? Math.round(pull.percentile * 100) / 100
      : "no-percentile",
    normalizedKillState(pull.killedWith),
  ].join("|");
}

function pullCompletenessScore(pull: WarcraftLogsBossPull) {
  const values: unknown[] = [
    pull.percentile,
    pull.historicalPercentile,
    pull.todayPercentile,
    pull.rank,
    pull.amount,
    pull.totalAmount,
    pull.activeTimeMs,
    pull.damageDone,
    pull.healingDone,
    pull.deathCount,
    pull.interruptCount,
    pull.dispelCount,
    pull.bossPercentage,
    pull.fightPercentage,
    pull.durationMs,
    pull.itemLevel,
    pull.totalParses,
    pull.fightSize,
    pull.zoneName,
    pull.reportTitle,
    pull.reportCode,
    pull.reportFightId,
    pull.startTime,
    pull.killedWith,
  ];
  return values.reduce<number>(
    (score, value) =>
      score + (value !== null && value !== undefined && value !== "" ? 1 : 0),
    pull.source === "report" ? 3 : 0,
  );
}

function preferNewerDuplicate(
  left: WarcraftLogsBossPull,
  right: WarcraftLogsBossPull,
) {
  const leftTime = pullTimeMs(left);
  const rightTime = pullTimeMs(right);
  if (rightTime !== leftTime) {
    return rightTime > leftTime
      ? mergePullData(right, left)
      : mergePullData(left, right);
  }
  return pullCompletenessScore(right) > pullCompletenessScore(left)
    ? mergePullData(right, left)
    : mergePullData(left, right);
}

function sameNonNullValue(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) {
  return (
    left !== null &&
    left !== undefined &&
    right !== null &&
    right !== undefined &&
    left === right
  );
}

function areDuplicatePulls(
  left: WarcraftLogsBossPull,
  right: WarcraftLogsBossPull,
) {
  const leftReportFight = reportFightDuplicateKey(left);
  const rightReportFight = reportFightDuplicateKey(right);
  if (
    leftReportFight &&
    rightReportFight &&
    leftReportFight === rightReportFight
  )
    return true;

  const leftFacts = factualDuplicateKey(left);
  const rightFacts = factualDuplicateKey(right);
  if (leftFacts && rightFacts && leftFacts === rightFacts) return true;

  const sameMetric = (left.metric || null) === (right.metric || null);
  const sameRole = (left.role || null) === (right.role || null);
  const leftDuration = roundedDurationSeconds(left.durationMs);
  const rightDuration = roundedDurationSeconds(right.durationMs);
  const leftAmount = roundedMetricAmount(left.amount);
  const rightAmount = roundedMetricAmount(right.amount);
  const leftState = normalizedKillState(left.killedWith);
  const rightState = normalizedKillState(right.killedWith);
  const sameDuration =
    leftDuration !== "none" && leftDuration === rightDuration;
  const sameAmount = leftAmount !== "none" && leftAmount === rightAmount;
  const sameState = leftState !== "unknown" && leftState === rightState;
  const leftTime = pullTimeSecondKey(left);
  const rightTime = pullTimeSecondKey(right);
  const sameTime =
    leftTime !== "no-time" && sameNonNullValue(leftTime, rightTime);
  return (
    sameMetric &&
    sameRole &&
    sameTime &&
    sameDuration &&
    sameAmount &&
    sameState
  );
}

function dedupeEquivalentPullsWithStats(pulls: WarcraftLogsBossPull[]) {
  const merged: WarcraftLogsBossPull[] = [];
  let duplicatesMerged = 0;

  for (const pull of pulls) {
    const index = merged.findIndex((candidate) =>
      areDuplicatePulls(candidate, pull),
    );
    if (index >= 0) {
      merged[index] = preferNewerDuplicate(merged[index], pull);
      duplicatesMerged += 1;
    } else {
      merged.push(pull);
    }
  }

  return { pulls: merged, duplicatesMerged };
}

function preferNumber(primary: number | null, fallback: number | null) {
  return typeof primary === "number" && Number.isFinite(primary)
    ? primary
    : fallback;
}

function preferText(primary: string | null, fallback: string | null) {
  return primary && primary.trim() ? primary : fallback;
}

function mergePullData(
  left: WarcraftLogsBossPull,
  right: WarcraftLogsBossPull,
): WarcraftLogsBossPull {
  return {
    ...left,
    encounterId: preferNumber(left.encounterId, right.encounterId),
    encounterName:
      preferText(left.encounterName, right.encounterName) || left.encounterName,
    role: left.role || right.role,
    spec: preferText(left.spec, right.spec),
    metric: left.metric || right.metric,
    difficulty: preferNumber(left.difficulty, right.difficulty),
    percentile: preferNumber(left.percentile, right.percentile),
    historicalPercentile: preferNumber(
      left.historicalPercentile,
      right.historicalPercentile,
    ),
    todayPercentile: preferNumber(left.todayPercentile, right.todayPercentile),
    rank: preferNumber(left.rank, right.rank),
    amount: preferNumber(left.amount, right.amount),
    totalAmount: preferNumber(left.totalAmount, right.totalAmount),
    activeTimeMs: preferNumber(left.activeTimeMs, right.activeTimeMs),
    damageDone: preferNumber(left.damageDone, right.damageDone),
    healingDone: preferNumber(left.healingDone, right.healingDone),
    deathCount: preferNumber(left.deathCount, right.deathCount),
    interruptCount: preferNumber(left.interruptCount, right.interruptCount),
    dispelCount: preferNumber(left.dispelCount, right.dispelCount),
    bossPercentage: preferNumber(left.bossPercentage, right.bossPercentage),
    fightPercentage: preferNumber(left.fightPercentage, right.fightPercentage),
    durationMs: preferNumber(left.durationMs, right.durationMs),
    itemLevel: preferNumber(left.itemLevel, right.itemLevel),
    totalParses: preferNumber(left.totalParses, right.totalParses),
    fightSize: preferNumber(left.fightSize, right.fightSize),
    zoneName: preferText(left.zoneName, right.zoneName),
    reportTitle: preferText(left.reportTitle, right.reportTitle),
    archiveStatus: preferText(left.archiveStatus, right.archiveStatus),
    killedWith: preferText(left.killedWith, right.killedWith),
    reportCode: preferText(left.reportCode, right.reportCode),
    reportFightId: preferNumber(left.reportFightId, right.reportFightId),
    reportUrl: preferText(left.reportUrl, right.reportUrl),
    startTime: preferText(left.startTime, right.startTime),
    source: left.source === "report" ? left.source : right.source,
  };
}

function reportInfoFromUrl(value: unknown) {
  const text = cleanText(value, 700);
  if (!text)
    return {
      reportCode: null as string | null,
      reportFightId: null as number | null,
    };

  try {
    const url = new URL(text, envWarcraftLogsBaseUrl());
    const parts = url.pathname.split("/").filter(Boolean);
    const reportsIndex = parts.findIndex(
      (part) => part.toLowerCase() === "reports",
    );
    const reportCode =
      reportsIndex >= 0 ? cleanText(parts[reportsIndex + 1], 80) || null : null;
    const hashParams = new URLSearchParams(
      url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
    );
    const searchFight =
      url.searchParams.get("fight") || hashParams.get("fight");
    const reportFightId = integerOrNull(searchFight);
    return { reportCode, reportFightId };
  } catch {
    const reportMatch = text.match(/\/reports\/([A-Za-z0-9]+)/i);
    const fightMatch =
      text.match(/[?#&]fight=(\d+)/i) || text.match(/#fight=(\d+)/i);
    return {
      reportCode: reportMatch ? cleanText(reportMatch[1], 80) || null : null,
      reportFightId: fightMatch ? integerOrNull(fightMatch[1]) : null,
    };
  }
}

function reportInfoFromRecord(record: Record<string, unknown>) {
  const report = nestedRecord(record, ["report", "log"]);
  const urlInfo = reportInfoFromUrl(
    firstValue(record, ["reportUrl", "url", "link", "reportLink"]) ||
      firstValue(report, ["url", "link", "reportUrl"]),
  );
  const reportCode =
    cleanText(
      firstValue(record, ["reportCode", "reportID", "reportId", "code"]) ||
        firstValue(report, ["code", "id", "reportCode"]) ||
        urlInfo.reportCode,
      80,
    ) || null;
  const reportFightId =
    firstInteger(record, [
      "reportFightID",
      "reportFightId",
      "fightID",
      "fightId",
      "fight",
    ]) ?? urlInfo.reportFightId;
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

  const explicitRole = roleFromRecord(record);
  if (
    options.role !== "overall" &&
    explicitRole !== null &&
    explicitRole !== options.role
  ) {
    return null;
  }

  const encounterName = encounterNameFromRecord(record, options.encounterName);
  if (!encounterName) return null;

  const encounterId = encounterIdFromRecord(
    record,
    options.encounterId ?? null,
  );
  if (!isRaidBossEncounterId(encounterId)) return null;

  const percentile = firstNumber(record, [
    "percentile",
    "rankPercent",
    "bestPercent",
    "bestPercentile",
    "historicalPercentile",
    "todayPercentile",
  ]);
  const rawAmount = firstNumber(record, amountKeysForMetric(options.metric));
  const amount =
    options.metric === "points"
      ? rawAmount
      : rawAmount !== null && rawAmount > 0
        ? rawAmount
        : null;
  const durationMs = durationMsFromRecord(record);
  const { reportCode, reportFightId, startTime } = reportInfoFromRecord(record);
  const hasPullSignal =
    percentile !== null ||
    amount !== null ||
    reportCode !== null ||
    startTime !== null ||
    firstInteger(record, ["rank", "worldRank", "serverRank", "regionRank"]) !==
      null;

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
    rank: firstInteger(record, [
      "rank",
      "worldRank",
      "serverRank",
      "regionRank",
    ]),
    amount,
    totalAmount:
      options.metric === "hps" || options.metric === "dps"
        ? firstNumber(record, [
            ...totalAmountKeys(options.metric),
            "totalAmount",
          ])
        : null,
    activeTimeMs: firstNumber(record, [
      "activeTimeMs",
      "activeTime",
      "totalTime",
    ]),
    damageDone: firstNumber(record, totalAmountKeys("dps")),
    healingDone: firstNumber(record, totalAmountKeys("hps")),
    deathCount: firstInteger(record, ["deaths", "deathCount", "totalDeaths"]),
    interruptCount: firstInteger(record, ["interrupts", "interruptCount"]),
    dispelCount: firstInteger(record, ["dispels", "dispelCount"]),
    bossPercentage: normalizeBossProgressPercent(
      firstValue(record, ["bossPercentage", "boss_percent", "bossPercent"]),
    ),
    fightPercentage: normalizeBossProgressPercent(
      firstValue(record, ["fightPercentage", "fight_percent", "fightPercent"]),
    ),
    durationMs,
    itemLevel: firstNumber(record, [
      "ilvl",
      "itemLevel",
      "itemLevelEquipped",
      "averageItemLevel",
    ]),
    totalParses: firstInteger(record, [
      "totalParses",
      "size",
      "parseCount",
      "parses",
    ]),
    fightSize: firstInteger(record, [
      "fightSize",
      "size",
      "groupSize",
      "raidSize",
    ]),
    zoneName:
      cleanText(
        firstValue(record, ["zoneName", "zone", "instanceName", "raidName"]),
        140,
      ) || null,
    reportTitle:
      cleanText(
        firstValue(record, ["reportTitle", "title", "reportName"]),
        180,
      ) || null,
    archiveStatus:
      cleanText(firstValue(record, ["archiveStatus", "archive_status"]), 80) ||
      null,
    killedWith:
      cleanText(
        firstValue(record, ["killedWith", "killDifficulty", "bracket"]),
        80,
      ) || null,
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
  options: Pick<WarcraftLogsSliceConfig, "role" | "metric"> & {
    limit?: number;
  },
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

function reportFightDuplicateKey(pull: WarcraftLogsBossPull) {
  if (!pull.reportCode || pull.reportFightId === null) return null;
  return [
    "report-fight",
    pull.reportCode,
    pull.reportFightId,
    pull.role || "role",
    pull.metric || "metric",
  ].join("|");
}

function pullTimeSecondKey(pull: WarcraftLogsBossPull) {
  const time = pullTimeMs(pull);
  return time > 0 ? String(Math.round(time / 1000)) : "no-time";
}

function factualDuplicateKey(pull: WarcraftLogsBossPull) {
  const time = pullTimeSecondKey(pull);
  const amount = roundedMetricAmount(pull.amount);
  const duration = roundedDurationSeconds(pull.durationMs);
  const state = normalizedKillState(pull.killedWith);
  if (
    time === "no-time" ||
    amount === "none" ||
    duration === "none" ||
    state === "unknown"
  )
    return null;
  return [
    "same-facts",
    pull.encounterId ?? normalizeNameKey(pull.encounterName),
    pull.role || "role",
    pull.metric || "metric",
    pull.difficulty ?? "difficulty",
    time,
    duration,
    amount,
    roundedMetricAmount(pull.totalAmount),
    pull.percentile !== null && pull.percentile !== undefined
      ? Math.round(pull.percentile * 100) / 100
      : "no-percentile",
    state,
  ].join("|");
}

function pullIdentity(pull: WarcraftLogsBossPull) {
  const reportFightKey = reportFightDuplicateKey(pull);
  if (reportFightKey) return reportFightKey;

  const factualKey = factualDuplicateKey(pull);
  if (factualKey) return factualKey;

  // WCL ranking JSON often gives only a calendar date for multiple pulls on
  // the same boss. Do not collapse those rows by date only: different HPS/DPS,
  // parse, duration or kill/wipe state must remain separate pulls.
  return [
    "loose-pull",
    pull.reportCode || "no-report",
    pull.startTime || pullDayKey(pull),
    pull.encounterId ?? normalizeNameKey(pull.encounterName),
    pull.difficulty ?? "difficulty",
    pull.role || "role",
    pull.metric || "metric",
    roundedDurationSeconds(pull.durationMs),
    roundedMetricAmount(pull.amount),
    roundedMetricAmount(pull.totalAmount),
    pull.percentile !== null && pull.percentile !== undefined
      ? Math.round(pull.percentile * 100) / 100
      : "no-percentile",
    normalizedKillState(pull.killedWith),
    pull.rank ?? "no-rank",
    pull.source,
  ].join(":");
}

function sameLoggedFight(
  left: WarcraftLogsBossPull,
  right: WarcraftLogsBossPull,
) {
  const leftKey = reportFightDuplicateKey(left);
  const rightKey = reportFightDuplicateKey(right);
  if (leftKey && rightKey) return leftKey === rightKey;
  if (
    left.reportCode &&
    right.reportCode &&
    left.reportCode === right.reportCode
  ) {
    return (
      left.startTime !== null &&
      right.startTime !== null &&
      left.startTime === right.startTime
    );
  }
  return false;
}

function enrichReportPullsWithRankings(
  reportPulls: WarcraftLogsBossPull[],
  encounterPulls: WarcraftLogsBossPull[],
) {
  if (!reportPulls.length)
    return mergePullList(encounterPulls, ENCOUNTER_HISTORY_LIMIT);

  return mergePullList(
    reportPulls.map((reportPull) => {
      const rankingPull = encounterPulls.find(
        (candidate) =>
          (sameLoggedFight(reportPull, candidate) ||
            areDuplicatePulls(reportPull, candidate) ||
            pullDuplicateSignature(reportPull) ===
              pullDuplicateSignature(candidate)) &&
          (candidate.metric || null) === (reportPull.metric || null) &&
          (candidate.role || null) === (reportPull.role || null),
      );
      return rankingPull ? mergePullData(reportPull, rankingPull) : reportPull;
    }),
    ENCOUNTER_HISTORY_LIMIT,
  );
}

function sortPullsByDate(pulls: WarcraftLogsBossPull[]) {
  return [...pulls].sort((left, right) => {
    const leftTime = left.startTime ? new Date(left.startTime).getTime() : 0;
    const rightTime = right.startTime ? new Date(right.startTime).getTime() : 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return (right.percentile ?? 0) - (left.percentile ?? 0);
  });
}

function mergePullList(
  pulls: WarcraftLogsBossPull[],
  limit = ENCOUNTER_HISTORY_LIMIT,
) {
  const byIdentity = new Map<string, WarcraftLogsBossPull>();
  for (const pull of pulls) {
    if (!isEligibleRaidBossPull(pull)) continue;
    const key = pullIdentity(pull);
    const existing = byIdentity.get(key);
    byIdentity.set(key, existing ? mergePullData(existing, pull) : pull);
  }

  const deduped = dedupeEquivalentPullsWithStats([...byIdentity.values()]);
  return sortPullsByDate(deduped.pulls).slice(0, limit);
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

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  const avg = average(values);
  if (avg === null || values.length < 2) return null;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

function consistencyScore(values: number[]) {
  const avg = average(values);
  const deviation = standardDeviation(values);
  if (avg === null || deviation === null || avg <= 0) return null;
  const coefficient = deviation / avg;
  return Math.max(0, Math.min(100, 100 - coefficient * 100));
}

function recentStats(pulls: WarcraftLogsBossPull[]): WarcraftLogsRecentStats {
  const sorted = [...pulls].sort((left, right) => {
    const leftTime = left.startTime ? new Date(left.startTime).getTime() : 0;
    const rightTime = right.startTime ? new Date(right.startTime).getTime() : 0;
    return rightTime - leftTime;
  });
  const recent = sorted.slice(0, RECENT_PULL_CALC_LIMIT);
  const countedPulls = sorted.filter(isEligibleRaidBossPull);
  const amountPulls = recent.filter(
    (pull) =>
      typeof pull.amount === "number" &&
      Number.isFinite(pull.amount) &&
      pull.amount > 0,
  );
  const amounts = amountPulls.map((pull) => pull.amount as number);
  const percentiles = recent
    .map((pull) => pull.percentile)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const durations = recent
    .map((pull) => pull.durationMs)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    );
  const bossPercentages = recent
    .map((pull) => pull.bossPercentage)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const fightPercentages = recent
    .map((pull) => pull.fightPercentage)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const weightedPulls = recent.filter(
    (pull) =>
      typeof pull.totalAmount === "number" &&
      Number.isFinite(pull.totalAmount) &&
      pull.totalAmount > 0 &&
      typeof (pull.activeTimeMs ?? pull.durationMs) === "number" &&
      Number.isFinite((pull.activeTimeMs ?? pull.durationMs) as number) &&
      ((pull.activeTimeMs ?? pull.durationMs) as number) > 0,
  );
  const totalAmount = weightedPulls.reduce(
    (sum, pull) => sum + (pull.totalAmount || 0),
    0,
  );
  const totalActiveTimeMs = weightedPulls.reduce(
    (sum, pull) => sum + ((pull.activeTimeMs ?? pull.durationMs) || 0),
    0,
  );
  const weightedAverageAmount =
    totalAmount > 0 && totalActiveTimeMs > 0
      ? totalAmount / (totalActiveTimeMs / 1000)
      : null;
  const arithmeticAverageAmount = average(amounts);
  const deathCount = countedPulls.reduce(
    (sum, pull) => sum + (pull.deathCount || 0),
    0,
  );
  const killCount = countedPulls.filter(
    (pull) => normalizedKillState(pull.killedWith) === "kill",
  ).length;
  const wipeCount = countedPulls.filter(
    (pull) => normalizedKillState(pull.killedWith) === "wipe",
  ).length;

  return {
    pullCount: countedPulls.length,
    sampleSize: amounts.length,
    maxAmount: amounts.length ? Math.max(...amounts) : null,
    minAmount: amounts.length ? Math.min(...amounts) : null,
    averageAmount: weightedAverageAmount ?? arithmeticAverageAmount,
    arithmeticAverageAmount,
    weightedAverageAmount,
    medianAmount: median(amounts),
    standardDeviationAmount: standardDeviation(amounts),
    consistencyScore: consistencyScore(amounts),
    totalAmount: totalAmount > 0 ? totalAmount : null,
    totalActiveTimeMs: totalActiveTimeMs > 0 ? totalActiveTimeMs : null,
    maxPercentile: percentiles.length ? Math.max(...percentiles) : null,
    averagePercentile: average(percentiles),
    medianPercentile: median(percentiles),
    averageDurationMs: average(durations),
    averageBossPercentage: average(bossPercentages),
    bestBossPercentage: bossPercentages.length
      ? Math.min(...bossPercentages)
      : null,
    averageFightPercentage: average(fightPercentages),
    deathCount,
    killCount,
    wipeCount,
    lastPullAt: sorted.find((pull) => pull.startTime)?.startTime ?? null,
  };
}

function difficultySummaries(
  pulls: WarcraftLogsBossPull[],
): WarcraftLogsDifficultySummary[] {
  const grouped = new Map<string, WarcraftLogsBossPull[]>();
  for (const pull of pulls) {
    const key = String(pull.difficulty ?? "unknown");
    const list = grouped.get(key) || [];
    list.push(pull);
    grouped.set(key, list);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const difficulty = key === "unknown" ? null : Number(key);
      const bosses = new Set(
        group.map((pull) => pull.encounterId ?? pull.encounterName),
      ).size;
      return {
        difficulty: Number.isFinite(difficulty) ? difficulty : null,
        difficultyLabel: difficultyLabel(
          Number.isFinite(difficulty) ? difficulty : null,
        ),
        bosses,
        pulls: group.length,
        recentStats: recentStats(group),
      };
    })
    .sort(
      (left, right) =>
        difficultyRank(right.difficulty) - difficultyRank(left.difficulty),
    );
}

function primaryDifficultyStats(
  pulls: WarcraftLogsBossPull[],
  metric?: WarcraftLogsMetricKey | null,
) {
  const cleanPulls = pulls.filter(isEligibleRaidBossPull);
  const primaryDifficulty = pickHighestDifficulty(cleanPulls, metric);
  const primaryPulls = pullsForPrimaryDifficulty(cleanPulls, primaryDifficulty);
  return {
    primaryDifficulty,
    primaryDifficultyLabel:
      primaryDifficulty !== null ? difficultyLabel(primaryDifficulty) : null,
    primaryPulls,
    difficultySummaries: difficultySummaries(cleanPulls),
    recentStats: recentStats(primaryPulls),
  };
}

type WarcraftLogsReportFightSeed = {
  reportCode: string;
  reportTitle: string | null;
  reportStartMs: number;
  zoneName: string | null;
  archiveStatus: string | null;
  fightId: number;
  encounterId: number;
  encounterName: string;
  difficulty: number | null;
  fightSize: number | null;
  averageItemLevel: number | null;
  bossPercentage: number | null;
  fightPercentage: number | null;
  durationMs: number;
  startOffsetMs: number;
  endOffsetMs: number;
  startTime: string | null;
  killedWith: string | null;
};

type WarcraftLogsReportPullsBySlice = Record<
  string,
  Record<string, WarcraftLogsBossPull[]>
>;

type WarcraftLogsReportPullsResult = {
  pullsBySlice: WarcraftLogsReportPullsBySlice;
  coverage: WarcraftLogsSourceCoverage;
};

function emptyReportPullsBySlice(): WarcraftLogsReportPullsBySlice {
  return {};
}

function emptySourceCoverage(
  overrides: Partial<WarcraftLogsSourceCoverage> = {},
): WarcraftLogsSourceCoverage {
  return {
    zoneRankingSlices: 0,
    encounterRankingSlices: 0,
    reportsChecked: 0,
    archivedReports: 0,
    rankedCharacters: 0,
    reportBossFightsChecked: 0,
    reportPullRows: 0,
    duplicatePullRows: 0,
    uniqueReportPullRows: 0,
    reportTableQueries: 0,
    reportTableFallbacks: 0,
    summaryTableRows: 0,
    deathTableRows: 0,
    rateLimitLimitPerHour: null,
    rateLimitPointsSpentThisHour: null,
    rateLimitPointsResetIn: null,
    roleTotals: { healer: 0, dps: 0, tank: 0 },
    skippedUnknownRole: 0,
    skippedMissingAmount: 0,
    durationMs: null,
    ...overrides,
  };
}

function emptyReportPullsResult(
  overrides: Partial<WarcraftLogsSourceCoverage> = {},
): WarcraftLogsReportPullsResult {
  return {
    pullsBySlice: emptyReportPullsBySlice(),
    coverage: emptySourceCoverage(overrides),
  };
}

function rateLimitSnapshotFromResponse(
  response: WarcraftLogsGraphqlResponse,
): WarcraftLogsRateLimitSnapshot {
  const rateLimit = asRecord(response.data?.rateLimitData);
  return {
    limitPerHour: firstInteger(rateLimit, ["limitPerHour", "limit_per_hour"]),
    pointsSpentThisHour: firstInteger(rateLimit, [
      "pointsSpentThisHour",
      "points_spent_this_hour",
    ]),
    pointsResetIn: firstInteger(rateLimit, [
      "pointsResetIn",
      "points_reset_in",
    ]),
  };
}

function sourceCoverageFromRateLimit(
  rateLimit: WarcraftLogsRateLimitSnapshot,
): Partial<WarcraftLogsSourceCoverage> {
  return {
    rateLimitLimitPerHour: rateLimit.limitPerHour,
    rateLimitPointsSpentThisHour: rateLimit.pointsSpentThisHour,
    rateLimitPointsResetIn: rateLimit.pointsResetIn,
  };
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

function realmSlugFromUnknown(value: unknown) {
  const record = asRecord(value);
  if (record) {
    return normalizeBattleNetRealmSlug(
      cleanText(
        firstValue(record, ["slug", "name", "realmSlug", "serverSlug"]),
        120,
      ),
    );
  }
  return normalizeBattleNetRealmSlug(cleanText(value, 120));
}

function actorRealmSlug(actor: Record<string, unknown>) {
  const direct = realmSlugFromUnknown(
    firstValue(actor, ["serverSlug", "realmSlug", "realm", "server"]),
  );
  if (direct) return direct;

  const server = asRecord(actor.server);
  const realm = asRecord(actor.realm);
  return realmSlugFromUnknown(server || realm || null);
}

function actorMatchesRealm(actor: Record<string, unknown>, realmSlug: string) {
  const server = actorRealmSlug(actor);
  return !server || !realmSlug || server === realmSlug;
}

function reportActorFromRecord(
  actor: Record<string, unknown>,
  id: number,
): WarcraftLogsReportActor {
  const spec = specFromRecord(actor);
  const rawSubType =
    cleanText(firstValue(actor, ["subType", "subtype"]), 80) || null;
  return {
    id,
    name: cleanText(firstValue(actor, ["name", "characterName"]), 120) || null,
    realmSlug: actorRealmSlug(actor) || null,
    role: roleFromRecord(actor),
    spec,
    rawSubType,
  };
}

function findReportActor(
  report: Record<string, unknown>,
  characterName: string,
  realmSlug: string,
) {
  const masterData = asRecord(report.masterData);
  const actors = Array.isArray(masterData?.actors) ? masterData.actors : [];
  const characterKey = normalizeNameKey(characterName);

  let fallback: WarcraftLogsReportActor | null = null;
  for (const item of actors) {
    const actor = asRecord(item);
    if (!actor) continue;
    if (
      normalizeNameKey(firstValue(actor, ["name", "characterName"])) !==
      characterKey
    )
      continue;

    const id = firstInteger(actor, ["id", "actorID", "sourceID"]);
    if (id === null) continue;
    const resolved = reportActorFromRecord(actor, id);
    if (actorMatchesRealm(actor, realmSlug)) return resolved;
    fallback = fallback ?? resolved;
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

  const reportStartMs = firstNumber(report, [
    "startTime",
    "start_time",
    "date",
    "timestamp",
  ]);
  if (reportStartMs === null) return null;

  const encounterId = firstInteger(record, [
    "encounterID",
    "encounterId",
    "originalEncounterID",
    "originalEncounterId",
  ]);
  if (!isRaidBossEncounterId(encounterId)) return null;

  const fightSize = firstInteger(record, ["size", "groupSize", "raidSize"]);
  const knownRaidBoss = knownBosses.has(encounterId);
  const raidSizedFight = fightSize === null || fightSize >= 10;
  if (!knownRaidBoss && !raidSizedFight) return null;

  const durationMs = durationMsFromRecord(record);
  if (durationMs === null || durationMs <= 0) return null;

  const fightId = firstInteger(record, ["id", "fightID", "fightId"]);
  if (fightId === null) return null;

  const startOffsetMs = firstNumber(record, [
    "startTime",
    "start_time",
    "start",
  ]);
  const endOffsetMs = firstNumber(record, ["endTime", "end_time", "end"]);
  if (
    startOffsetMs === null ||
    endOffsetMs === null ||
    endOffsetMs <= startOffsetMs
  )
    return null;

  const encounterName = encounterNameFromRecord(record);
  if (!encounterName) return null;

  const zone = asRecord(report.zone);
  const zoneName =
    cleanText(firstValue(zone, ["name", "zoneName"]), 140) || null;
  const reportTitle = cleanText(report.title, 180) || null;
  const archiveStatus =
    cleanText(firstValue(report, ["archiveStatus", "archive_status"]), 80) ||
    null;

  const kill =
    booleanOrNull(firstValue(record, ["kill", "isKill", "killed"])) ?? false;

  return {
    reportCode,
    reportTitle,
    reportStartMs,
    zoneName,
    archiveStatus,
    fightId,
    encounterId,
    encounterName,
    difficulty: difficultyFromRecord(record),
    fightSize,
    averageItemLevel: firstNumber(record, [
      "averageItemLevel",
      "average_ilvl",
      "averageIlvl",
    ]),
    bossPercentage: normalizeBossProgressPercent(
      firstValue(record, ["bossPercentage", "boss_percent", "bossPercent"]),
    ),
    fightPercentage: normalizeBossProgressPercent(
      firstValue(record, ["fightPercentage", "fight_percent", "fightPercent"]),
    ),
    durationMs,
    startOffsetMs,
    endOffsetMs,
    startTime: new Date(reportStartMs + startOffsetMs).toISOString(),
    killedWith: kill ? "Kill" : "Wipe",
  };
}

function reportFightSeeds(
  report: Record<string, unknown>,
  knownBosses: Set<number>,
  limit: number,
) {
  const fights = Array.isArray(report.fights) ? report.fights : [];
  return fights
    .map((fight) => normalizeReportFightSeed(report, fight, knownBosses))
    .filter((fight): fight is WarcraftLogsReportFightSeed => Boolean(fight))
    .sort(
      (left, right) =>
        right.reportStartMs +
        right.startOffsetMs -
        (left.reportStartMs + left.startOffsetMs),
    )
    .slice(0, limit);
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
      firstValue(record, ["sourceID", "sourceId", "name", "guid"]) !==
        undefined;

    if (looksLikeRow) rows.push(record);

    for (const nested of Object.values(record)) {
      if (Array.isArray(nested) || asRecord(nested)) stack.push(nested);
    }
  }

  return rows;
}

function rowMatchesReportActor(
  row: Record<string, unknown>,
  actor: WarcraftLogsReportActor,
) {
  const rowActorId = firstInteger(row, [
    "id",
    "sourceID",
    "sourceId",
    "actorID",
    "actorId",
    "guid",
  ]);
  if (rowActorId !== null && rowActorId === actor.id) return true;

  const rowName = normalizeNameKey(firstValue(row, ["name", "characterName"]));
  return Boolean(
    actor.name && rowName && rowName === normalizeNameKey(actor.name),
  );
}

function rowHasMetricSignal(
  row: Record<string, unknown>,
  metric: WarcraftLogsMetricKey,
) {
  return (
    firstNumber(row, directPerSecondKeys(metric)) !== null ||
    firstNumber(row, totalAmountKeys(metric)) !== null
  );
}

function sourceFilteredAggregateMeasure(
  value: unknown,
  metric: WarcraftLogsMetricKey,
  durationMs: number,
) {
  const root = parseMaybeJsonObject(value);
  if (!root) return null;
  const hasNestedRows =
    Array.isArray(root.entries) || Array.isArray(root.series);
  const hasAggregateSignal =
    rowHasMetricSignal(root, metric) ||
    firstNumber(root, ["totalTime", "activeTime", "duration", "durationMs"]) !==
      null;
  if (!hasNestedRows && !hasAggregateSignal) return null;

  const details = amountDetailsFromTableRow(root, metric, durationMs);
  if (details.amount === null) return null;
  return {
    amount: details.amount,
    totalAmount: details.totalAmount,
    activeTimeMs: details.activeTimeMs,
    role: roleFromRecord(root),
    spec: specFromRecord(root),
    confidence: 55,
    index: -1,
  };
}

function combatantInfoRows(value: unknown, actor: WarcraftLogsReportActor) {
  const root = parseMaybeJsonObject(value) || value;
  const rows: Record<string, unknown>[] = [];
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();

  while (stack.length && rows.length < 40) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    const rawData = record.data;
    const data = Array.isArray(rawData)
      ? rawData
      : parseMaybeJsonObject(rawData);
    if (data && data !== record) stack.push(data);

    if (
      specInfoFromRecord(record) ||
      firstInteger(record, [
        "specID",
        "specId",
        "currentSpecID",
        "currentSpecId",
      ]) !== null ||
      rowMatchesReportActor(record, actor)
    ) {
      rows.push(record);
    }

    for (const nested of Object.values(record)) {
      if (Array.isArray(nested) || asRecord(nested)) stack.push(nested);
    }
  }

  return rows;
}

function roleFromCombatantInfo(
  value: unknown,
  actor: WarcraftLogsReportActor,
): {
  role: WarcraftLogsConcreteRoleKey | null;
  spec: string | null;
  rowCount: number;
} {
  const rows = combatantInfoRows(value, actor);
  const actorRows = rows.filter((row) => rowMatchesReportActor(row, actor));
  const source = actorRows.length ? actorRows : rows.length === 1 ? rows : [];

  for (const row of source) {
    const byId = specInfoFromRecord(row);
    if (byId)
      return { role: byId.role, spec: byId.spec, rowCount: rows.length };
    const role = roleFromRecord(row);
    if (role) return { role, spec: specFromRecord(row), rowCount: rows.length };
  }

  return { role: null, spec: null, rowCount: rows.length };
}

function measureFromReportTable(
  value: unknown,
  metric: "hps" | "dps",
  durationMs: number,
  actor: WarcraftLogsReportActor,
): WarcraftLogsReportMeasure {
  const rows = collectTableRows(value);
  let fallbackRole: WarcraftLogsConcreteRoleKey | null = null;
  let fallbackSpec: string | null = null;
  const aggregate = sourceFilteredAggregateMeasure(value, metric, durationMs);

  const candidates = [
    ...(aggregate ? [aggregate] : []),
    ...rows.map((row, index) => {
      const role = roleFromRecord(row);
      const spec = specFromRecord(row);
      fallbackRole = fallbackRole || role;
      fallbackSpec = fallbackSpec || spec;
      const details = amountDetailsFromTableRow(row, metric, durationMs);
      if (details.amount === null || !rowHasMetricSignal(row, metric))
        return null;

      const actorMatch = rowMatchesReportActor(row, actor);
      const hasIdentity =
        firstInteger(row, [
          "id",
          "sourceID",
          "sourceId",
          "actorID",
          "actorId",
          "guid",
        ]) !== null ||
        Boolean(cleanText(firstValue(row, ["name", "characterName"]), 120));
      const confidence = actorMatch
        ? 100
        : !hasIdentity && rows.length === 1
          ? 40
          : 0;
      if (confidence <= 0) return null;

      return {
        amount: details.amount,
        totalAmount: details.totalAmount,
        activeTimeMs: details.activeTimeMs,
        role,
        spec,
        confidence,
        index,
      };
    }),
  ]
    .filter(
      (
        item,
      ): item is {
        amount: number;
        totalAmount: number | null;
        activeTimeMs: number | null;
        role: WarcraftLogsConcreteRoleKey | null;
        spec: string | null;
        confidence: number;
        index: number;
      } => Boolean(item),
    )
    .sort(
      (left, right) =>
        right.confidence - left.confidence || left.index - right.index,
    );

  const best = candidates[0] || null;
  if (best) {
    return {
      amount: best.amount,
      totalAmount: best.totalAmount,
      activeTimeMs: best.activeTimeMs,
      role: best.role,
      spec: best.spec,
      rowCount: rows.length,
    };
  }

  return {
    amount: null,
    totalAmount: null,
    activeTimeMs: null,
    role: fallbackRole,
    spec: fallbackSpec,
    rowCount: rows.length,
  };
}

function reportPullFromFight(
  fight: WarcraftLogsReportFightSeed,
  config: WarcraftLogsSliceConfig & {
    role: WarcraftLogsConcreteRoleKey;
    metric: "hps" | "dps";
  },
  measure: WarcraftLogsReportMeasure,
  baseUrl: string,
  roleResolution: WarcraftLogsReportRoleResolution,
  extras: {
    itemLevel: number | null;
    deathCount: number | null;
    interruptCount: number | null;
    dispelCount: number | null;
  },
): WarcraftLogsBossPull {
  const amount = measure.amount;
  return {
    encounterId: fight.encounterId,
    encounterName: fight.encounterName,
    role: config.role,
    spec: roleResolution.spec,
    metric: config.metric,
    difficulty: fight.difficulty,
    percentile: null,
    historicalPercentile: null,
    todayPercentile: null,
    rank: null,
    amount,
    totalAmount: measure.totalAmount,
    activeTimeMs: measure.activeTimeMs,
    damageDone: config.metric === "dps" ? measure.totalAmount : null,
    healingDone: config.metric === "hps" ? measure.totalAmount : null,
    deathCount: extras.deathCount,
    interruptCount: extras.interruptCount,
    dispelCount: extras.dispelCount,
    bossPercentage: fight.bossPercentage,
    fightPercentage: fight.fightPercentage,
    durationMs: fight.durationMs,
    itemLevel: extras.itemLevel ?? fight.averageItemLevel,
    totalParses: null,
    fightSize: fight.fightSize,
    zoneName: fight.zoneName,
    reportTitle: fight.reportTitle,
    archiveStatus: fight.archiveStatus,
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
  if (!isEligibleRaidBossPull(pull)) return { added: false, merged: false };
  const encounterKey = String(pull.encounterId);
  target[config.key] ||= {};
  target[config.key][encounterKey] ||= [];
  const list = target[config.key][encounterKey];
  const pullKey = pullIdentity(pull);
  const existingIndex = list.findIndex((item) => {
    const itemKey = pullIdentity(item);
    return itemKey === pullKey || areDuplicatePulls(item, pull);
  });
  if (existingIndex >= 0) {
    list[existingIndex] = preferNewerDuplicate(list[existingIndex], pull);
    return { added: false, merged: true };
  }
  list.push(pull);
  return { added: true, merged: false };
}

function recentReportsQuery(limit: number, enhanced = true) {
  const reportExtraFields = enhanced
    ? `\n          archiveStatus\n          region { id name compactName }\n          rankedCharacters { id canonicalID name classID level }`
    : "";
  const fightExtraFields = enhanced
    ? `\n            bossPercentage\n            fightPercentage\n            averageItemLevel`
    : "";

  return `query CharacterRecentRaidReports($name: String!, $serverSlug: String!, $serverRegion: String!) {
  rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
  characterData {
    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
      recentReports(limit: ${limit}) {
        data {
          code
          title
          startTime
          endTime${reportExtraFields}
          zone { id name }
          fights(killType: All) {
            id
            encounterID
            originalEncounterID
            name
            kill
            startTime
            endTime
            difficulty
            size${fightExtraFields}
          }
          masterData(translate: false) {
            actors(type: "Player") {
              id
              gameID
              server
              subType
              name
            }
          }
        }
      }
    }
  }
}`;
}

type WarcraftLogsReportTableQueryMode = "fightIDs" | "timeRange";

function reportTableArgs(
  dataType: "DamageDone" | "Healing" | "Summary" | "Deaths",
  fight: WarcraftLogsReportFightSeed,
  mode: WarcraftLogsReportTableQueryMode,
) {
  const common = [
    `dataType: ${dataType}`,
    "viewBy: Source",
    "sourceID: $sourceID",
  ];
  if (mode === "fightIDs") {
    const fightId = Math.max(0, Math.floor(fight.fightId));
    return [...common, `fightIDs: [${fightId}]`].join(", ");
  }

  const startTime = Math.max(0, Math.floor(fight.startOffsetMs));
  const endTime = Math.max(startTime + 1, Math.floor(fight.endOffsetMs));
  return [...common, `startTime: ${startTime}`, `endTime: ${endTime}`].join(
    ", ",
  );
}

function reportFightTablesQuery(
  fights: WarcraftLogsReportFightSeed[],
  enhanced = true,
  mode: WarcraftLogsReportTableQueryMode = "fightIDs",
) {
  const fields = fights
    .map((fight, index) => {
      const baseFields = [
        `    d${index}: table(${reportTableArgs("DamageDone", fight, mode)})`,
        `    h${index}: table(${reportTableArgs("Healing", fight, mode)})`,
      ];

      if (!enhanced) return baseFields.join("\n");

      const eventStart = Math.max(0, Math.floor(fight.startOffsetMs));
      const eventEnd = Math.max(eventStart + 1, Math.floor(fight.endOffsetMs));
      return [
        ...baseFields,
        `    s${index}: table(${reportTableArgs("Summary", fight, mode)})`,
        `    x${index}: table(${reportTableArgs("Deaths", fight, mode)})`,
        `    c${index}: events(dataType: CombatantInfo, sourceID: $sourceID, startTime: ${eventStart}, endTime: ${eventEnd}) { data nextPageTimestamp }`,
      ].join("\n");
    })
    .join("\n");

  return `query ReportCharacterBossTables($code: String!, $sourceID: Int!) {
  rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
  reportData {
    report(code: $code) {
      code
      title
      startTime
      endTime
      archiveStatus
      zone { id name }
${fields}
    }
  }
}`;
}

async function fetchRecentReportRecords(input: {
  credentials: WarcraftLogsApiCredentials;
  token: string;
  name: string;
  realmSlug: string;
  region: string;
}) {
  async function request(enhanced: boolean) {
    return apiFetchJson<WarcraftLogsGraphqlResponse>(
      `${input.credentials.baseUrl}/api/v2/client`,
      {
        method: "POST",
        label: `Warcraft Logs recent reports ${input.name}${enhanced ? " enhanced" : " basic"}`,
        timeoutMs: warcraftLogsTimeoutMs(),
        retries: warcraftLogsRetryCount(),
        retryMethods: ["POST"],
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: recentReportsQuery(
            warcraftLogsRecentReportLimit(input.credentials),
            enhanced,
          ),
          variables: {
            name: input.name,
            serverSlug: input.realmSlug,
            serverRegion: input.region,
          },
        }),
        cache: "no-store",
      },
    );
  }

  let enhanced = true;
  let response = await request(true);
  let fallbackUsed = false;
  if (response.errors?.length) {
    fallbackUsed = true;
    enhanced = false;
    response = await request(false);
  }

  const character = response.data?.characterData?.character || null;
  const reports = response.errors?.length
    ? []
    : reportPaginationData(character)
        .map((report) => asRecord(report))
        .filter((report): report is Record<string, unknown> => Boolean(report));

  warcraftLogsDebugAudit(
    input.credentials,
    "warcraft_logs.api.recent_reports_response",
    {
      summary: `WCL recent reports: ${input.name} — ${reports.length} reports`,
      character: input.name,
      realmSlug: input.realmSlug,
      region: input.region,
      enhanced,
      fallbackUsed,
      reportCount: reports.length,
      errors:
        response.errors
          ?.map((item) => cleanText(item.message, 240))
          .filter(Boolean) || [],
      responsePreview: compactForLog(response),
    },
  );

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

  type ReportTableAttempt = {
    enhanced: boolean;
    mode: WarcraftLogsReportTableQueryMode;
  };
  type ReportTableResponse = {
    data?: {
      reportData?: { report?: Record<string, unknown> | null } | null;
    } | null;
    errors?: Array<{ message?: string }>;
  };

  async function request(attempt: ReportTableAttempt) {
    return apiFetchJson<ReportTableResponse>(
      `${input.credentials.baseUrl}/api/v2/client`,
      {
        method: "POST",
        label: `Warcraft Logs report boss tables ${input.reportCode} ${attempt.mode}${attempt.enhanced ? " enhanced" : " basic"}`,
        timeoutMs: warcraftLogsTimeoutMs(),
        retries: warcraftLogsRetryCount(),
        retryMethods: ["POST"],
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: reportFightTablesQuery(
            input.fights,
            attempt.enhanced,
            attempt.mode,
          ),
          variables: {
            code: input.reportCode,
            sourceID: input.sourceId,
          },
        }),
        cache: "no-store",
      },
    );
  }

  const attempts: ReportTableAttempt[] = [
    // Fight IDs are the documented and stable way to query per-pull tables after
    // report.fights. Time-range fallbacks were removed because they can overlap
    // neighbouring pulls and create duplicate-looking rows for the same boss.
    { enhanced: true, mode: "fightIDs" },
    { enhanced: false, mode: "fightIDs" },
  ];
  const attemptErrors: Array<{
    enhanced: boolean;
    mode: string;
    errors: string[];
  }> = [];
  let response: ReportTableResponse | null = null;
  let selectedAttempt: ReportTableAttempt | null = null;

  for (const attempt of attempts) {
    const next = await request(attempt);
    const errors =
      next.errors
        ?.map((item) => cleanText(item.message, 240))
        .filter(Boolean) || [];
    if (!errors.length) {
      response = next;
      selectedAttempt = attempt;
      break;
    }
    attemptErrors.push({
      enhanced: attempt.enhanced,
      mode: attempt.mode,
      errors,
    });
    response = next;
    selectedAttempt = attempt;
  }

  const report = response?.errors?.length
    ? null
    : response?.data?.reportData?.report || null;
  const enhanced = selectedAttempt?.enhanced ?? false;
  const tableMode = selectedAttempt?.mode ?? "fightIDs";
  const fallbackUsed =
    selectedAttempt !== null &&
    (selectedAttempt.mode !== "fightIDs" || !selectedAttempt.enhanced);

  warcraftLogsDebugAudit(
    input.credentials,
    "warcraft_logs.api.report_tables_response",
    {
      summary: `WCL report tables: ${input.reportCode} — ${input.fights.length} fights`,
      reportCode: input.reportCode,
      sourceId: input.sourceId,
      fightCount: input.fights.length,
      enhanced,
      tableMode,
      fallbackUsed,
      attemptedFallbacks: attemptErrors,
      tableKeys: report
        ? Object.keys(report)
            .filter((key) => /^(d|h|s|x)\d+$/.test(key))
            .slice(0, 80)
        : [],
      errors:
        response?.errors
          ?.map((item) => cleanText(item.message, 240))
          .filter(Boolean) || [],
      responsePreview: compactForLog(response),
    },
  );

  return { report, enhanced, fallbackUsed, tableMode };
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

  try {
    const reports = await fetchRecentReportRecords(input);
    const startedAt = Date.now();

    const mapped = await mapConcurrentSettled(
      reports,
      async (report) => {
        const actor = findReportActor(report, input.name, input.realmSlug);
        if (!actor) {
          return {
            reportCode: cleanText(report.code, 80) || null,
            skipped: "actor_not_found",
            fightCount: 0,
            actor: null as WarcraftLogsReportActor | null,
            roleCounts: {} as Record<WarcraftLogsConcreteRoleKey, number>,
            skippedUnknownRole: 0,
            skippedMissingAmount: 0,
            roleSamples: [] as Array<Record<string, unknown>>,
            pulls: [] as Array<{
              config: WarcraftLogsSliceConfig & {
                role: WarcraftLogsConcreteRoleKey;
                metric: "hps" | "dps";
              };
              pull: WarcraftLogsBossPull;
            }>,
          };
        }

        const fights = reportFightSeeds(
          report,
          knownBosses,
          warcraftLogsReportFightTableLimit(input.credentials),
        );
        if (!fights.length) {
          return {
            reportCode: cleanText(report.code, 80) || null,
            skipped: "no_known_raid_boss_fights",
            fightCount: 0,
            actor: actor ?? null,
            roleCounts: {} as Record<WarcraftLogsConcreteRoleKey, number>,
            skippedUnknownRole: 0,
            skippedMissingAmount: 0,
            roleSamples: [] as Array<Record<string, unknown>>,
            pulls: [] as Array<{
              config: WarcraftLogsSliceConfig & {
                role: WarcraftLogsConcreteRoleKey;
                metric: "hps" | "dps";
              };
              pull: WarcraftLogsBossPull;
            }>,
          };
        }

        const reportCode = cleanText(report.code, 80);
        if (!reportCode) {
          return {
            reportCode: null,
            skipped: "missing_report_code",
            fightCount: 0,
            actor: actor ?? null,
            roleCounts: {} as Record<WarcraftLogsConcreteRoleKey, number>,
            skippedUnknownRole: 0,
            skippedMissingAmount: 0,
            roleSamples: [] as Array<Record<string, unknown>>,
            pulls: [] as Array<{
              config: WarcraftLogsSliceConfig & {
                role: WarcraftLogsConcreteRoleKey;
                metric: "hps" | "dps";
              };
              pull: WarcraftLogsBossPull;
            }>,
          };
        }

        const tableResult = await fetchReportFightTables({
          credentials: input.credentials,
          token: input.token,
          reportCode,
          sourceId: actor.id,
          fights,
        });
        if (!tableResult?.report) {
          return {
            reportCode,
            skipped: "table_response_empty",
            fightCount: 0,
            actor: actor ?? null,
            roleCounts: {} as Record<WarcraftLogsConcreteRoleKey, number>,
            skippedUnknownRole: 0,
            skippedMissingAmount: 0,
            roleSamples: [] as Array<Record<string, unknown>>,
            pulls: [] as Array<{
              config: WarcraftLogsSliceConfig & {
                role: WarcraftLogsConcreteRoleKey;
                metric: "hps" | "dps";
              };
              pull: WarcraftLogsBossPull;
            }>,
          };
        }

        const tables = tableResult.report;
        let summaryRows = 0;
        let deathRows = 0;

        const pulls: Array<{
          config: WarcraftLogsSliceConfig & {
            role: WarcraftLogsConcreteRoleKey;
            metric: "hps" | "dps";
          };
          pull: WarcraftLogsBossPull;
        }> = [];
        const roleCounts: Record<WarcraftLogsConcreteRoleKey, number> = {
          healer: 0,
          dps: 0,
          tank: 0,
        };
        let skippedUnknownRole = 0;
        let skippedMissingAmount = 0;
        const roleSamples: Array<Record<string, unknown>> = [];

        for (const [index, fight] of fights.entries()) {
          const damage = measureFromReportTable(
            tables[`d${index}`],
            "dps",
            fight.durationMs,
            actor,
          );
          const healing = measureFromReportTable(
            tables[`h${index}`],
            "hps",
            fight.durationMs,
            actor,
          );
          const summaryStats = summaryStatsFromReportTable(
            tables[`s${index}`],
            actor,
          );
          const deathStats = deathCountFromReportTable(
            tables[`x${index}`],
            actor,
          );
          const combatantInfo = roleFromCombatantInfo(
            tables[`c${index}`],
            actor,
          );
          summaryRows += summaryStats.rowCount + combatantInfo.rowCount;
          deathRows += deathStats.rowCount;
          const roleResolution = resolveReportFightRole({
            actor,
            combatantInfo,
            damage: {
              ...damage,
              role: damage.role || summaryStats.role,
              spec: damage.spec || summaryStats.spec || combatantInfo.spec,
            },
            healing: {
              ...healing,
              role: healing.role || summaryStats.role,
              spec: healing.spec || summaryStats.spec || combatantInfo.spec,
            },
          });

          if (roleResolution.role) {
            roleCounts[roleResolution.role] += 1;
          } else {
            skippedUnknownRole += 1;
            roleSamples.push({
              reportCode,
              fightId: fight.fightId,
              encounterId: fight.encounterId,
              encounterName: fight.encounterName,
              reason: "unknown_role",
              actorSpec: actor.spec,
              actorRawSubType: actor.rawSubType,
              damageRows: damage.rowCount,
              healingRows: healing.rowCount,
              damageRole: damage.role,
              healingRole: healing.role,
              damageSpec: damage.spec,
              healingSpec: healing.spec,
              combatantRole: combatantInfo.role,
              combatantSpec: combatantInfo.spec,
              combatantRows: combatantInfo.rowCount,
            });
            continue;
          }

          const matchingConfigs = WCL_SLICES.filter(
            (
              config,
            ): config is WarcraftLogsSliceConfig & {
              role: WarcraftLogsConcreteRoleKey;
              metric: "hps" | "dps";
            } =>
              isReportMetricSlice(config) &&
              config.role === roleResolution.role,
          );

          for (const config of matchingConfigs) {
            const measure = config.metric === "hps" ? healing : damage;
            if (measure.amount === null) skippedMissingAmount += 1;

            pulls.push({
              config,
              pull: reportPullFromFight(
                fight,
                config,
                measure,
                input.credentials.baseUrl,
                roleResolution,
                {
                  itemLevel: summaryStats.itemLevel,
                  deathCount: deathStats.count ?? summaryStats.deathCount,
                  interruptCount: summaryStats.interruptCount,
                  dispelCount: summaryStats.dispelCount,
                },
              ),
            });
          }

          if (roleSamples.length < 24) {
            roleSamples.push({
              reportCode,
              fightId: fight.fightId,
              encounterId: fight.encounterId,
              encounterName: fight.encounterName,
              role: roleResolution.role,
              roleSource: roleResolution.source,
              spec: roleResolution.spec,
              emittedMetrics: matchingConfigs
                .filter(
                  (config) =>
                    (config.metric === "hps"
                      ? healing.amount
                      : damage.amount) !== null,
                )
                .map((config) => config.key),
              damageAmount: damage.amount,
              healingAmount: healing.amount,
              damageTotal: damage.totalAmount,
              healingTotal: healing.totalAmount,
              deathCount: deathStats.count ?? summaryStats.deathCount,
              interruptCount: summaryStats.interruptCount,
              dispelCount: summaryStats.dispelCount,
              bossPercentage: fight.bossPercentage,
              fightPercentage: fight.fightPercentage,
              damageRole: damage.role,
              healingRole: healing.role,
              damageSpec: damage.spec,
              healingSpec: healing.spec,
              combatantRole: combatantInfo.role,
              combatantSpec: combatantInfo.spec,
              combatantRows: combatantInfo.rowCount,
            });
          }
        }

        return {
          reportCode,
          skipped: null,
          actor,
          fightCount: fights.length,
          roleCounts,
          skippedUnknownRole,
          skippedMissingAmount,
          roleSamples,
          tableQueries: tableResult ? 1 : 0,
          tableFallbacks: tableResult?.fallbackUsed ? 1 : 0,
          summaryRows,
          deathRows,
          archived: Boolean(fights.some((fight) => fight.archiveStatus)),
          rankedCharacters: Array.isArray(report.rankedCharacters)
            ? report.rankedCharacters.length
            : 0,
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
    let reportPullRows = 0;
    let duplicatePullRows = 0;
    let reportBossFightsChecked = 0;
    let archivedReports = 0;
    let rankedCharacters = 0;
    let reportTableQueries = 0;
    let reportTableFallbacks = 0;
    let summaryTableRows = 0;
    let deathTableRows = 0;
    const roleTotals: Record<WarcraftLogsConcreteRoleKey, number> = {
      healer: 0,
      dps: 0,
      tank: 0,
    };
    let skippedUnknownRole = 0;
    let skippedMissingAmount = 0;
    const roleSamples: Array<Record<string, unknown>> = [];

    for (const item of mapped.results) {
      if (!item.ok) continue;
      const itemValue = item.value as typeof item.value &
        Partial<{
          tableQueries: number;
          tableFallbacks: number;
          summaryRows: number;
          deathRows: number;
          archived: boolean;
          rankedCharacters: number;
        }>;
      roleTotals.healer += itemValue.roleCounts.healer || 0;
      roleTotals.dps += itemValue.roleCounts.dps || 0;
      roleTotals.tank += itemValue.roleCounts.tank || 0;
      skippedUnknownRole += itemValue.skippedUnknownRole || 0;
      skippedMissingAmount += itemValue.skippedMissingAmount || 0;
      reportBossFightsChecked += itemValue.fightCount || 0;
      archivedReports += itemValue.archived ? 1 : 0;
      rankedCharacters += itemValue.rankedCharacters || 0;
      reportTableQueries += itemValue.tableQueries || 0;
      reportTableFallbacks += itemValue.tableFallbacks || 0;
      summaryTableRows += itemValue.summaryRows || 0;
      deathTableRows += itemValue.deathRows || 0;
      roleSamples.push(
        ...itemValue.roleSamples.slice(0, Math.max(0, 30 - roleSamples.length)),
      );

      for (const entry of itemValue.pulls) {
        reportPullRows += 1;
        const outcome = addReportPull(result, entry.config, entry.pull);
        if (outcome.added) producedPulls += 1;
        if (outcome.merged) duplicatePullRows += 1;
      }
    }

    warcraftLogsDebugAudit(
      input.credentials,
      "warcraft_logs.parser.recent_raid_boss_pulls",
      {
        summary: `WCL parser: ${input.name} — ${producedPulls} report pull rows`,
        character: input.name,
        realmSlug: input.realmSlug,
        region: input.region,
        reportsChecked: reports.length,
        knownBosses: knownBosses.size,
        producedPullRows: reportPullRows,
        duplicatePullRows,
        uniqueReportPullRows: producedPulls,
        reportBossFightsChecked,
        archivedReports,
        rankedCharacters,
        reportTableQueries,
        reportTableFallbacks,
        summaryTableRows,
        deathTableRows,
        roleTotals,
        skippedUnknownRole,
        skippedMissingAmount,
        roleSamples,
        durationMs: Date.now() - startedAt,
        concurrency: mapped.meta.concurrency,
        failedReports: mapped.meta.failed,
        reportResults: mapped.results.map((item) =>
          item.ok
            ? {
                ok: true,
                reportCode: item.value.reportCode,
                skipped: item.value.skipped,
                actor: item.value.actor
                  ? {
                      id: item.value.actor.id,
                      name: item.value.actor.name,
                      realmSlug: item.value.actor.realmSlug,
                      spec: item.value.actor.spec,
                      role: item.value.actor.role,
                      rawSubType: item.value.actor.rawSubType,
                    }
                  : null,
                fightCount: item.value.fightCount || 0,
                roleCounts: item.value.roleCounts,
                skippedUnknownRole: item.value.skippedUnknownRole,
                skippedMissingAmount: item.value.skippedMissingAmount,
                producedPulls: item.value.pulls.length,
              }
            : {
                ok: false,
                reportCode: cleanText(item.item.code, 80) || null,
                error:
                  item.error instanceof Error
                    ? item.error.message
                    : String(item.error || "unknown"),
              },
        ),
      },
    );

    return {
      pullsBySlice: result,
      coverage: emptySourceCoverage({
        reportsChecked: reports.length,
        reportBossFightsChecked,
        reportPullRows,
        duplicatePullRows,
        uniqueReportPullRows: producedPulls,
        archivedReports,
        rankedCharacters,
        reportTableQueries,
        reportTableFallbacks,
        summaryTableRows,
        deathTableRows,
        roleTotals,
        skippedUnknownRole,
        skippedMissingAmount,
        durationMs: Date.now() - startedAt,
      }),
    };
  } catch (error) {
    warcraftLogsDebugAudit(
      input.credentials,
      "warcraft_logs.parser.recent_raid_boss_pulls_failed",
      {
        status: "warning",
        summary: `WCL parser failed: ${input.name}`,
        character: input.name,
        realmSlug: input.realmSlug,
        region: input.region,
        error:
          error instanceof Error ? error.message : String(error || "unknown"),
      },
    );
    return emptyReportPullsResult();
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

  return enrichReportPullsWithRankings(reportPulls, encounterPulls);
}


function rankingCompletenessScore(ranking: WarcraftLogsEncounterRanking): number {
  const values: unknown[] = [
    ranking.percentile,
    ranking.medianPercentile,
    ranking.rankPercent,
    ranking.bestAmount,
    ranking.totalKills,
    ranking.fastestKillMs,
    ranking.allStarsPoints,
    ranking.allStarsRank,
    ranking.reportCode,
    ranking.startTime,
  ];
  return values.reduce<number>(
    (score, value) =>
      score + (value !== null && value !== undefined && value !== "" ? 1 : 0),
    0,
  );
}

function dedupeRankingsByBossDifficulty(rankings: WarcraftLogsEncounterRanking[]) {
  const byKey = new Map<string, WarcraftLogsEncounterRanking>();
  for (const ranking of rankings) {
    const key = [
      ranking.encounterId ?? normalizeNameKey(ranking.encounterName),
      ranking.role || "role",
      ranking.metric || "metric",
      ranking.difficulty ?? "difficulty",
    ].join("|");
    const existing = byKey.get(key);
    if (!existing || rankingCompletenessScore(ranking) > rankingCompletenessScore(existing)) {
      byKey.set(key, ranking);
    }
  }
  return [...byKey.values()].sort((left, right) => {
    const difficultyDelta = difficultyRank(right.difficulty) - difficultyRank(left.difficulty);
    if (difficultyDelta) return difficultyDelta;
    return left.encounterName.localeCompare(right.encounterName, "uk");
  });
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
    const primary = primaryDifficultyStats(pulls, config.metric);
    const rankingDifficultyMatches =
      primary.primaryDifficulty === null ||
      ranking.difficulty === primary.primaryDifficulty;
    const sortedByPercent = [...primary.primaryPulls].sort(
      (left, right) => (right.percentile ?? -1) - (left.percentile ?? -1),
    );
    const bestPull = sortedByPercent[0] || null;
    return {
      ...ranking,
      bestPercentile:
        bestPull?.percentile ??
        (rankingDifficultyMatches ? ranking.percentile : null),
      todayPercentile:
        bestPull?.todayPercentile ??
        (rankingDifficultyMatches
          ? (ranking.rankPercent ?? ranking.percentile)
          : null),
      primaryDifficulty: primary.primaryDifficulty,
      primaryDifficultyLabel: primary.primaryDifficultyLabel,
      difficultySummaries: primary.difficultySummaries,
      recentStats: primary.recentStats,
      pulls,
    };
  });
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
  const rankings = dedupeRankingsByBossDifficulty(
    collectEncounterRankings(
      root?.rankings ||
        root?.encounterRankings ||
        root?.encounters ||
        root?.bosses ||
        root ||
        [],
      baseUrl,
      { role: config.role, metric: config.metric, limit: 64 },
    ),
  );
  const bossRankings = normalizeBossSummaries(
    rankings,
    encounterRankingsById,
    reportPullsById,
    config,
    baseUrl,
  );
  const pulls = mergePullList(
    bossRankings.flatMap((boss) => boss.pulls),
    Number.MAX_SAFE_INTEGER,
  );
  const primary = primaryDifficultyStats(pulls, config.metric);
  const rootBestAverage = firstNumber(root, [
    "bestPerformanceAverage",
    "bestPerfAvg",
    "bestAverage",
    "best",
  ]);
  const rootMedianAverage = firstNumber(root, [
    "medianPerformanceAverage",
    "medianPerfAvg",
    "medianAverage",
    "median",
  ]);
  const calculatedAveragePercentile =
    primary.recentStats.averagePercentile ?? null;
  const calculatedMedianPercentile =
    primary.recentStats.medianPercentile ?? null;

  return {
    key: config.key,
    role: config.role,
    roleLabel: config.roleLabel,
    metric: config.metric,
    metricLabel: config.metricLabel,
    title: config.title,
    description: config.description,
    sourceLabel: config.sourceLabel,
    bestPerformanceAverage:
      primary.primaryDifficulty !== null
        ? calculatedAveragePercentile
        : rootBestAverage,
    medianPerformanceAverage:
      primary.primaryDifficulty !== null
        ? calculatedMedianPercentile
        : rootMedianAverage,
    allStarsPoints: firstNumber(allStars, [
      "points",
      "score",
      "amount",
      "rank",
    ]),
    allStarsRank: firstInteger(allStars, ["rank", "worldRank", "regionRank"]),
    primaryDifficulty: primary.primaryDifficulty,
    primaryDifficultyLabel: primary.primaryDifficultyLabel,
    difficultySummaries: primary.difficultySummaries,
    recentStats: primary.recentStats,
    encounterRankings: rankings,
    bossRankings,
  };
}

function graphqlStringLiteral(value: string) {
  return JSON.stringify(value);
}

function zoneDifficultyAlias(
  config: WarcraftLogsSliceConfig,
  difficulty: WarcraftLogsTrackedDifficulty,
) {
  return `${config.zoneAlias}${WCL_RAID_DIFFICULTIES.find((item) => item.id === difficulty)?.aliasSuffix || difficulty}`;
}

function annotateDifficulty(value: unknown, difficulty: number): unknown {
  const root = parseMaybeJsonObject(value);
  if (!root) return null;

  function walk(current: unknown): unknown {
    if (Array.isArray(current)) return current.map(walk);
    const record = asRecord(current);
    if (!record) return current;

    const copy: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      copy[key] = walk(nested);
    }
    if (difficultyFromRecord(copy) === null) copy.difficulty = difficulty;
    return copy;
  }

  return walk(cloneJsonValue(root));
}

function combineRankingValues(values: unknown[]) {
  const rankings = values
    .map((value) => parseMaybeJsonObject(value))
    .filter((value): value is Record<string, unknown> => Boolean(value));
  if (!rankings.length) return null;
  if (rankings.length === 1) return rankings[0];
  return { rankings };
}

function appendCombinedRankingValue(existing: unknown, value: unknown) {
  const next = parseMaybeJsonObject(value);
  if (!next) return existing;
  const current = parseMaybeJsonObject(existing);
  if (!current) return { rankings: [next] };
  const currentRankings = Array.isArray(current.rankings)
    ? current.rankings
    : [current];
  return { rankings: [...currentRankings, next] };
}

function zoneRankingsField(
  config: WarcraftLogsSliceConfig,
  options: {
    includeRoleArg: boolean;
    includeDifficultyArg: boolean;
    difficulty?: WarcraftLogsTrackedDifficulty;
  },
) {
  const args = [] as string[];
  if (options.includeDifficultyArg && options.difficulty) {
    args.push(`difficulty: ${options.difficulty}`);
  }
  if (config.graphqlMetric) args.push(`metric: ${config.graphqlMetric}`);
  if (options.includeRoleArg && config.graphqlRole) {
    args.push(`role: ${graphqlStringLiteral(config.graphqlRole)}`);
  }

  const alias = options.difficulty
    ? zoneDifficultyAlias(config, options.difficulty)
    : config.zoneAlias;
  return `${alias}: zoneRankings${args.length ? `(${args.join(", ")})` : ""}`;
}

function zoneRankingsQuery(options: {
  includeRoleArg: boolean;
  includeDifficultyArg: boolean;
}) {
  const fields = WCL_SLICES.flatMap((config) => {
    if (!options.includeDifficultyArg)
      return [zoneRankingsField(config, options)];
    return WCL_RAID_DIFFICULTIES.map((difficulty) =>
      zoneRankingsField(config, {
        ...options,
        difficulty: difficulty.id,
      }),
    );
  })
    .map((field) => `      ${field}`)
    .join("\n");

  return `query CharacterZoneRankings($name: String!, $serverSlug: String!, $serverRegion: String!) {
  rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
  characterData {
    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
      id
      canonicalID
      name
      classID
${fields}
    }
  }
}`;
}

function chooseZoneValue(
  character: Record<string, unknown>,
  config: WarcraftLogsSliceConfig,
) {
  const difficultyValues = WCL_RAID_DIFFICULTIES.map((difficulty) => {
    const value = character[zoneDifficultyAlias(config, difficulty.id)];
    return value === undefined || value === null
      ? null
      : annotateDifficulty(value, difficulty.id);
  }).filter(Boolean);

  if (difficultyValues.length) return combineRankingValues(difficultyValues);
  return character[config.zoneAlias];
}

function rankingDifficulties(summary: WarcraftLogsMetricSummary) {
  const difficulties = new Set<WarcraftLogsTrackedDifficulty>();
  for (const ranking of summary.encounterRankings) {
    if (WCL_RAID_DIFFICULTIES.some((item) => item.id === ranking.difficulty)) {
      difficulties.add(ranking.difficulty as WarcraftLogsTrackedDifficulty);
    }
  }
  for (const difficulty of summary.difficultySummaries) {
    if (
      WCL_RAID_DIFFICULTIES.some((item) => item.id === difficulty.difficulty)
    ) {
      difficulties.add(difficulty.difficulty as WarcraftLogsTrackedDifficulty);
    }
  }
  if (difficulties.size) return [...difficulties];
  return WCL_RAID_DIFFICULTIES.map((difficulty) => difficulty.id);
}

function encounterRankingArgs(
  config: WarcraftLogsSliceConfig,
  encounterId: number,
  options: {
    includeRoleArg: boolean;
    includeDifficultyArg: boolean;
    difficulty?: WarcraftLogsTrackedDifficulty;
  },
) {
  const args = [`encounterID: ${encounterId}`];
  if (options.includeDifficultyArg && options.difficulty) {
    args.push(`difficulty: ${options.difficulty}`);
  }
  if (config.graphqlMetric) args.push(`metric: ${config.graphqlMetric}`);
  if (options.includeRoleArg && config.graphqlRole) {
    args.push(`role: ${graphqlStringLiteral(config.graphqlRole)}`);
  }
  return args.join(", ");
}

function bossHistoryQuery(
  metricSummaries: WarcraftLogsMetricSummary[],
  options: { includeRoleArg: boolean; includeDifficultyArg: boolean },
) {
  const seenJobs = new Set<string>();
  const jobs = metricSummaries.flatMap((summary) => {
    const config = WCL_SLICES.find((slice) => slice.key === summary.key);
    if (!config) return [];
    return summary.encounterRankings
      .filter(
        (
          ranking,
        ): ranking is WarcraftLogsEncounterRanking & { encounterId: number } =>
          isRaidBossEncounterId(ranking.encounterId),
      )
      .slice(0, ENCOUNTER_HISTORY_BOSS_LIMIT)
      .flatMap((ranking) => {
        const difficulties = options.includeDifficultyArg
          ? rankingDifficulties(summary)
          : [undefined];
        return difficulties.flatMap((difficulty) => {
          const key = `${config.key}:${ranking.encounterId}:${difficulty ?? "any"}`;
          if (seenJobs.has(key)) return [];
          seenJobs.add(key);
          return [{ config, ranking, difficulty }];
        });
      });
  });

  if (!jobs.length) return null;

  const fields = jobs
    .map(
      ({ config, ranking, difficulty }, index) =>
        `    h${index}: encounterRankings(${encounterRankingArgs(config, ranking.encounterId, { ...options, difficulty })})`,
    )
    .join("\n");

  return {
    jobs,
    query: `query CharacterEncounterHistory($name: String!, $serverSlug: String!, $serverRegion: String!) {
  characterData {
    character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
${fields}
    }
  }
}`,
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
  type EncounterHistoryResult = {
    mapped: Record<string, Record<string, unknown>>;
    errors: string[];
  };
  type EncounterHistoryAttempt = {
    includeRoleArg: boolean;
    includeDifficultyArg: boolean;
    label: string;
  };

  const attempts: EncounterHistoryAttempt[] = [
    // Keep the same role+difficulty contract as Warcraft Logs rankings.
    // Falling back to no-role/no-difficulty mixes specs and is the main source
    // of duplicate bosses and wrong HPS/DPS attribution.
    {
      includeRoleArg: true,
      includeDifficultyArg: true,
      label: "role+difficulty",
    },
  ];

  async function request(
    built: NonNullable<ReturnType<typeof bossHistoryQuery>>,
    attempt: EncounterHistoryAttempt,
  ): Promise<EncounterHistoryResult> {
    const response = await apiFetchJson<WarcraftLogsGraphqlResponse>(
      `${input.credentials.baseUrl}/api/v2/client`,
      {
        method: "POST",
        label: `Warcraft Logs encounter history ${input.name} ${attempt.label}`,
        timeoutMs: warcraftLogsTimeoutMs(),
        retries: warcraftLogsRetryCount(),
        retryMethods: ["POST"],
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/json",
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

    const errors =
      response.errors
        ?.map((item) => cleanText(item.message, 240))
        .filter(Boolean) || [];
    const character = response.data?.characterData?.character || null;
    const mapped =
      !errors.length && character
        ? built.jobs.reduce<Record<string, Record<string, unknown>>>(
            (acc, job, index) => {
              if (job.ranking.encounterId !== null) {
                const raw = character[`h${index}`];
                const annotated =
                  job.difficulty !== undefined
                    ? annotateDifficulty(raw, job.difficulty)
                    : raw;
                acc[job.config.key] ||= {};
                const encounterKey = String(job.ranking.encounterId);
                acc[job.config.key][encounterKey] = appendCombinedRankingValue(
                  acc[job.config.key][encounterKey],
                  annotated,
                );
              }
              return acc;
            },
            {},
          )
        : ({} as Record<string, Record<string, unknown>>);

    warcraftLogsDebugAudit(
      input.credentials,
      "warcraft_logs.api.encounter_history_response",
      {
        summary: `WCL encounter history: ${input.name} — ${built.jobs.length} boss queries`,
        character: input.name,
        realmSlug: input.realmSlug,
        region: input.region,
        roleArgumentEnabled: attempt.includeRoleArg,
        difficultyArgumentEnabled: attempt.includeDifficultyArg,
        attempt: attempt.label,
        requestedBossQueries: built.jobs.length,
        mappedSlices: Object.keys(mapped).length,
        mappedBosses: Object.values(mapped).reduce(
          (sum, item) => sum + Object.keys(item).length,
          0,
        ),
        errors,
        responsePreview: compactForLog(response),
      },
    );

    return { mapped, errors };
  }

  try {
    const failedAttempts: Array<{ label: string; errors: string[] }> = [];
    for (const attempt of attempts) {
      const built = bossHistoryQuery(input.metricSummaries, attempt);
      if (!built) continue;
      const result = await request(built, attempt);
      if (!result.errors.length) {
        if (failedAttempts.length) {
          warcraftLogsDebugAudit(
            input.credentials,
            "warcraft_logs.api.encounter_history_fallback_used",
            {
              summary: `WCL encounter history fallback used: ${input.name}`,
              character: input.name,
              realmSlug: input.realmSlug,
              region: input.region,
              selectedAttempt: attempt.label,
              failedAttempts,
            },
          );
        }
        return result.mapped;
      }
      failedAttempts.push({ label: attempt.label, errors: result.errors });
    }
    return {} as Record<string, Record<string, unknown>>;
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
      chooseZoneValue(character, config),
      encounterHistory[config.key] || {},
      reportPulls[config.key] || {},
      config,
      baseUrl,
    ),
  );
}

function hasCleanMetricData(summary: WarcraftLogsMetricSummary) {
  return (
    summary.recentStats.pullCount > 0 ||
    summary.recentStats.sampleSize > 0 ||
    summary.recentStats.averagePercentile !== null
  );
}

function primarySummary(metricSummaries: WarcraftLogsMetricSummary[]) {
  return (
    metricSummaries.find(
      (summary) => summary.key === "healer-hps" && hasCleanMetricData(summary),
    ) ||
    metricSummaries.find(
      (summary) => summary.key === "dps-dps" && hasCleanMetricData(summary),
    ) ||
    metricSummaries.find(
      (summary) => summary.key === "tank-dps" && hasCleanMetricData(summary),
    ) ||
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
    sourceCoverage: emptySourceCoverage(),
    updatedAt: input.updatedAt,
    error: input.error ?? null,
  };
}

export async function fetchWarcraftLogsCharacterSummary(input: {
  region: BattleNetRegion | string;
  realmSlug: string;
  name: string;
  mode?: WarcraftLogsSummaryMode;
}): Promise<WarcraftLogsCharacterSummary> {
  const region = cleanText(input.region, 12).toLowerCase() || "eu";
  const realmSlug = normalizeBattleNetRealmSlug(input.realmSlug);
  const name =
    normalizeBattleNetNameSlug(input.name) || cleanText(input.name, 80);
  const credentials = await getWarcraftLogsApiCredentials();
  const summaryMode: WarcraftLogsSummaryMode = input.mode === "roster" ? "roster" : "full";
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

  const cacheTtlMs = warcraftLogsCharacterCacheTtlMs(credentials);
  const cacheKey = `${credentialCacheKey(credentials)}:${summaryMode}:${region}:${realmSlug}:${name}`;
  const cached = cacheTtlMs > 0 ? characterSummaryCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const token = await getWarcraftLogsToken(credentials);
    if (!token) throw new Error("Warcraft Logs token is empty");

    type ZoneRankingsAttempt = {
      includeRoleArg: boolean;
      includeDifficultyArg: boolean;
      label: string;
    };
    const zoneAttempts: ZoneRankingsAttempt[] = [
      // WCL role+difficulty is the source of truth. No-role fallbacks caused
      // healer/DPS/tank slices to be polluted by another role on the same boss.
      {
        includeRoleArg: true,
        includeDifficultyArg: true,
        label: "role+difficulty",
      },
    ];

    async function requestZoneRankings(attempt: ZoneRankingsAttempt) {
      return apiFetchJson<WarcraftLogsGraphqlResponse>(
        `${credentials.baseUrl}/api/v2/client`,
        {
          method: "POST",
          label: `Warcraft Logs character ${input.name} ${attempt.label}`,
          timeoutMs: warcraftLogsTimeoutMs(),
          retries: warcraftLogsRetryCount(),
          retryMethods: ["POST"],
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: zoneRankingsQuery(attempt),
            variables: {
              name: input.name,
              serverSlug: realmSlug,
              serverRegion: region,
            },
          }),
          cache: "no-store",
        },
      );
    }

    let response: WarcraftLogsGraphqlResponse | null = null;
    let selectedZoneAttempt: ZoneRankingsAttempt | null = null;
    let firstError: string | undefined;
    const zoneAttemptErrors: Array<{ label: string; errors: string[] }> = [];

    for (const attempt of zoneAttempts) {
      const attemptResponse = await requestZoneRankings(attempt);
      const errors =
        attemptResponse.errors
          ?.map((item) => cleanText(item.message, 240))
          .filter(Boolean) || [];
      response = attemptResponse;
      selectedZoneAttempt = attempt;
      firstError = errors[0];
      if (!firstError) break;
      zoneAttemptErrors.push({ label: attempt.label, errors });
    }

    if (!response || firstError) {
      throw new Error(
        firstError || "Warcraft Logs zone rankings request failed",
      );
    }

    warcraftLogsDebugAudit(
      credentials,
      "warcraft_logs.api.zone_rankings_response",
      {
        summary: `WCL zone rankings: ${input.name}`,
        character: input.name,
        realmSlug,
        region,
        configuredBaseUrl: credentials.baseUrl,
        selectedAttempt: selectedZoneAttempt?.label || null,
        roleArgumentEnabled: selectedZoneAttempt?.includeRoleArg ?? false,
        difficultyArgumentEnabled:
          selectedZoneAttempt?.includeDifficultyArg ?? false,
        fallbackUsed: zoneAttemptErrors.length > 0,
        failedAttempts: zoneAttemptErrors,
        errors:
          response.errors
            ?.map((item) => cleanText(item.message, 240))
            .filter(Boolean) || [],
        responsePreview: compactForLog(response),
      },
    );

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
    const encounterHistory = summaryMode === "full"
      ? await fetchEncounterHistory({
          credentials,
          token,
          name: input.name,
          realmSlug,
          region,
          metricSummaries: initialMetricSummaries,
        })
      : ({} as Record<string, Record<string, unknown>>);
    const reportPullsResult = summaryMode === "full"
      ? await fetchRecentRaidBossPulls({
          credentials,
          token,
          name: input.name,
          realmSlug,
          region,
          metricSummaries: initialMetricSummaries,
        })
      : emptyReportPullsResult();
    const metricSummaries = normalizeAllMetricSummaries(
      character,
      encounterHistory,
      reportPullsResult.pullsBySlice,
      credentials.baseUrl,
    );
    const primary = primarySummary(metricSummaries);
    const rateLimitSnapshot = rateLimitSnapshotFromResponse(response);

    warcraftLogsDebugAudit(credentials, "warcraft_logs.parser.summary", {
      summary: `WCL parser summary: ${input.name}`,
      character: input.name,
      realmSlug,
      region,
      mode: summaryMode,
      primaryMetric: primary?.key || null,
      metricCount: metricSummaries.length,
      coverage: {
        reportsChecked: reportPullsResult.coverage.reportsChecked,
        archivedReports: reportPullsResult.coverage.archivedReports,
        rankedCharacters: reportPullsResult.coverage.rankedCharacters,
        reportBossFightsChecked:
          reportPullsResult.coverage.reportBossFightsChecked,
        reportPullRows: reportPullsResult.coverage.reportPullRows,
        duplicatePullRows: reportPullsResult.coverage.duplicatePullRows,
        uniqueReportPullRows: reportPullsResult.coverage.uniqueReportPullRows,
        reportTableQueries: reportPullsResult.coverage.reportTableQueries,
        reportTableFallbacks: reportPullsResult.coverage.reportTableFallbacks,
        summaryTableRows: reportPullsResult.coverage.summaryTableRows,
        deathTableRows: reportPullsResult.coverage.deathTableRows,
        roleTotals: reportPullsResult.coverage.roleTotals,
        skippedUnknownRole: reportPullsResult.coverage.skippedUnknownRole,
        skippedMissingAmount: reportPullsResult.coverage.skippedMissingAmount,
      },
      metrics: metricSummaries.map((metric) => ({
        key: metric.key,
        role: metric.role,
        metric: metric.metric,
        bestAverage: metric.bestPerformanceAverage,
        medianAverage: metric.medianPerformanceAverage,
        bosses: metric.bossRankings.length,
        primaryDifficulty: metric.primaryDifficultyLabel,
        pulls: metric.recentStats.pullCount,
        samples: metric.recentStats.sampleSize,
        maxAmount: metric.recentStats.maxAmount,
        avgAmount: metric.recentStats.averageAmount,
        sampleBosses: metric.bossRankings.slice(0, 8).map((boss) => ({
          encounterId: boss.encounterId,
          name: boss.encounterName,
          bestPercentile: boss.bestPercentile,
          primaryDifficulty: boss.primaryDifficultyLabel,
          pulls: boss.pulls.length,
          samples: boss.recentStats.sampleSize,
          maxAmount: boss.recentStats.maxAmount,
          avgAmount: boss.recentStats.averageAmount,
        })),
      })),
    });

    const readySummary: WarcraftLogsCharacterSummary = {
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
      sourceCoverage: emptySourceCoverage({
        ...reportPullsResult.coverage,
        ...sourceCoverageFromRateLimit(rateLimitSnapshot),
        zoneRankingSlices: metricSummaries.filter(
          (metric) => metric.encounterRankings.length,
        ).length,
        encounterRankingSlices: Object.values(encounterHistory).reduce(
          (sum, item) => sum + Object.keys(item).length,
          0,
        ),
      }),
      updatedAt,
      error: null,
    };

    if (cacheTtlMs > 0) {
      characterSummaryCache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        value: readySummary,
      });
      if (characterSummaryCache.size > 200) {
        for (const [key, entry] of characterSummaryCache) {
          if (entry.expiresAt <= Date.now()) characterSummaryCache.delete(key);
        }
      }
    }

    return readySummary;
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
