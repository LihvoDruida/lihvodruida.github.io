import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { DashboardSession } from "@/lib/auth";
import {
  getFirebaseAdminDb,
  hasFirebaseProfileConfig,
} from "@/lib/firebaseAdmin";
import { logDashboardEvent } from "@/lib/security";
import { resilientRead, setRuntimeCachedValue, getRuntimeStaleValue } from "@/lib/runtimeResilience";

const SETTINGS_COLLECTION = "dashboardSettings";
const DASHBOARD_API_SETTINGS_DOC_ID = "backgroundApiPolicy";
const DEFAULT_WARCRAFT_LOGS_BASE_URL = "https://www.warcraftlogs.com";

const MIN_BACKGROUND_REFRESH_SECONDS = 10 * 60;
const MAX_REFRESH_SECONDS = 24 * 60 * 60;
const DEFAULT_CHARACTER_CACHE_TTL_MS = 120_000;
const MAX_CHARACTER_CACHE_TTL_MS = 900_000;
const DEFAULT_WCL_RECENT_REPORT_LIMIT = 12;
const DEFAULT_WCL_REPORT_FIGHT_TABLE_LIMIT = 24;
const DEFAULT_GUILD_ROSTER_MEMBER_LIMIT = 1000;
const DEFAULT_GUILD_ROSTER_REFRESH_STEP_BUDGET_MS = 22_000;
const DEFAULT_GUILD_ROSTER_SYNC_JOB_TTL_SECONDS = 30 * 60;
const DEFAULT_GUILD_ROSTER_SHARDED_CACHE_ENABLED = true;
const DEFAULT_GUILD_ROSTER_SHARDED_CACHE_THRESHOLD = 150;
const DEFAULT_GUILD_ROSTER_BATTLENET_STEP_SIZE = 8;
const DEFAULT_GUILD_ROSTER_BATTLENET_TTL_SECONDS = 21_600;
const DEFAULT_GUILD_ROSTER_RAIDERIO_STEP_SIZE = 5;
const DEFAULT_GUILD_ROSTER_RAIDERIO_TTL_SECONDS = 21_600;
const DEFAULT_GUILD_ROSTER_CLIENT_DRIVEN_SYNC_ENABLED = true;
const DEFAULT_GUILD_ROSTER_CLIENT_STEP_DELAY_MS = 250;
const DEFAULT_GUILD_ROSTER_CLIENT_REQUEST_TIMEOUT_MS = 40_000;
const DEFAULT_GUILD_ROSTER_CLIENT_MAX_STEPS = 2_200;
const DEFAULT_GUILD_ROSTER_WCL_ENABLED = true;
const DEFAULT_GUILD_ROSTER_WCL_MEMBER_LIMIT = 0;
const DEFAULT_GUILD_ROSTER_WCL_STEP_SIZE = 1;
const DEFAULT_GUILD_ROSTER_WCL_CONCURRENCY = 0;
const DEFAULT_GUILD_ROSTER_WCL_MAX_CONCURRENCY = 1;
const DEFAULT_GUILD_ROSTER_PROFILE_WCL_TTL_SECONDS = 21_600;
const DEFAULT_WCL_ROSTER_REQUEST_TIMEOUT_MS = 3_500;
const DEFAULT_WCL_ROSTER_REQUEST_RETRIES = 0;
const DEFAULT_WCL_ROSTER_RECENT_REPORT_LIMIT = 2;
const DEFAULT_WCL_ROSTER_REPORT_FIGHT_TABLE_LIMIT = 5;
const DEFAULT_WCL_ROSTER_REPORT_TABLE_CONCURRENCY = 1;
const DEFAULT_DASHBOARD_API_DEBUG_AUDIT_LOGS = false;
const DEFAULT_DASHBOARD_API_WARNING_AUDIT_LOGS = true;

const DEFAULT_GUILD_ROSTER_CACHE_TTL_SECONDS = 1800;
const DEFAULT_GUILD_ROSTER_CACHE_READ_TTL_MS = 120_000;
const DEFAULT_GUILD_ROSTER_CACHE_WRITE_BATCH_SIZE = 50;
const DEFAULT_GUILD_ROSTER_CACHE_DELETE_STALE_MEMBERS = false;
const DEFAULT_GUILD_ROSTER_REFRESH_CONCURRENCY = 2;
const DEFAULT_GUILD_ROSTER_REFRESH_MAX_CONCURRENCY = 6;
const DEFAULT_RAIDERIO_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RAIDERIO_REQUEST_RETRIES = 1;
const DEFAULT_BATTLENET_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_BATTLENET_REQUEST_RETRIES = 2;
const DEFAULT_PROFILE_READ_CACHE_TTL_MS = 60_000;
const DEFAULT_PROFILE_LIST_CACHE_TTL_MS = 120_000;
const DEFAULT_PROFILE_CHARACTER_LINKS_CACHE_TTL_MS = 300_000;
const DEFAULT_RAID_LIST_CACHE_TTL_MS = 60_000;
const DEFAULT_RAID_ITEM_CACHE_TTL_MS = 60_000;


const SETTINGS_CACHE_TTL_MS = Math.max(60_000, Math.min(30 * 60_000, Number(process.env.DASHBOARD_API_SETTINGS_CACHE_TTL_MS || 5 * 60_000)));
const SETTINGS_ERROR_LOG_TTL_MS = 5 * 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __mistblossomDashboardApiSettingsCache: { settings: DashboardApiSettings; cachedAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __mistblossomDashboardApiSettingsErrorLoggedAt: number | undefined;
  // eslint-disable-next-line no-var
  var __mistblossomWarcraftLogsCredentialsCache: { credentials: WarcraftLogsApiCredentials; cachedAt: number } | undefined;
}

function settingsCacheFresh() {
  const cached = globalThis.__mistblossomDashboardApiSettingsCache;
  return Boolean(cached && Date.now() - cached.cachedAt < SETTINGS_CACHE_TTL_MS);
}

function setSettingsCache(settings: DashboardApiSettings) {
  globalThis.__mistblossomDashboardApiSettingsCache = { settings, cachedAt: Date.now() };
  return settings;
}

function logSettingsReadFailureOnce(event: string, error: unknown) {
  const now = Date.now();
  const last = globalThis.__mistblossomDashboardApiSettingsErrorLoggedAt || 0;
  if (now - last < SETTINGS_ERROR_LOG_TTL_MS) return;
  globalThis.__mistblossomDashboardApiSettingsErrorLoggedAt = now;
  logDashboardEvent(
    "warn",
    event,
    undefined,
    { message: error instanceof Error ? error.message : String(error || "unknown") },
  );
}

export type DashboardApiSettingsSource = "firestore" | "defaults";

export type WarcraftLogsCredentialsSource = "panel" | "env" | "none";

export type DashboardApiSettings = {
  backgroundRefreshMinSeconds: number;
  profileViewRefreshMinSeconds: number;
  profileExternalRefreshMinSeconds: number;
  profileExternalRefreshBatchLimit: number;
  profileCharacterRefreshConcurrency: number;
  profileCharacterRefreshMaxConcurrency: number;
  profileExternalRefreshConcurrency: number;
  profileExternalRefreshMaxConcurrency: number;
  warcraftLogsClientId: string | null;
  warcraftLogsClientSecretConfigured: boolean;
  warcraftLogsCredentialsSource: WarcraftLogsCredentialsSource;
  warcraftLogsBaseUrl: string;
  warcraftLogsDebugAuditLogs: boolean;
  dashboardApiDebugAuditLogs: boolean;
  dashboardApiWarningAuditLogs: boolean;
  guildRosterRegion: string;
  guildRosterRealm: string;
  guildRosterName: string;
  guildRosterCacheTtlSeconds: number;
  guildRosterCacheReadTtlMs: number;
  guildRosterCacheWriteBatchSize: number;
  guildRosterCacheDeleteStaleMembers: boolean;
  guildRosterRefreshConcurrency: number;
  guildRosterRefreshMaxConcurrency: number;
  raiderIoRequestTimeoutMs: number;
  raiderIoRequestRetries: number;
  battleNetRequestTimeoutMs: number;
  battleNetRequestRetries: number;
  profileReadCacheTtlMs: number;
  profileListCacheTtlMs: number;
  profileCharacterLinksCacheTtlMs: number;
  raidListCacheTtlMs: number;
  raidItemCacheTtlMs: number;
  raiderIoCharacterCacheTtlMs: number;
  warcraftLogsCharacterCacheTtlMs: number;
  warcraftLogsRecentReportLimit: number;
  warcraftLogsReportFightTableLimit: number;
  guildRosterMemberLimit: number;
  guildRosterRefreshStepBudgetMs: number;
  guildRosterSyncJobTtlSeconds: number;
  guildRosterShardedCacheEnabled: boolean;
  guildRosterShardedCacheThreshold: number;
  guildRosterBattleNetStepSize: number;
  guildRosterBattleNetTtlSeconds: number;
  guildRosterRaiderIoStepSize: number;
  guildRosterRaiderIoTtlSeconds: number;
  guildRosterClientDrivenSyncEnabled: boolean;
  guildRosterClientStepDelayMs: number;
  guildRosterClientRequestTimeoutMs: number;
  guildRosterClientMaxSteps: number;
  guildRosterWclEnabled: boolean;
  guildRosterWclMemberLimit: number;
  guildRosterWclStepSize: number;
  guildRosterWclConcurrency: number;
  guildRosterWclMaxConcurrency: number;
  guildRosterProfileWclTtlSeconds: number;
  warcraftLogsRosterRequestTimeoutMs: number;
  warcraftLogsRosterRequestRetries: number;
  warcraftLogsRosterRecentReportLimit: number;
  warcraftLogsRosterReportFightTableLimit: number;
  warcraftLogsRosterReportTableConcurrency: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  source: DashboardApiSettingsSource;
};

