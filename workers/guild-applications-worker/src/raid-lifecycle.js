import { dashboardRaidLifecycleEndpoint, getConfig } from "./config.js";
import { logWorkerEvent } from "./logger.js";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function cleanPositiveInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.floor(number), max));
}

function requestId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function dashboardHeaders(env, token, extra = {}) {
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "x-worker-stats-token": token,
    "user-agent": "Mistblossom-Guild-Worker/RaidLifecycle",
    ...extra,
  };

  const accessClientId = String(env?.CF_ACCESS_CLIENT_ID || env?.CLOUDFLARE_ACCESS_CLIENT_ID || "").trim();
  const accessClientSecret = String(env?.CF_ACCESS_CLIENT_SECRET || env?.CLOUDFLARE_ACCESS_CLIENT_SECRET || "").trim();
  if (accessClientId && accessClientSecret) {
    headers["CF-Access-Client-Id"] = accessClientId;
    headers["CF-Access-Client-Secret"] = accessClientSecret;
  }
  return headers;
}

async function fetchDashboardJson(env, url, token, init = {}, options = {}) {
  const config = getConfig(env);
  const method = String(init.method || "GET").toUpperCase();
  const timeoutMs = cleanPositiveInt(
    options.timeoutMs || config.dashboardApiTimeoutMs,
    method === "GET" ? 9000 : 12000,
    1500,
    30000,
  );
  const retries = Math.max(0, Math.min(3, Number(options.retries ?? (method === "GET" ? 1 : 0))));
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        headers: dashboardHeaders(env, token, init.headers || {}),
        signal: controller.signal,
      });
      const raw = await response.text().catch(() => "");
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < retries) {
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(5000, retryAfter * 1000)
          : 450 + attempt * 650;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return { response, raw, data };
    } catch (error) {
      lastError = error;
      if (attempt < retries && (error?.name === "AbortError" || /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(String(error?.message || error)))) {
        await new Promise((resolve) => setTimeout(resolve, 350 + attempt * 650));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Dashboard lifecycle request failed");
}

function timezoneOffsetMs(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour === "24" ? "0" : values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return asUtc - date.getTime();
  } catch {
    return 0;
  }
}

function raidDateTimeToUtcMs(raid, env) {
  const date = String(raid?.date || "").trim();
  const time = String(raid?.time || "00:00").trim();
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const y = Number(dateMatch[1]);
  const m = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const timeZone = String(env?.RAID_TIME_ZONE || env?.NEXT_PUBLIC_RAID_TIME_ZONE || "Europe/Kyiv");
  return guess.getTime() - timezoneOffsetMs(guess, timeZone);
}

function cleanMinutes(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(7 * 24 * 60, Math.floor(number)));
}

function cleanHours(value, fallback = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(168, Math.floor(number)));
}

function closeDeadlineMs(raid, startsAtMs) {
  const minutesBefore = raid?.registrationLockEnabled
    ? cleanMinutes(raid?.registrationLockMinutesBefore, 0)
    : 0;
  return startsAtMs - minutesBefore * MINUTE_MS;
}

function deletionEligibleAtMs(raid, startsAtMs, closeAtMs, env) {
  const deleteAfterStartHours = cleanHours(env?.RAID_DISCORD_DELETE_AFTER_START_HOURS, 4);
  const deleteAfterCloseMinutes = cleanMinutes(env?.RAID_DISCORD_DELETE_AFTER_CLOSE_MINUTES, 60);
  const afterStart = startsAtMs + deleteAfterStartHours * HOUR_MS;
  const afterClose = closeAtMs ? closeAtMs + deleteAfterCloseMinutes * MINUTE_MS : 0;
  return Math.max(afterStart, afterClose);
}

function parseIsoMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}

export function decideRaidLifecycleAction(raid, env, nowMs = Date.now()) {
  const startsAtMs = raidDateTimeToUtcMs(raid, env);
  if (startsAtMs === null) {
    return { close: false, deleteDiscord: false, reason: "invalid-start-time" };
  }

  const status = String(raid?.status || "");
  const isClosed = status === "closed";
  const isPublished = status === "published";
  const closeAtMs = closeDeadlineMs(raid, startsAtMs);
  const shouldClose = isPublished && nowMs >= closeAtMs;
  const closedAtMs = parseIsoMs(raid?.closedAt) || (isClosed ? closeAtMs : null);
  const deleteAtMs = deletionEligibleAtMs(raid, startsAtMs, closedAtMs, env);
  const hasDiscordMessage = Boolean(raid?.channelId && raid?.messageId);
  const alreadyDeleted = Boolean(raid?.discordDeletedAt);
  const shouldDeleteDiscord = isClosed && hasDiscordMessage && !alreadyDeleted && nowMs >= deleteAtMs;

  return {
    close: shouldClose,
    deleteDiscord: shouldDeleteDiscord,
    startsAt: new Date(startsAtMs).toISOString(),
    closeEligibleAt: new Date(closeAtMs).toISOString(),
    discordDeleteEligibleAt: new Date(deleteAtMs).toISOString(),
    reason: shouldClose ? "close-due" : shouldDeleteDiscord ? "discord-delete-due" : "noop",
  };
}

