import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { DashboardSession } from "@/lib/auth";
import {
  getFirebaseAdminDb,
  hasFirebaseProfileConfig,
} from "@/lib/firebaseAdmin";
import { logDashboardEvent } from "@/lib/security";

const SETTINGS_COLLECTION = "dashboardSettings";
const DASHBOARD_API_SETTINGS_DOC_ID = "backgroundApiPolicy";
const DEFAULT_WARCRAFT_LOGS_BASE_URL = "https://www.warcraftlogs.com";

const MIN_BACKGROUND_REFRESH_SECONDS = 10 * 60;
const MAX_REFRESH_SECONDS = 24 * 60 * 60;

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
  updatedAt?: string | null;
  updatedBy?: string | null;
  source: DashboardApiSettingsSource;
};

export type WarcraftLogsApiCredentials = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  source: WarcraftLogsCredentialsSource;
  configured: boolean;
};

type DashboardApiSettingsInput = Partial<
  Record<
    | keyof DashboardApiSettings
    | "warcraftLogsClientSecret"
    | "clearWarcraftLogsClientSecret",
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
    updatedAt: timestampToIso(data?.updatedAt),
    updatedBy: typeof data?.updatedBy === "string" ? data.updatedBy : null,
    source,
  };
}

export async function getDashboardApiSettings(): Promise<DashboardApiSettings> {
  if (!hasFirebaseProfileConfig()) return defaultDashboardApiSettings();
  const snapshot = await getFirebaseAdminDb()
    .collection(SETTINGS_COLLECTION)
    .doc(DASHBOARD_API_SETTINGS_DOC_ID)
    .get()
    .catch((error) => {
      logDashboardEvent(
        "warn",
        "dashboard_api.settings_read_failed",
        undefined,
        {
          message:
            error instanceof Error ? error.message : String(error || "unknown"),
        },
      );
      return null;
    });

  if (!snapshot?.exists) return defaultDashboardApiSettings();
  return normalizeSettings(snapshot.data() || null, "firestore");
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

  return getDashboardApiSettings();
}

function tokenCacheResetHint() {
  // Token cache lives in src/lib/warcraftLogs.ts and is intentionally private.
  // Changing credentials should not block saving settings; the next serverless
  // invocation will use fresh credentials, and warm instances expire tokens quickly.
}

export async function getWarcraftLogsApiCredentials(): Promise<WarcraftLogsApiCredentials> {
  if (!hasFirebaseProfileConfig()) return resolveWarcraftLogsCredentials(null);

  const snapshot = await getFirebaseAdminDb()
    .collection(SETTINGS_COLLECTION)
    .doc(DASHBOARD_API_SETTINGS_DOC_ID)
    .get()
    .catch((error) => {
      logDashboardEvent(
        "warn",
        "warcraft_logs.settings_read_failed",
        undefined,
        {
          message:
            error instanceof Error ? error.message : String(error || "unknown"),
        },
      );
      return null;
    });

  return resolveWarcraftLogsCredentials(
    snapshot?.exists ? snapshot.data() || null : null,
  );
}

export function dashboardApiSettingsSummary(settings: DashboardApiSettings) {
  const wcl = settings.warcraftLogsClientSecretConfigured
    ? `WCL: ${settings.warcraftLogsCredentialsSource}`
    : "WCL: не налаштовано";
  return `Фоновий API: ${Math.round(settings.backgroundRefreshMinSeconds / 60)} хв; профіль: ${Math.round(settings.profileViewRefreshMinSeconds / 60)} хв; batch: ${settings.profileExternalRefreshBatchLimit} проф.; ${wcl}.`;
}

export function dashboardApiSettingsMinBackgroundRefreshSeconds() {
  return MIN_BACKGROUND_REFRESH_SECONDS;
}