export type WarcraftLogsApiCredentials = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  source: WarcraftLogsCredentialsSource;
  debugAuditLogs: boolean;
  characterCacheTtlMs: number;
  recentReportLimit: number;
  reportFightTableLimit: number;
  rosterRequestTimeoutMs: number;
  rosterRequestRetries: number;
  rosterRecentReportLimit: number;
  rosterReportFightTableLimit: number;
  rosterReportTableConcurrency: number;
  configured: boolean;
};

type DashboardApiSettingsInput = Partial<
  Record<
    | keyof DashboardApiSettings
    | "warcraftLogsClientSecret"
    | "clearWarcraftLogsClientSecret"
    | "guildRosterRegion"
    | "guildRosterRealm"
    | "guildRosterName"
    | "guildRosterCacheTtlSeconds"
    | "guildRosterCacheReadTtlMs"
    | "guildRosterCacheWriteBatchSize"
    | "guildRosterCacheDeleteStaleMembers"
    | "guildRosterRefreshConcurrency"
    | "guildRosterRefreshMaxConcurrency"
    | "raiderIoRequestTimeoutMs"
    | "raiderIoRequestRetries"
    | "battleNetRequestTimeoutMs"
    | "battleNetRequestRetries"
    | "profileReadCacheTtlMs"
    | "profileListCacheTtlMs"
    | "profileCharacterLinksCacheTtlMs"
    | "raidListCacheTtlMs"
    | "raidItemCacheTtlMs"
    | "raiderIoCharacterCacheTtlMs"
    | "warcraftLogsCharacterCacheTtlMs"
    | "warcraftLogsRecentReportLimit"
    | "warcraftLogsReportFightTableLimit"
    | "guildRosterMemberLimit"
    | "guildRosterRefreshStepBudgetMs"
    | "guildRosterSyncJobTtlSeconds"
    | "guildRosterShardedCacheEnabled"
    | "guildRosterShardedCacheThreshold"
    | "guildRosterBattleNetStepSize"
    | "guildRosterBattleNetTtlSeconds"
    | "guildRosterRaiderIoStepSize"
    | "guildRosterRaiderIoTtlSeconds"
    | "guildRosterClientDrivenSyncEnabled"
    | "guildRosterClientStepDelayMs"
    | "guildRosterClientRequestTimeoutMs"
    | "guildRosterClientMaxSteps"
    | "guildRosterWclEnabled"
    | "guildRosterWclMemberLimit"
    | "guildRosterWclStepSize"
    | "guildRosterWclConcurrency"
    | "guildRosterWclMaxConcurrency"
    | "guildRosterProfileWclTtlSeconds"
    | "warcraftLogsRosterRequestTimeoutMs"
    | "warcraftLogsRosterRequestRetries"
    | "warcraftLogsRosterRecentReportLimit"
    | "warcraftLogsRosterReportFightTableLimit"
    | "warcraftLogsRosterReportTableConcurrency",
    unknown
  >
>;

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.floor(value), max));
}

function cleanText(value: unknown, maxLength = 500) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(0, maxLength));
}

function truthyFormFlag(value: unknown) {
  const text = cleanText(value, 20).toLowerCase();
  return ["1", "true", "yes", "on"].includes(text);
}

function envWarcraftLogsClientId() {
  return cleanText(
    process.env.WARCRAFTLOGS_CLIENT_ID || process.env.WCL_CLIENT_ID,
    240,
  );
}

function envWarcraftLogsClientSecret() {
  return cleanText(
    process.env.WARCRAFTLOGS_CLIENT_SECRET || process.env.WCL_CLIENT_SECRET,
    500,
  );
}

function envWarcraftLogsBaseUrl() {
  const configured = cleanText(process.env.WARCRAFTLOGS_BASE_URL, 240).replace(
    /\/+$/g,
    "",
  );
  return configured || DEFAULT_WARCRAFT_LOGS_BASE_URL;
}

function envWarcraftLogsDebugAuditLogs() {
  return truthyFormFlag(process.env.WARCRAFTLOGS_DEBUG_AUDIT_LOGS);
}

function envDashboardApiDebugAuditLogs() {
  const raw = cleanText(process.env.DASHBOARD_API_DEBUG_AUDIT_LOGS, 20);
  if (!raw) return DEFAULT_DASHBOARD_API_DEBUG_AUDIT_LOGS;
  return booleanValue(raw, DEFAULT_DASHBOARD_API_DEBUG_AUDIT_LOGS);
}

function envDashboardApiWarningAuditLogs() {
  const raw = cleanText(process.env.DASHBOARD_API_WARNING_AUDIT_LOGS, 20);
  if (!raw) return DEFAULT_DASHBOARD_API_WARNING_AUDIT_LOGS;
  return booleanValue(raw, DEFAULT_DASHBOARD_API_WARNING_AUDIT_LOGS);
}

function envGuildRosterRegion() {
  return cleanText(
    process.env.GUILD_ROSTER_REGION || process.env.WOW_REGION || process.env.BATTLENET_DEFAULT_REGION || "eu",
    20,
  ).toLowerCase() || "eu";
}

function envGuildRosterRealm() {
  return cleanText(
    process.env.GUILD_ROSTER_REALM || process.env.WOW_REALM || process.env.WOW_GUILD_REALM || process.env.BATTLENET_ALLOWED_GUILD_REALM || "terokkar",
    80,
  ).toLowerCase() || "terokkar";
}

function envGuildRosterName() {
  return cleanText(
    process.env.GUILD_ROSTER_NAME || process.env.WOW_GUILD_NAME || process.env.BATTLENET_ALLOWED_GUILD_NAME || "Mistblossom Vanguard",
    120,
  ) || "Mistblossom Vanguard";
}

function envGuildRosterCacheTtlSeconds() {
  return integerEnv("GUILD_ROSTER_CACHE_TTL_SECONDS", DEFAULT_GUILD_ROSTER_CACHE_TTL_SECONDS, 300, 86_400);
}

function envGuildRosterCacheReadTtlMs() {
  return integerEnv("GUILD_ROSTER_CACHE_READ_TTL_MS", DEFAULT_GUILD_ROSTER_CACHE_READ_TTL_MS, 30_000, 300_000);
}

function envGuildRosterCacheWriteBatchSize() {
  return integerEnv("GUILD_ROSTER_CACHE_WRITE_BATCH_SIZE", DEFAULT_GUILD_ROSTER_CACHE_WRITE_BATCH_SIZE, 1, 250);
}

function envGuildRosterCacheDeleteStaleMembers() {
  const raw = cleanText(process.env.GUILD_ROSTER_CACHE_DELETE_STALE_MEMBERS, 20);
  if (!raw) return DEFAULT_GUILD_ROSTER_CACHE_DELETE_STALE_MEMBERS;
  return booleanValue(raw, DEFAULT_GUILD_ROSTER_CACHE_DELETE_STALE_MEMBERS);
}

