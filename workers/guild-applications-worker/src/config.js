import { logWorkerEvent } from "./logger.js";

const warnedDeprecated = new Set();

function cleanUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function cleanPositiveInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.floor(number), max));
}

function envValue(env, primary, aliases = []) {
  const value = String(env?.[primary] || "").trim();
  if (value) return value;
  for (const alias of aliases) {
    const aliasValue = String(env?.[alias] || "").trim();
    if (!aliasValue) continue;
    if (!warnedDeprecated.has(alias)) {
      warnedDeprecated.add(alias);
      logWorkerEvent("warn", "config.deprecated_env_alias", { alias, replacement: primary });
    }
    return aliasValue;
  }
  return "";
}

/**
 * @typedef {object} WorkerConfig
 * @property {string} dashboardUrl
 * @property {string} adminDashboardUrl
 * @property {string} profileLookupEndpoint
 * @property {string} raidActionEndpointTemplate
 * @property {string} raidLifecycleEndpoint
 * @property {number} discordApiTimeoutMs
 * @property {number} dashboardApiTimeoutMs
 * @property {number} discordSignatureSkewMs
 */

/**
 * Validated runtime configuration. Hardcoded public URLs are intentionally not used.
 * Missing optional endpoints are derived from DASHBOARD_URL / ADMIN_DASHBOARD_URL.
 * @param {Record<string, unknown>} env
 * @returns {WorkerConfig}
 */
export function getConfig(env) {
  const dashboardUrl = cleanUrl(envValue(env, "DASHBOARD_URL", ["ADMIN_DASHBOARD_URL"]));
  const adminDashboardUrl = cleanUrl(envValue(env, "ADMIN_DASHBOARD_URL", ["DASHBOARD_URL"])) || dashboardUrl;
  const base = dashboardUrl || adminDashboardUrl;
  const requiredMissing = [];
  if (!base) requiredMissing.push("DASHBOARD_URL");

  const profileLookupEndpoint = cleanUrl(envValue(env, "DASHBOARD_PROFILE_LOOKUP_ENDPOINT", ["ADMIN_PROFILE_LOOKUP_ENDPOINT"])) ||
    (base ? new URL("/api/profile/discord-lookup", `${base}/`).toString() : "");
  const raidActionEndpointTemplate = cleanUrl(String(env?.DASHBOARD_RAID_ACTION_ENDPOINT || "").replace("{raidId}", "__RAID_ID__")).replace("__RAID_ID__", "{raidId}") ||
    (base ? new URL("/api/raids/{raidId}/discord-action", `${base}/`).toString() : "");
  const raidLifecycleEndpoint = cleanUrl(envValue(env, "DASHBOARD_RAID_LIFECYCLE_ENDPOINT")) ||
    (base ? new URL("/api/raids/lifecycle?limit=100", `${base}/`).toString() : "");

  if (requiredMissing.length) {
    logWorkerEvent("warn", "config.required_missing", { missing: requiredMissing });
  }

  return {
    dashboardUrl: base,
    adminDashboardUrl,
    profileLookupEndpoint,
    raidActionEndpointTemplate,
    raidLifecycleEndpoint,
    discordApiTimeoutMs: cleanPositiveInt(env?.DISCORD_API_TIMEOUT_MS, 14_000, 2_000, 45_000),
    dashboardApiTimeoutMs: cleanPositiveInt(env?.DASHBOARD_API_TIMEOUT_MS, 9_000, 1_500, 30_000),
    discordSignatureSkewMs: cleanPositiveInt(env?.DISCORD_SIGNATURE_MAX_SKEW_SECONDS, 120, 30, 300) * 1000,
    raidLifecycleToken: String(env?.RAID_LIFECYCLE_SECRET || env?.CRON_SECRET || env?.INTERNAL_PROFILE_LOOKUP_TOKEN || env?.DISCORD_RULES_STATS_TOKEN || env?.WORKER_STATS_TOKEN || "").trim(),
  };
}

export function dashboardUrl(env, path = "/") {
  const base = getConfig(env).dashboardUrl;
  if (!base) throw new Error("DASHBOARD_URL is required for dashboard links.");
  return new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`).toString();
}

export function dashboardRaidActionEndpoint(env, raidId) {
  const template = getConfig(env).raidActionEndpointTemplate;
  if (!template) throw new Error("DASHBOARD_RAID_ACTION_ENDPOINT or DASHBOARD_URL is required.");
  return template.replace("{raidId}", encodeURIComponent(String(raidId || "")));
}

export function dashboardRaidLifecycleEndpoint(env) {
  const endpoint = getConfig(env).raidLifecycleEndpoint;
  if (!endpoint) throw new Error("DASHBOARD_RAID_LIFECYCLE_ENDPOINT or DASHBOARD_URL is required.");
  return endpoint;
}