export function dashboardRaidLifecycleToken(env) {
  return getConfig(env).raidLifecycleToken;
}

function lifecyclePlanEndpoint(env) {
  const url = new URL(dashboardRaidLifecycleEndpoint(env));
  url.searchParams.set("mode", "plan");
  if (!url.searchParams.get("limit")) url.searchParams.set("limit", "100");
  return url.toString();
}

function lifecycleActionEndpoint(env) {
  const url = new URL(dashboardRaidLifecycleEndpoint(env));
  url.search = "";
  return url.toString();
}

async function postLifecycleAction(env, token, action, raid, run) {
  const idempotencyKey = `raid-lifecycle:${action}:${raid.id}`;
  const { response, raw, data } = await fetchDashboardJson(
    env,
    lifecycleActionEndpoint(env),
    token,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        action,
        raidId: raid.id,
        source: "cloudflare-worker",
        reason: run.reason,
        requestId: run.requestId,
      }),
    },
    { timeoutMs: 12000, retries: 1 },
  );

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Dashboard lifecycle action failed (${response.status}): ${String(raw || "").slice(0, 180)}`);
  }

  return data || { ok: true };
}

/**
 * Idempotent raid lifecycle runner.
 * The Worker decides what is due, while the dashboard performs Firestore/Discord
 * mutations transactionally and remains the source of truth.
 *
 * @param {Record<string, unknown>} env Cloudflare Worker env bindings.
 * @param {string} reason Human-readable run reason: cloudflare-cron, manual-dashboard, etc.
 * @param {{requestId?: string, nowMs?: number}} options Optional execution metadata.
 */
export async function runRaidLifecycle(env, reason = "scheduled", options = {}) {
  const run = {
    requestId: options.requestId || requestId(),
    reason: String(reason || "scheduled"),
    nowMs: Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now(),
  };
  const token = dashboardRaidLifecycleToken(env);
  if (!token) {
    logWorkerEvent("warn", "raid_lifecycle.missing_token", run);
    return { ok: false, error: "missing RAID_LIFECYCLE_SECRET", ...run };
  }

  logWorkerEvent("info", "raid_lifecycle.start", run);

  let planData;
  try {
    const { response, raw, data } = await fetchDashboardJson(
      env,
      lifecyclePlanEndpoint(env),
      token,
      { method: "GET" },
      { timeoutMs: 12000, retries: 1 },
    );
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || `Dashboard lifecycle plan failed (${response.status}): ${String(raw || "").slice(0, 180)}`);
    }
    planData = data || {};
  } catch (error) {
    logWorkerEvent("error", "raid_lifecycle.plan_failed", { ...run, message: error?.message });
    return { ok: false, error: error?.message || "plan failed", ...run };
  }

  const raids = Array.isArray(planData.items)
    ? planData.items
    : Array.isArray(planData.raids)
      ? planData.raids
      : [];

  const result = {
    ok: true,
    ...run,
    total: raids.length,
    checked: 0,
    closed: 0,
    discordDeleted: 0,
    skipped: 0,
    errors: [],
  };

  for (const raid of raids) {
    const raidId = String(raid?.id || "").trim();
    if (!raidId) {
      result.skipped += 1;
      continue;
    }

    result.checked += 1;
    try {
      const decision = decideRaidLifecycleAction(raid, env, run.nowMs);
      logWorkerEvent("info", "raid_lifecycle.raid_decision", {
        ...run,
        raidId,
        status: raid.status,
        decision,
      });

      let effectiveRaid = raid;
      if (decision.close) {
        const closeResult = await postLifecycleAction(env, token, "close", raid, run);
        result.closed += closeResult?.changed === false ? 0 : 1;
        effectiveRaid = { ...raid, status: "closed", closedAt: new Date(run.nowMs).toISOString(), closedReason: "auto" };
        logWorkerEvent("info", "raid_lifecycle.raid_closed", { ...run, raidId, changed: closeResult?.changed !== false });
      }

      const deleteDecision = decision.deleteDiscord
        ? decision
        : decideRaidLifecycleAction(effectiveRaid, env, run.nowMs);
      if (deleteDecision.deleteDiscord) {
        const deleteResult = await postLifecycleAction(env, token, "delete-discord", effectiveRaid, run);
        result.discordDeleted += deleteResult?.changed === false ? 0 : 1;
        logWorkerEvent("info", "raid_lifecycle.discord_deleted", { ...run, raidId, changed: deleteResult?.changed !== false });
      }
    } catch (error) {
      const item = { raidId, message: error?.message || "unknown" };
      result.errors.push(item);
      logWorkerEvent("error", "raid_lifecycle.raid_failed", { ...run, ...item });
    }
  }

  if (result.errors.length) result.ok = false;
  logWorkerEvent(result.ok ? "info" : "warn", "raid_lifecycle.done", result);
  return result;
}

/** Backward-compatible alias kept for older imports. */
export async function runRaidLifecycleCron(env, reason = "scheduled") {
  return runRaidLifecycle(env, reason);
}