function envGuildRosterRefreshConcurrency() {
  return integerEnv("GUILD_ROSTER_REFRESH_CONCURRENCY", DEFAULT_GUILD_ROSTER_REFRESH_CONCURRENCY, 1, envGuildRosterRefreshMaxConcurrency());
}

function envGuildRosterRefreshMaxConcurrency() {
  return integerEnv("GUILD_ROSTER_REFRESH_MAX_CONCURRENCY", DEFAULT_GUILD_ROSTER_REFRESH_MAX_CONCURRENCY, 1, 12);
}

function envRaiderIoRequestTimeoutMs() {
  return integerEnv("RAIDERIO_REQUEST_TIMEOUT_MS", DEFAULT_RAIDERIO_REQUEST_TIMEOUT_MS, 2_500, 30_000);
}

function envRaiderIoRequestRetries() {
  return integerEnv("RAIDERIO_REQUEST_RETRIES", DEFAULT_RAIDERIO_REQUEST_RETRIES, 0, 4);
}

function envBattleNetRequestTimeoutMs() {
  return integerEnv("BATTLENET_REQUEST_TIMEOUT_MS", DEFAULT_BATTLENET_REQUEST_TIMEOUT_MS, 2_500, 30_000);
}

function envBattleNetRequestRetries() {
  return integerEnv("BATTLENET_REQUEST_RETRIES", DEFAULT_BATTLENET_REQUEST_RETRIES, 0, 5);
}

function envProfileReadCacheTtlMs() {
  return integerEnv("PROFILE_READ_CACHE_TTL_MS", DEFAULT_PROFILE_READ_CACHE_TTL_MS, 30_000, 300_000);
}

function envProfileListCacheTtlMs() {
  return integerEnv("PROFILE_LIST_CACHE_TTL_MS", DEFAULT_PROFILE_LIST_CACHE_TTL_MS, 30_000, 300_000);
}

function envProfileCharacterLinksCacheTtlMs() {
  return integerEnv("PROFILE_CHARACTER_LINKS_CACHE_TTL_MS", DEFAULT_PROFILE_CHARACTER_LINKS_CACHE_TTL_MS, 30_000, 600_000);
}

function envRaidListCacheTtlMs() {
  return integerEnv("RAID_LIST_CACHE_TTL_MS", DEFAULT_RAID_LIST_CACHE_TTL_MS, 30_000, 300_000);
}

function envRaidItemCacheTtlMs() {
  return integerEnv("RAID_ITEM_CACHE_TTL_MS", DEFAULT_RAID_ITEM_CACHE_TTL_MS, 10_000, 120_000);
}

function envRaiderIoCharacterCacheTtlMs() {
  return integerEnv(
    "RAIDERIO_CHARACTER_CACHE_TTL_MS",
    DEFAULT_CHARACTER_CACHE_TTL_MS,
    0,
    MAX_CHARACTER_CACHE_TTL_MS,
  );
}

function envWarcraftLogsCharacterCacheTtlMs() {
  return integerEnv(
    "WARCRAFTLOGS_CHARACTER_CACHE_TTL_MS",
    DEFAULT_CHARACTER_CACHE_TTL_MS,
    0,
    MAX_CHARACTER_CACHE_TTL_MS,
  );
}

function envWarcraftLogsRecentReportLimit() {
  return integerEnv(
    "WARCRAFTLOGS_RECENT_REPORT_LIMIT",
    DEFAULT_WCL_RECENT_REPORT_LIMIT,
    1,
    30,
  );
}

function envWarcraftLogsReportFightTableLimit() {
  return integerEnv(
    "WARCRAFTLOGS_REPORT_FIGHT_TABLE_LIMIT",
    DEFAULT_WCL_REPORT_FIGHT_TABLE_LIMIT,
    4,
    60,
  );
}

function envGuildRosterWclEnabled() {
  const raw = cleanText(process.env.GUILD_ROSTER_WCL_ENABLED, 20);
  if (!raw) return DEFAULT_GUILD_ROSTER_WCL_ENABLED;
  return booleanValue(raw, DEFAULT_GUILD_ROSTER_WCL_ENABLED);
}

function envGuildRosterWclMemberLimit() {
  return integerEnv(
    "GUILD_ROSTER_WCL_MEMBER_LIMIT",
    DEFAULT_GUILD_ROSTER_WCL_MEMBER_LIMIT,
    0,
    1000,
  );
}

function envGuildRosterWclMaxConcurrency() {
  return integerEnv(
    "GUILD_ROSTER_WCL_MAX_CONCURRENCY",
    DEFAULT_GUILD_ROSTER_WCL_MAX_CONCURRENCY,
    1,
    8,
  );
}

function envGuildRosterWclConcurrency() {
  return integerEnv(
    "GUILD_ROSTER_WCL_CONCURRENCY",
    DEFAULT_GUILD_ROSTER_WCL_CONCURRENCY,
    0,
    envGuildRosterWclMaxConcurrency(),
  );
}

function envGuildRosterMemberLimit() {
  return integerEnv(
    "GUILD_ROSTER_MEMBER_LIMIT",
    DEFAULT_GUILD_ROSTER_MEMBER_LIMIT,
    1,
    1000,
  );
}

function envGuildRosterRefreshStepBudgetMs() {
  return integerEnv(
    "GUILD_ROSTER_REFRESH_STEP_BUDGET_MS",
    DEFAULT_GUILD_ROSTER_REFRESH_STEP_BUDGET_MS,
    5_000,
    38_000,
  );
}

function envGuildRosterSyncJobTtlSeconds() {
  return integerEnv(
    "GUILD_ROSTER_SYNC_JOB_TTL_SECONDS",
    DEFAULT_GUILD_ROSTER_SYNC_JOB_TTL_SECONDS,
    5 * 60,
    6 * 60 * 60,
  );
}

function envGuildRosterShardedCacheEnabled() {
  const raw = cleanText(process.env.GUILD_ROSTER_SHARDED_CACHE_ENABLED, 20);
  if (!raw) return DEFAULT_GUILD_ROSTER_SHARDED_CACHE_ENABLED;
  return booleanValue(raw, DEFAULT_GUILD_ROSTER_SHARDED_CACHE_ENABLED);
}

function envGuildRosterShardedCacheThreshold() {
  return integerEnv(
    "GUILD_ROSTER_SHARDED_CACHE_THRESHOLD",
    DEFAULT_GUILD_ROSTER_SHARDED_CACHE_THRESHOLD,
    1,
    1000,
  );
}

function envGuildRosterBattleNetStepSize() {
  return integerEnv(
    "GUILD_ROSTER_BATTLENET_STEP_SIZE",
    DEFAULT_GUILD_ROSTER_BATTLENET_STEP_SIZE,
    0,
    100,
  );
}

function envGuildRosterBattleNetTtlSeconds() {
  return integerEnv(
    "GUILD_ROSTER_BATTLENET_TTL_SECONDS",
    DEFAULT_GUILD_ROSTER_BATTLENET_TTL_SECONDS,
    300,
    604_800,
  );
}

function envGuildRosterRaiderIoStepSize() {
  return integerEnv(
    "GUILD_ROSTER_RAIDERIO_STEP_SIZE",
    integerEnv(
      "GUILD_ROSTER_RAIDERIO_BATCH_SIZE",
      DEFAULT_GUILD_ROSTER_RAIDERIO_STEP_SIZE,
      0,
      100,
    ),
    0,
    100,
  );
}

function envGuildRosterRaiderIoTtlSeconds() {
  return integerEnv(
    "GUILD_ROSTER_RAIDERIO_TTL_SECONDS",
    DEFAULT_GUILD_ROSTER_RAIDERIO_TTL_SECONDS,
    300,
    604_800,
  );
}

function envGuildRosterClientDrivenSyncEnabled() {
  const raw = cleanText(
    process.env.GUILD_ROSTER_CLIENT_DRIVEN_SYNC_ENABLED,
    20,
  );
  if (!raw) return DEFAULT_GUILD_ROSTER_CLIENT_DRIVEN_SYNC_ENABLED;
  return booleanValue(raw, DEFAULT_GUILD_ROSTER_CLIENT_DRIVEN_SYNC_ENABLED);
}

function envGuildRosterClientStepDelayMs() {
  return integerEnv(
    "GUILD_ROSTER_CLIENT_STEP_DELAY_MS",
    DEFAULT_GUILD_ROSTER_CLIENT_STEP_DELAY_MS,
    0,
    5_000,
  );
}

