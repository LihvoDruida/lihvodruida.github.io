import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { DashboardSession } from "@/lib/auth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { logDashboardEvent } from "@/lib/security";

const SETTINGS_COLLECTION = "dashboardSettings";
const DASHBOARD_API_SETTINGS_DOC_ID = "backgroundApiPolicy";

const MIN_BACKGROUND_REFRESH_SECONDS = 10 * 60;
const MAX_REFRESH_SECONDS = 24 * 60 * 60;

export type DashboardApiSettingsSource = "firestore" | "defaults";

export type DashboardApiSettings = {
  backgroundRefreshMinSeconds: number;
  profileViewRefreshMinSeconds: number;
  profileExternalRefreshMinSeconds: number;
  profileExternalRefreshBatchLimit: number;
  profileCharacterRefreshConcurrency: number;
  profileCharacterRefreshMaxConcurrency: number;
  profileExternalRefreshConcurrency: number;
  profileExternalRefreshMaxConcurrency: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  source: DashboardApiSettingsSource;
};

type DashboardApiSettingsInput = Partial<Record<keyof DashboardApiSettings, unknown>>;

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.floor(value), max));
}

function integerValue(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.floor(number), max));
}

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") return maybeTimestamp.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function defaultDashboardApiSettings(): DashboardApiSettings {
  const backgroundRefreshMinSeconds = integerEnv(
    "DASHBOARD_BACKGROUND_REFRESH_MIN_SECONDS",
    integerEnv("PROFILE_VIEW_REFRESH_MIN_SECONDS", MIN_BACKGROUND_REFRESH_SECONDS, MIN_BACKGROUND_REFRESH_SECONDS, MAX_REFRESH_SECONDS),
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
    profileExternalRefreshMinSeconds: integerEnv("PROFILE_EXTERNAL_REFRESH_MIN_SECONDS", 30 * 60, MIN_BACKGROUND_REFRESH_SECONDS, MAX_REFRESH_SECONDS),
    profileExternalRefreshBatchLimit: integerEnv("PROFILE_EXTERNAL_REFRESH_BATCH_LIMIT", 50, 1, 500),
    profileCharacterRefreshConcurrency: integerEnv("PROFILE_CHARACTER_REFRESH_CONCURRENCY", 0, 0, 8),
    profileCharacterRefreshMaxConcurrency: integerEnv("PROFILE_CHARACTER_REFRESH_MAX_CONCURRENCY", 8, 1, 8),
    profileExternalRefreshConcurrency: integerEnv("PROFILE_EXTERNAL_REFRESH_CONCURRENCY", 0, 0, 6),
    profileExternalRefreshMaxConcurrency: integerEnv("PROFILE_EXTERNAL_REFRESH_MAX_CONCURRENCY", 6, 1, 6),
    updatedAt: null,
    updatedBy: null,
    source: "defaults",
  };
}

function normalizeSettings(data?: DashboardApiSettingsInput | null, source: DashboardApiSettingsSource = "firestore"): DashboardApiSettings {
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

  return {
    backgroundRefreshMinSeconds,
    profileViewRefreshMinSeconds,
    profileExternalRefreshMinSeconds,
    profileExternalRefreshBatchLimit: integerValue(data?.profileExternalRefreshBatchLimit, fallback.profileExternalRefreshBatchLimit, 1, 500),
    profileCharacterRefreshConcurrency: integerValue(data?.profileCharacterRefreshConcurrency, fallback.profileCharacterRefreshConcurrency, 0, profileCharacterRefreshMaxConcurrency),
    profileCharacterRefreshMaxConcurrency,
    profileExternalRefreshConcurrency: integerValue(data?.profileExternalRefreshConcurrency, fallback.profileExternalRefreshConcurrency, 0, profileExternalRefreshMaxConcurrency),
    profileExternalRefreshMaxConcurrency,
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
      logDashboardEvent("warn", "dashboard_api.settings_read_failed", undefined, {
        message: error instanceof Error ? error.message : String(error || "unknown"),
      });
      return null;
    });

  if (!snapshot?.exists) return defaultDashboardApiSettings();
  return normalizeSettings(snapshot.data() || null, "firestore");
}

export async function setDashboardApiSettings(input: DashboardApiSettingsInput, actor?: DashboardSession | null) {
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase не налаштований для збереження параметрів фонового API.");

  const settings = normalizeSettings(input, "firestore");
  await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(DASHBOARD_API_SETTINGS_DOC_ID).set({
    backgroundRefreshMinSeconds: settings.backgroundRefreshMinSeconds,
    profileViewRefreshMinSeconds: settings.profileViewRefreshMinSeconds,
    profileExternalRefreshMinSeconds: settings.profileExternalRefreshMinSeconds,
    profileExternalRefreshBatchLimit: settings.profileExternalRefreshBatchLimit,
    profileCharacterRefreshConcurrency: settings.profileCharacterRefreshConcurrency,
    profileCharacterRefreshMaxConcurrency: settings.profileCharacterRefreshMaxConcurrency,
    profileExternalRefreshConcurrency: settings.profileExternalRefreshConcurrency,
    profileExternalRefreshMaxConcurrency: settings.profileExternalRefreshMaxConcurrency,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor?.name || actor?.login || actor?.id || null,
  }, { merge: true });

  return getDashboardApiSettings();
}

export function dashboardApiSettingsSummary(settings: DashboardApiSettings) {
  return `Фоновий API: ${Math.round(settings.backgroundRefreshMinSeconds / 60)} хв; профіль: ${Math.round(settings.profileViewRefreshMinSeconds / 60)} хв; batch: ${settings.profileExternalRefreshBatchLimit} проф.`;
}

export function dashboardApiSettingsMinBackgroundRefreshSeconds() {
  return MIN_BACKGROUND_REFRESH_SECONDS;
}