function envGuildRosterClientRequestTimeoutMs() {
  return integerEnv(
    "GUILD_ROSTER_CLIENT_REQUEST_TIMEOUT_MS",
    DEFAULT_GUILD_ROSTER_CLIENT_REQUEST_TIMEOUT_MS,
    5_000,
    60_000,
  );
}

function envGuildRosterClientMaxSteps() {
  return integerEnv(
    "GUILD_ROSTER_CLIENT_MAX_STEPS",
    DEFAULT_GUILD_ROSTER_CLIENT_MAX_STEPS,
    1,
    10_000,
  );
}

function envGuildRosterWclStepSize() {
  return integerEnv(
    "GUILD_ROSTER_WCL_STEP_SIZE",
    integerEnv(
      "GUILD_ROSTER_WCL_BATCH_SIZE",
      DEFAULT_GUILD_ROSTER_WCL_STEP_SIZE,
      0,
      20,
    ),
    0,
    20,
  );
}

function envGuildRosterProfileWclTtlSeconds() {
  return integerEnv(
    "GUILD_ROSTER_PROFILE_WCL_TTL_SECONDS",
    DEFAULT_GUILD_ROSTER_PROFILE_WCL_TTL_SECONDS,
    300,
    604_800,
  );
}

function envWarcraftLogsRosterRequestTimeoutMs() {
  return integerEnv(
    "WARCRAFTLOGS_ROSTER_REQUEST_TIMEOUT_MS",
    DEFAULT_WCL_ROSTER_REQUEST_TIMEOUT_MS,
    1_500,
    12_000,
  );
}

function envWarcraftLogsRosterRequestRetries() {
  return integerEnv(
    "WARCRAFTLOGS_ROSTER_REQUEST_RETRIES",
    DEFAULT_WCL_ROSTER_REQUEST_RETRIES,
    0,
    2,
  );
}

function envWarcraftLogsRosterRecentReportLimit() {
  return integerEnv(
    "WARCRAFTLOGS_ROSTER_RECENT_REPORT_LIMIT",
    DEFAULT_WCL_ROSTER_RECENT_REPORT_LIMIT,
    1,
    8,
  );
}

function envWarcraftLogsRosterReportFightTableLimit() {
  return integerEnv(
    "WARCRAFTLOGS_ROSTER_REPORT_FIGHT_TABLE_LIMIT",
    DEFAULT_WCL_ROSTER_REPORT_FIGHT_TABLE_LIMIT,
    3,
    16,
  );
}

function envWarcraftLogsRosterReportTableConcurrency() {
  return integerEnv(
    "WARCRAFTLOGS_ROSTER_REPORT_TABLE_CONCURRENCY",
    DEFAULT_WCL_ROSTER_REPORT_TABLE_CONCURRENCY,
    1,
    2,
  );
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value, 20).toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function normalizeWarcraftLogsBaseUrl(
  value: unknown,
  fallback = envWarcraftLogsBaseUrl(),
) {
  const configured = cleanText(value, 240).replace(/\/+$/g, "");
  if (!configured) return fallback;
  if (!/^https:\/\//i.test(configured)) return fallback;
  return configured;
}

function resolveWarcraftLogsCredentials(
  data?: DashboardApiSettingsInput | null,
): WarcraftLogsApiCredentials {
  const panelClientId = cleanText(data?.warcraftLogsClientId, 240);
  const panelClientSecret = cleanText(data?.warcraftLogsClientSecret, 500);
  const envClientId = envWarcraftLogsClientId();
  const envClientSecret = envWarcraftLogsClientSecret();
  const clientId = panelClientId || envClientId;
  const clientSecret = panelClientSecret || envClientSecret;
  const source: WarcraftLogsCredentialsSource =
    clientId && clientSecret
      ? panelClientId || panelClientSecret
        ? "panel"
        : "env"
      : "none";

  return {
    clientId,
    clientSecret,
    baseUrl: normalizeWarcraftLogsBaseUrl(data?.warcraftLogsBaseUrl),
    source,
    debugAuditLogs: booleanValue(
      data?.warcraftLogsDebugAuditLogs,
      envWarcraftLogsDebugAuditLogs(),
    ),
    characterCacheTtlMs: integerValue(
      data?.warcraftLogsCharacterCacheTtlMs,
      envWarcraftLogsCharacterCacheTtlMs(),
      0,
      MAX_CHARACTER_CACHE_TTL_MS,
    ),
    recentReportLimit: integerValue(
      data?.warcraftLogsRecentReportLimit,
      envWarcraftLogsRecentReportLimit(),
      1,
      30,
    ),
    reportFightTableLimit: integerValue(
      data?.warcraftLogsReportFightTableLimit,
      envWarcraftLogsReportFightTableLimit(),
      4,
      60,
    ),
    rosterRequestTimeoutMs: integerValue(
      data?.warcraftLogsRosterRequestTimeoutMs,
      envWarcraftLogsRosterRequestTimeoutMs(),
      1_500,
      12_000,
    ),
    rosterRequestRetries: integerValue(
      data?.warcraftLogsRosterRequestRetries,
      envWarcraftLogsRosterRequestRetries(),
      0,
      2,
    ),
    rosterRecentReportLimit: integerValue(
      data?.warcraftLogsRosterRecentReportLimit,
      envWarcraftLogsRosterRecentReportLimit(),
      1,
      8,
    ),
    rosterReportFightTableLimit: integerValue(
      data?.warcraftLogsRosterReportFightTableLimit,
      envWarcraftLogsRosterReportFightTableLimit(),
      3,
      16,
    ),
    rosterReportTableConcurrency: integerValue(
      data?.warcraftLogsRosterReportTableConcurrency,
      envWarcraftLogsRosterReportTableConcurrency(),
      1,
      2,
    ),
    configured: Boolean(clientId && clientSecret),
  };
}

function integerValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.floor(number), max));
}

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function")
    return maybeTimestamp.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function defaultDashboardApiSettings(): DashboardApiSettings {
  const backgroundRefreshMinSeconds = integerEnv(
    "DASHBOARD_BACKGROUND_REFRESH_MIN_SECONDS",
    integerEnv(
      "PROFILE_VIEW_REFRESH_MIN_SECONDS",
      MIN_BACKGROUND_REFRESH_SECONDS,
      MIN_BACKGROUND_REFRESH_SECONDS,
      MAX_REFRESH_SECONDS,
    ),
    MIN_BACKGROUND_REFRESH_SECONDS,
    MAX_REFRESH_SECONDS,
  );
  const profileViewRefreshMinSeconds = integerEnv(
    "PROFILE_VIEW_REFRESH_MIN_SECONDS",
    backgroundRefreshMinSeconds,
    MIN_BACKGROUND_REFRESH_SECONDS,
    MAX_REFRESH_SECONDS,
  );

  return {
    backgroundRefreshMinSeconds,
    profileViewRefreshMinSeconds,
    profileExternalRefreshMinSeconds: integerEnv(
      "PROFILE_EXTERNAL_REFRESH_MIN_SECONDS",
      30 * 60,
      MIN_BACKGROUND_REFRESH_SECONDS,
      MAX_REFRESH_SECONDS,
    ),
    profileExternalRefreshBatchLimit: integerEnv(
      "PROFILE_EXTERNAL_REFRESH_BATCH_LIMIT",
      50,
      1,
      500,
    ),
    profileCharacterRefreshConcurrency: integerEnv(
      "PROFILE_CHARACTER_REFRESH_CONCURRENCY",
      0,
      0,
      8,
    ),
    profileCharacterRefreshMaxConcurrency: integerEnv(
      "PROFILE_CHARACTER_REFRESH_MAX_CONCURRENCY",
      8,
      1,
      8,
    ),
    profileExternalRefreshConcurrency: integerEnv(
      "PROFILE_EXTERNAL_REFRESH_CONCURRENCY",
      0,
      0,
      6,
    ),
    profileExternalRefreshMaxConcurrency: integerEnv(
      "PROFILE_EXTERNAL_REFRESH_MAX_CONCURRENCY",
      6,
      1,
      6,
    ),
    warcraftLogsClientId: envWarcraftLogsClientId() || null,
    warcraftLogsClientSecretConfigured: Boolean(envWarcraftLogsClientSecret()),
    warcraftLogsCredentialsSource: resolveWarcraftLogsCredentials(null).source,
    warcraftLogsBaseUrl: envWarcraftLogsBaseUrl(),
    warcraftLogsDebugAuditLogs: envWarcraftLogsDebugAuditLogs(),
    dashboardApiDebugAuditLogs: envDashboardApiDebugAuditLogs(),
    dashboardApiWarningAuditLogs: envDashboardApiWarningAuditLogs(),
    guildRosterRegion: envGuildRosterRegion(),
    guildRosterRealm: envGuildRosterRealm(),
    guildRosterName: envGuildRosterName(),
    guildRosterCacheTtlSeconds: envGuildRosterCacheTtlSeconds(),
    guildRosterCacheReadTtlMs: envGuildRosterCacheReadTtlMs(),
    guildRosterCacheWriteBatchSize: envGuildRosterCacheWriteBatchSize(),
    guildRosterCacheDeleteStaleMembers: envGuildRosterCacheDeleteStaleMembers(),
    guildRosterRefreshConcurrency: envGuildRosterRefreshConcurrency(),
    guildRosterRefreshMaxConcurrency: envGuildRosterRefreshMaxConcurrency(),
    raiderIoRequestTimeoutMs: envRaiderIoRequestTimeoutMs(),
    raiderIoRequestRetries: envRaiderIoRequestRetries(),
    battleNetRequestTimeoutMs: envBattleNetRequestTimeoutMs(),
    battleNetRequestRetries: envBattleNetRequestRetries(),
    profileReadCacheTtlMs: envProfileReadCacheTtlMs(),
    profileListCacheTtlMs: envProfileListCacheTtlMs(),
    profileCharacterLinksCacheTtlMs: envProfileCharacterLinksCacheTtlMs(),
    raidListCacheTtlMs: envRaidListCacheTtlMs(),
    raidItemCacheTtlMs: envRaidItemCacheTtlMs(),
    raiderIoCharacterCacheTtlMs: envRaiderIoCharacterCacheTtlMs(),
    warcraftLogsCharacterCacheTtlMs: envWarcraftLogsCharacterCacheTtlMs(),
    warcraftLogsRecentReportLimit: envWarcraftLogsRecentReportLimit(),
    warcraftLogsReportFightTableLimit: envWarcraftLogsReportFightTableLimit(),
    guildRosterMemberLimit: envGuildRosterMemberLimit(),
    guildRosterRefreshStepBudgetMs: envGuildRosterRefreshStepBudgetMs(),
    guildRosterSyncJobTtlSeconds: envGuildRosterSyncJobTtlSeconds(),
    guildRosterShardedCacheEnabled: envGuildRosterShardedCacheEnabled(),
    guildRosterShardedCacheThreshold: envGuildRosterShardedCacheThreshold(),
    guildRosterBattleNetStepSize: envGuildRosterBattleNetStepSize(),
    guildRosterBattleNetTtlSeconds: envGuildRosterBattleNetTtlSeconds(),
    guildRosterRaiderIoStepSize: envGuildRosterRaiderIoStepSize(),
    guildRosterRaiderIoTtlSeconds: envGuildRosterRaiderIoTtlSeconds(),
    guildRosterClientDrivenSyncEnabled: envGuildRosterClientDrivenSyncEnabled(),
    guildRosterClientStepDelayMs: envGuildRosterClientStepDelayMs(),
    guildRosterClientRequestTimeoutMs: envGuildRosterClientRequestTimeoutMs(),
    guildRosterClientMaxSteps: envGuildRosterClientMaxSteps(),
    guildRosterWclEnabled: envGuildRosterWclEnabled(),
    guildRosterWclMemberLimit: envGuildRosterWclMemberLimit(),
    guildRosterWclStepSize: envGuildRosterWclStepSize(),
    guildRosterWclConcurrency: envGuildRosterWclConcurrency(),
    guildRosterWclMaxConcurrency: envGuildRosterWclMaxConcurrency(),
    guildRosterProfileWclTtlSeconds: envGuildRosterProfileWclTtlSeconds(),
    warcraftLogsRosterRequestTimeoutMs: envWarcraftLogsRosterRequestTimeoutMs(),
    warcraftLogsRosterRequestRetries: envWarcraftLogsRosterRequestRetries(),
    warcraftLogsRosterRecentReportLimit:
      envWarcraftLogsRosterRecentReportLimit(),
    warcraftLogsRosterReportFightTableLimit:
      envWarcraftLogsRosterReportFightTableLimit(),
    warcraftLogsRosterReportTableConcurrency:
      envWarcraftLogsRosterReportTableConcurrency(),
    updatedAt: null,
    updatedBy: null,
    source: "defaults",
  };
}

function normalizeSettings(
  data?: DashboardApiSettingsInput | null,
  source: DashboardApiSettingsSource = "firestore",
): DashboardApiSettings {
  const fallback = defaultDashboardApiSettings();
  const backgroundRefreshMinSeconds = integerValue(
    data?.backgroundRefreshMinSeconds,
    fallback.backgroundRefreshMinSeconds,
    MIN_BACKGROUND_REFRESH_SECONDS,
    MAX_REFRESH_SECONDS,
  );
  const profileViewRefreshMinSeconds = integerValue(
    data?.profileViewRefreshMinSeconds,
    fallback.profileViewRefreshMinSeconds,
    MIN_BACKGROUND_REFRESH_SECONDS,
    MAX_REFRESH_SECONDS,
  );
  const profileExternalRefreshMinSeconds = integerValue(
    data?.profileExternalRefreshMinSeconds,
    fallback.profileExternalRefreshMinSeconds,
    MIN_BACKGROUND_REFRESH_SECONDS,
    MAX_REFRESH_SECONDS,
  );
  const profileCharacterRefreshMaxConcurrency = integerValue(
    data?.profileCharacterRefreshMaxConcurrency,
    fallback.profileCharacterRefreshMaxConcurrency,
    1,
    8,
  );
  const profileExternalRefreshMaxConcurrency = integerValue(
    data?.profileExternalRefreshMaxConcurrency,
    fallback.profileExternalRefreshMaxConcurrency,
    1,
    6,
  );
  const credentials = resolveWarcraftLogsCredentials(data);
  const guildRosterWclMaxConcurrency = integerValue(
    data?.guildRosterWclMaxConcurrency,
    fallback.guildRosterWclMaxConcurrency,
    1,
    8,
  );

  return {
    backgroundRefreshMinSeconds,
    profileViewRefreshMinSeconds,
    profileExternalRefreshMinSeconds,
    profileExternalRefreshBatchLimit: integerValue(
      data?.profileExternalRefreshBatchLimit,
      fallback.profileExternalRefreshBatchLimit,
      1,
      500,
    ),
    profileCharacterRefreshConcurrency: integerValue(
      data?.profileCharacterRefreshConcurrency,
      fallback.profileCharacterRefreshConcurrency,
      0,
      profileCharacterRefreshMaxConcurrency,
    ),
    profileCharacterRefreshMaxConcurrency,
    profileExternalRefreshConcurrency: integerValue(
      data?.profileExternalRefreshConcurrency,
      fallback.profileExternalRefreshConcurrency,
      0,
      profileExternalRefreshMaxConcurrency,
    ),
    profileExternalRefreshMaxConcurrency,
    warcraftLogsClientId: credentials.clientId || null,
    warcraftLogsClientSecretConfigured: credentials.configured,
    warcraftLogsCredentialsSource: credentials.source,
    warcraftLogsBaseUrl: credentials.baseUrl,
    warcraftLogsDebugAuditLogs: credentials.debugAuditLogs,
    dashboardApiDebugAuditLogs: booleanValue(
      data?.dashboardApiDebugAuditLogs,
      fallback.dashboardApiDebugAuditLogs,
    ),
    dashboardApiWarningAuditLogs: booleanValue(
      data?.dashboardApiWarningAuditLogs,
      fallback.dashboardApiWarningAuditLogs,
    ),
    guildRosterRegion: cleanText(data?.guildRosterRegion, 20).toLowerCase() || fallback.guildRosterRegion,
    guildRosterRealm: cleanText(data?.guildRosterRealm, 80).toLowerCase() || fallback.guildRosterRealm,
    guildRosterName: cleanText(data?.guildRosterName, 120) || fallback.guildRosterName,
    guildRosterCacheTtlSeconds: integerValue(
      data?.guildRosterCacheTtlSeconds,
      fallback.guildRosterCacheTtlSeconds,
      300,
      86_400,
    ),
    guildRosterCacheReadTtlMs: integerValue(
      data?.guildRosterCacheReadTtlMs,
      fallback.guildRosterCacheReadTtlMs,
      30_000,
      300_000,
    ),
    guildRosterCacheWriteBatchSize: integerValue(
      data?.guildRosterCacheWriteBatchSize,
      fallback.guildRosterCacheWriteBatchSize,
      1,
      250,
    ),
    guildRosterCacheDeleteStaleMembers: booleanValue(
      data?.guildRosterCacheDeleteStaleMembers,
      fallback.guildRosterCacheDeleteStaleMembers,
    ),
    guildRosterRefreshMaxConcurrency: integerValue(
      data?.guildRosterRefreshMaxConcurrency,
      fallback.guildRosterRefreshMaxConcurrency,
      1,
      12,
    ),
    guildRosterRefreshConcurrency: integerValue(
      data?.guildRosterRefreshConcurrency,
      fallback.guildRosterRefreshConcurrency,
      1,
      integerValue(
        data?.guildRosterRefreshMaxConcurrency,
        fallback.guildRosterRefreshMaxConcurrency,
        1,
        12,
      ),
    ),
    raiderIoRequestTimeoutMs: integerValue(
      data?.raiderIoRequestTimeoutMs,
      fallback.raiderIoRequestTimeoutMs,
      2_500,
      30_000,
    ),
    raiderIoRequestRetries: integerValue(
      data?.raiderIoRequestRetries,
      fallback.raiderIoRequestRetries,
      0,
      4,
    ),
    battleNetRequestTimeoutMs: integerValue(
      data?.battleNetRequestTimeoutMs,
      fallback.battleNetRequestTimeoutMs,
      2_500,
      30_000,
    ),
    battleNetRequestRetries: integerValue(
      data?.battleNetRequestRetries,
      fallback.battleNetRequestRetries,
      0,
      5,
    ),
    profileReadCacheTtlMs: integerValue(
      data?.profileReadCacheTtlMs,
      fallback.profileReadCacheTtlMs,
      30_000,
      300_000,
    ),
    profileListCacheTtlMs: integerValue(
      data?.profileListCacheTtlMs,
      fallback.profileListCacheTtlMs,
      30_000,
      300_000,
    ),
    profileCharacterLinksCacheTtlMs: integerValue(
      data?.profileCharacterLinksCacheTtlMs,
      fallback.profileCharacterLinksCacheTtlMs,
      30_000,
      600_000,
    ),
    raidListCacheTtlMs: integerValue(
      data?.raidListCacheTtlMs,
      fallback.raidListCacheTtlMs,
      30_000,
      300_000,
    ),
    raidItemCacheTtlMs: integerValue(
      data?.raidItemCacheTtlMs,
      fallback.raidItemCacheTtlMs,
      10_000,
      120_000,
    ),
    raiderIoCharacterCacheTtlMs: integerValue(
      data?.raiderIoCharacterCacheTtlMs,
      fallback.raiderIoCharacterCacheTtlMs,
      0,
      MAX_CHARACTER_CACHE_TTL_MS,
    ),
    warcraftLogsCharacterCacheTtlMs: credentials.characterCacheTtlMs,
    warcraftLogsRecentReportLimit: credentials.recentReportLimit,
    warcraftLogsReportFightTableLimit: credentials.reportFightTableLimit,
    guildRosterMemberLimit: integerValue(
      data?.guildRosterMemberLimit,
      fallback.guildRosterMemberLimit,
      1,
      1000,
    ),
    guildRosterRefreshStepBudgetMs: integerValue(
      data?.guildRosterRefreshStepBudgetMs,
      fallback.guildRosterRefreshStepBudgetMs,
      5_000,
      38_000,
    ),
    guildRosterSyncJobTtlSeconds: integerValue(
      data?.guildRosterSyncJobTtlSeconds,
      fallback.guildRosterSyncJobTtlSeconds,
      5 * 60,
      6 * 60 * 60,
    ),
    guildRosterShardedCacheEnabled: booleanValue(
      data?.guildRosterShardedCacheEnabled,
      fallback.guildRosterShardedCacheEnabled,
    ),
    guildRosterShardedCacheThreshold: integerValue(
      data?.guildRosterShardedCacheThreshold,
      fallback.guildRosterShardedCacheThreshold,
      1,
      1000,
    ),
    guildRosterBattleNetStepSize: integerValue(
      data?.guildRosterBattleNetStepSize,
      fallback.guildRosterBattleNetStepSize,
      0,
      100,
    ),
    guildRosterBattleNetTtlSeconds: integerValue(
      data?.guildRosterBattleNetTtlSeconds,
      fallback.guildRosterBattleNetTtlSeconds,
      300,
      604_800,
    ),
    guildRosterRaiderIoStepSize: integerValue(
      data?.guildRosterRaiderIoStepSize,
      fallback.guildRosterRaiderIoStepSize,
      0,
      100,
    ),
    guildRosterRaiderIoTtlSeconds: integerValue(
      data?.guildRosterRaiderIoTtlSeconds,
      fallback.guildRosterRaiderIoTtlSeconds,
      300,
      604_800,
    ),
    guildRosterClientDrivenSyncEnabled: booleanValue(
      data?.guildRosterClientDrivenSyncEnabled,
      fallback.guildRosterClientDrivenSyncEnabled,
    ),
    guildRosterClientStepDelayMs: integerValue(
      data?.guildRosterClientStepDelayMs,
      fallback.guildRosterClientStepDelayMs,
      0,
      5_000,
    ),
    guildRosterClientRequestTimeoutMs: integerValue(
      data?.guildRosterClientRequestTimeoutMs,
      fallback.guildRosterClientRequestTimeoutMs,
      5_000,
      60_000,
    ),
    guildRosterClientMaxSteps: integerValue(
      data?.guildRosterClientMaxSteps,
      fallback.guildRosterClientMaxSteps,
      1,
      10_000,
    ),
    guildRosterWclEnabled: booleanValue(
      data?.guildRosterWclEnabled,
      fallback.guildRosterWclEnabled,
    ),
    guildRosterWclMemberLimit: integerValue(
      data?.guildRosterWclMemberLimit,
      fallback.guildRosterWclMemberLimit,
      0,
      1000,
    ),
    guildRosterWclStepSize: integerValue(
      data?.guildRosterWclStepSize,
      fallback.guildRosterWclStepSize,
      0,
      20,
    ),
    guildRosterWclConcurrency: integerValue(
      data?.guildRosterWclConcurrency,
      fallback.guildRosterWclConcurrency,
      0,
      guildRosterWclMaxConcurrency,
    ),
    guildRosterWclMaxConcurrency,
    guildRosterProfileWclTtlSeconds: integerValue(
      data?.guildRosterProfileWclTtlSeconds,
      fallback.guildRosterProfileWclTtlSeconds,
      300,
      604_800,
    ),
    warcraftLogsRosterRequestTimeoutMs: credentials.rosterRequestTimeoutMs,
    warcraftLogsRosterRequestRetries: credentials.rosterRequestRetries,
    warcraftLogsRosterRecentReportLimit: credentials.rosterRecentReportLimit,
    warcraftLogsRosterReportFightTableLimit:
      credentials.rosterReportFightTableLimit,
    warcraftLogsRosterReportTableConcurrency:
      credentials.rosterReportTableConcurrency,
    updatedAt: timestampToIso(data?.updatedAt),
    updatedBy: typeof data?.updatedBy === "string" ? data.updatedBy : null,
    source,
  };
}

export async function getDashboardApiSettings(options: { bypassCache?: boolean } = {}): Promise<DashboardApiSettings> {
  if (!options.bypassCache && settingsCacheFresh()) {
    return globalThis.__mistblossomDashboardApiSettingsCache!.settings;
  }

  if (!hasFirebaseProfileConfig()) {
    return setSettingsCache(defaultDashboardApiSettings());
  }

  const settings = await resilientRead(
    "dashboard-api-settings",
    async () => {
      const snapshot = await getFirebaseAdminDb()
        .collection(SETTINGS_COLLECTION)
        .doc(DASHBOARD_API_SETTINGS_DOC_ID)
        .get();
      return snapshot.exists
        ? normalizeSettings(snapshot.data() || null, "firestore")
        : globalThis.__mistblossomDashboardApiSettingsCache?.settings || defaultDashboardApiSettings();
    },
    {
      ttlMs: SETTINGS_CACHE_TTL_MS,
      timeoutMs: 2_500,
      circuitKey: "firebase-settings-read",
      circuitTtlMs: 90_000,
      bypassCache: Boolean(options.bypassCache),
      fallback: () => globalThis.__mistblossomDashboardApiSettingsCache?.settings || defaultDashboardApiSettings(),
      logEvent: "dashboard_api.settings_read_failed",
    },
  );

  return setSettingsCache(settings);
}

export async function setDashboardApiSettings(
  input: DashboardApiSettingsInput,
  actor?: DashboardSession | null,
) {
  if (!hasFirebaseProfileConfig())
    throw new Error(
      "Firebase не налаштований для збереження параметрів фонового API.",
    );

  const doc = getFirebaseAdminDb()
    .collection(SETTINGS_COLLECTION)
    .doc(DASHBOARD_API_SETTINGS_DOC_ID);
  const existingSnapshot = await doc.get().catch(() => null);
  const existingData = existingSnapshot?.exists
    ? existingSnapshot.data() || null
    : null;
  const incomingClientId = cleanText(input.warcraftLogsClientId, 240);
  const incomingClientSecret = cleanText(input.warcraftLogsClientSecret, 500);
  const shouldClearSecret = truthyFormFlag(input.clearWarcraftLogsClientSecret);
  const existingClientSecret = cleanText(
    existingData?.warcraftLogsClientSecret,
    500,
  );
  const nextClientSecret = shouldClearSecret
    ? ""
    : incomingClientSecret || existingClientSecret;
  const settings = normalizeSettings(
    { ...input, warcraftLogsClientSecret: nextClientSecret },
    "firestore",
  );

  const payload: Record<string, unknown> = {
    backgroundRefreshMinSeconds: settings.backgroundRefreshMinSeconds,
    profileViewRefreshMinSeconds: settings.profileViewRefreshMinSeconds,
    profileExternalRefreshMinSeconds: settings.profileExternalRefreshMinSeconds,
    profileExternalRefreshBatchLimit: settings.profileExternalRefreshBatchLimit,
    profileCharacterRefreshConcurrency:
      settings.profileCharacterRefreshConcurrency,
    profileCharacterRefreshMaxConcurrency:
      settings.profileCharacterRefreshMaxConcurrency,
    profileExternalRefreshConcurrency:
      settings.profileExternalRefreshConcurrency,
    profileExternalRefreshMaxConcurrency:
      settings.profileExternalRefreshMaxConcurrency,
    warcraftLogsClientId: incomingClientId || FieldValue.delete(),
    warcraftLogsBaseUrl:
      settings.warcraftLogsBaseUrl === DEFAULT_WARCRAFT_LOGS_BASE_URL
        ? FieldValue.delete()
        : settings.warcraftLogsBaseUrl,
    warcraftLogsDebugAuditLogs: settings.warcraftLogsDebugAuditLogs,
    dashboardApiDebugAuditLogs: settings.dashboardApiDebugAuditLogs,
    dashboardApiWarningAuditLogs: settings.dashboardApiWarningAuditLogs,
    guildRosterRegion: settings.guildRosterRegion,
    guildRosterRealm: settings.guildRosterRealm,
    guildRosterName: settings.guildRosterName,
    guildRosterCacheTtlSeconds: settings.guildRosterCacheTtlSeconds,
    guildRosterCacheReadTtlMs: settings.guildRosterCacheReadTtlMs,
    guildRosterCacheWriteBatchSize: settings.guildRosterCacheWriteBatchSize,
    guildRosterCacheDeleteStaleMembers: settings.guildRosterCacheDeleteStaleMembers,
    guildRosterRefreshConcurrency: settings.guildRosterRefreshConcurrency,
    guildRosterRefreshMaxConcurrency: settings.guildRosterRefreshMaxConcurrency,
    raiderIoRequestTimeoutMs: settings.raiderIoRequestTimeoutMs,
    raiderIoRequestRetries: settings.raiderIoRequestRetries,
    battleNetRequestTimeoutMs: settings.battleNetRequestTimeoutMs,
    battleNetRequestRetries: settings.battleNetRequestRetries,
    profileReadCacheTtlMs: settings.profileReadCacheTtlMs,
    profileListCacheTtlMs: settings.profileListCacheTtlMs,
    profileCharacterLinksCacheTtlMs: settings.profileCharacterLinksCacheTtlMs,
    raidListCacheTtlMs: settings.raidListCacheTtlMs,
    raidItemCacheTtlMs: settings.raidItemCacheTtlMs,
    raiderIoCharacterCacheTtlMs: settings.raiderIoCharacterCacheTtlMs,
    warcraftLogsCharacterCacheTtlMs: settings.warcraftLogsCharacterCacheTtlMs,
    warcraftLogsRecentReportLimit: settings.warcraftLogsRecentReportLimit,
    warcraftLogsReportFightTableLimit:
      settings.warcraftLogsReportFightTableLimit,
    guildRosterMemberLimit: settings.guildRosterMemberLimit,
    guildRosterRefreshStepBudgetMs: settings.guildRosterRefreshStepBudgetMs,
    guildRosterSyncJobTtlSeconds: settings.guildRosterSyncJobTtlSeconds,
    guildRosterShardedCacheEnabled: settings.guildRosterShardedCacheEnabled,
    guildRosterShardedCacheThreshold: settings.guildRosterShardedCacheThreshold,
    guildRosterBattleNetStepSize: settings.guildRosterBattleNetStepSize,
    guildRosterBattleNetTtlSeconds: settings.guildRosterBattleNetTtlSeconds,
    guildRosterRaiderIoStepSize: settings.guildRosterRaiderIoStepSize,
    guildRosterRaiderIoTtlSeconds: settings.guildRosterRaiderIoTtlSeconds,
    guildRosterClientDrivenSyncEnabled:
      settings.guildRosterClientDrivenSyncEnabled,
    guildRosterClientStepDelayMs: settings.guildRosterClientStepDelayMs,
    guildRosterClientRequestTimeoutMs:
      settings.guildRosterClientRequestTimeoutMs,
    guildRosterClientMaxSteps: settings.guildRosterClientMaxSteps,
    guildRosterWclEnabled: settings.guildRosterWclEnabled,
    guildRosterWclMemberLimit: settings.guildRosterWclMemberLimit,
    guildRosterWclStepSize: settings.guildRosterWclStepSize,
    guildRosterWclConcurrency: settings.guildRosterWclConcurrency,
    guildRosterWclMaxConcurrency: settings.guildRosterWclMaxConcurrency,
    guildRosterProfileWclTtlSeconds: settings.guildRosterProfileWclTtlSeconds,
    warcraftLogsRosterRequestTimeoutMs:
      settings.warcraftLogsRosterRequestTimeoutMs,
    warcraftLogsRosterRequestRetries: settings.warcraftLogsRosterRequestRetries,
    warcraftLogsRosterRecentReportLimit:
      settings.warcraftLogsRosterRecentReportLimit,
    warcraftLogsRosterReportFightTableLimit:
      settings.warcraftLogsRosterReportFightTableLimit,
    warcraftLogsRosterReportTableConcurrency:
      settings.warcraftLogsRosterReportTableConcurrency,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor?.name || actor?.login || actor?.id || null,
  };

  if (shouldClearSecret) {
    payload.warcraftLogsClientSecret = FieldValue.delete();
    tokenCacheResetHint();
  } else if (incomingClientSecret) {
    payload.warcraftLogsClientSecret = incomingClientSecret;
    tokenCacheResetHint();
  }

  await doc.set(payload, { merge: true });

  return setSettingsCache({
    ...settings,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.name || actor?.login || actor?.id || null,
    source: "firestore",
  });
}

function tokenCacheResetHint() {
  globalThis.__mistblossomWarcraftLogsCredentialsCache = undefined;
  // Token cache lives in src/lib/warcraftLogs.ts and is intentionally private.
  // Changing credentials should not block saving settings; the next serverless
  // invocation will use fresh credentials, and warm instances expire tokens quickly.
}

export async function getWarcraftLogsApiCredentials(): Promise<WarcraftLogsApiCredentials> {
  const cached = globalThis.__mistblossomWarcraftLogsCredentialsCache;
  if (cached && Date.now() - cached.cachedAt < SETTINGS_CACHE_TTL_MS) return cached.credentials;

  if (!hasFirebaseProfileConfig()) {
    const credentials = resolveWarcraftLogsCredentials(null);
    globalThis.__mistblossomWarcraftLogsCredentialsCache = { credentials, cachedAt: Date.now() };
    return credentials;
  }

  const credentials = await resilientRead(
    "warcraft-logs-api-credentials",
    async () => {
      const snapshot = await getFirebaseAdminDb()
        .collection(SETTINGS_COLLECTION)
        .doc(DASHBOARD_API_SETTINGS_DOC_ID)
        .get();
      return resolveWarcraftLogsCredentials(snapshot.exists ? snapshot.data() || null : null);
    },
    {
      ttlMs: SETTINGS_CACHE_TTL_MS,
      timeoutMs: 2_500,
      circuitKey: "firebase-settings-read",
      circuitTtlMs: 90_000,
      fallback: () => getRuntimeStaleValue<WarcraftLogsApiCredentials>("warcraft-logs-api-credentials") || resolveWarcraftLogsCredentials(null),
      logEvent: "warcraft_logs.settings_read_failed",
    },
  );

  globalThis.__mistblossomWarcraftLogsCredentialsCache = { credentials, cachedAt: Date.now() };
  setRuntimeCachedValue("warcraft-logs-api-credentials", credentials);
  return credentials;
}

export async function getExternalCharacterDataSettings() {
  const settings = await getDashboardApiSettings();
  return {
    raiderIoCharacterCacheTtlMs: settings.raiderIoCharacterCacheTtlMs,
    warcraftLogsCharacterCacheTtlMs: settings.warcraftLogsCharacterCacheTtlMs,
    warcraftLogsRecentReportLimit: settings.warcraftLogsRecentReportLimit,
    warcraftLogsReportFightTableLimit:
      settings.warcraftLogsReportFightTableLimit,
  };
}

export async function getGuildRosterSyncSettings() {
  const settings = await getDashboardApiSettings();
  return {
    region: settings.guildRosterRegion,
    realm: settings.guildRosterRealm,
    guildName: settings.guildRosterName,
    cacheTtlSeconds: settings.guildRosterCacheTtlSeconds,
    cacheReadTtlMs: settings.guildRosterCacheReadTtlMs,
    cacheWriteBatchSize: settings.guildRosterCacheWriteBatchSize,
    cacheDeleteStaleMembers: settings.guildRosterCacheDeleteStaleMembers,
    refreshConcurrency: settings.guildRosterRefreshConcurrency,
    refreshMaxConcurrency: settings.guildRosterRefreshMaxConcurrency,
    raiderIoRequestTimeoutMs: settings.raiderIoRequestTimeoutMs,
    raiderIoRequestRetries: settings.raiderIoRequestRetries,
    battleNetRequestTimeoutMs: settings.battleNetRequestTimeoutMs,
    battleNetRequestRetries: settings.battleNetRequestRetries,
    memberLimit: settings.guildRosterMemberLimit,
    stepBudgetMs: settings.guildRosterRefreshStepBudgetMs,
    syncJobTtlSeconds: settings.guildRosterSyncJobTtlSeconds,
    shardedCacheEnabled: settings.guildRosterShardedCacheEnabled,
    shardedCacheThreshold: settings.guildRosterShardedCacheThreshold,
    battleNetStepSize: settings.guildRosterBattleNetStepSize,
    battleNetTtlSeconds: settings.guildRosterBattleNetTtlSeconds,
    raiderIoStepSize: settings.guildRosterRaiderIoStepSize,
    raiderIoTtlSeconds: settings.guildRosterRaiderIoTtlSeconds,
    clientDrivenSyncEnabled: settings.guildRosterClientDrivenSyncEnabled,
    clientStepDelayMs: settings.guildRosterClientStepDelayMs,
    clientRequestTimeoutMs: settings.guildRosterClientRequestTimeoutMs,
    clientMaxSteps: settings.guildRosterClientMaxSteps,
    wclEnabled: settings.guildRosterWclEnabled,
    wclMemberLimit: settings.guildRosterWclMemberLimit,
    wclStepSize: settings.guildRosterWclStepSize,
    wclConcurrency: settings.guildRosterWclConcurrency,
    wclMaxConcurrency: settings.guildRosterWclMaxConcurrency,
    profileWclTtlSeconds: settings.guildRosterProfileWclTtlSeconds,
    debugAuditLogs: settings.dashboardApiDebugAuditLogs,
    warningAuditLogs: settings.dashboardApiWarningAuditLogs,
  };
}

export async function getGuildRosterWarcraftLogsSettings() {
  const settings = await getDashboardApiSettings();
  return {
    enabled: settings.guildRosterWclEnabled,
    memberLimit: settings.guildRosterWclMemberLimit,
    stepSize: settings.guildRosterWclStepSize,
    concurrency: settings.guildRosterWclConcurrency,
    maxConcurrency: settings.guildRosterWclMaxConcurrency,
    profileTtlSeconds: settings.guildRosterProfileWclTtlSeconds,
    requestTimeoutMs: settings.warcraftLogsRosterRequestTimeoutMs,
    requestRetries: settings.warcraftLogsRosterRequestRetries,
    recentReportLimit: settings.warcraftLogsRosterRecentReportLimit,
    reportFightTableLimit: settings.warcraftLogsRosterReportFightTableLimit,
    reportTableConcurrency: settings.warcraftLogsRosterReportTableConcurrency,
  };
}

export async function getSiteRuntimeSettings() {
  const settings = await getDashboardApiSettings();
  return {
    profileReadCacheTtlMs: settings.profileReadCacheTtlMs,
    profileListCacheTtlMs: settings.profileListCacheTtlMs,
    profileCharacterLinksCacheTtlMs: settings.profileCharacterLinksCacheTtlMs,
    raidListCacheTtlMs: settings.raidListCacheTtlMs,
    raidItemCacheTtlMs: settings.raidItemCacheTtlMs,
    dashboardApiWarningAuditLogs: settings.dashboardApiWarningAuditLogs,
    dashboardApiDebugAuditLogs: settings.dashboardApiDebugAuditLogs,
  };
}

export function dashboardApiSettingsSummary(settings: DashboardApiSettings) {
  const wcl = settings.warcraftLogsClientSecretConfigured
    ? `WCL: ${settings.warcraftLogsCredentialsSource}`
    : "WCL: не налаштовано";
  const wclDebug = settings.warcraftLogsDebugAuditLogs
    ? "WCL debug: увімкнено"
    : "WCL debug: вимкнено";
  const rosterWcl = settings.guildRosterWclEnabled
    ? `WCL roster: ${settings.guildRosterWclMemberLimit > 0 ? settings.guildRosterWclMemberLimit : "усі"}; крок ${settings.guildRosterWclStepSize}; timeout ${settings.warcraftLogsRosterRequestTimeoutMs}мс`
    : "WCL roster: вимкнено";
  const rosterSync = `Guild roster: ${settings.guildRosterName}-${settings.guildRosterRealm}-${settings.guildRosterRegion}; ${settings.guildRosterMemberLimit} перс.; Battle.net крок ${settings.guildRosterBattleNetStepSize}; Raider.IO крок ${settings.guildRosterRaiderIoStepSize}; кеш ${settings.guildRosterCacheTtlSeconds}с; бюджет ${settings.guildRosterRefreshStepBudgetMs}мс; client ${settings.guildRosterClientDrivenSyncEnabled ? "ON" : "OFF"}`;
  const apiDebug = `API logs: debug ${settings.dashboardApiDebugAuditLogs ? "ON" : "OFF"}, warnings ${settings.dashboardApiWarningAuditLogs ? "ON" : "OFF"}`;
  return `Оновлення: ${Math.round(settings.backgroundRefreshMinSeconds / 60)} хв; персонажі: ${Math.round(settings.profileViewRefreshMinSeconds / 60)} хв; batch: ${settings.profileExternalRefreshBatchLimit}; ${wcl}; ${wclDebug}; ${apiDebug}; WCL reports: ${settings.warcraftLogsRecentReportLimit}/${settings.warcraftLogsReportFightTableLimit}; ${rosterSync}; ${rosterWcl}.`;
}

export function dashboardApiSettingsMinBackgroundRefreshSeconds() {
  return MIN_BACKGROUND_REFRESH_SECONDS;
}
