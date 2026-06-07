import { elapsedMs, logWorkerEvent, nowMs } from "./logger.js";
import { getConfig } from "./config.js";
import { kvGetJson, kvPutJson } from "./kv-utils.js";

export function snowflake(value) {
  const text = String(value || "").trim();
  return /^\d{16,25}$/.test(text) ? text : "";
}

export function getDiscordUserId(interaction) {
  return interaction?.member?.user?.id || interaction?.user?.id || "unknown";
}

export function limitText(value, limit = 1900, fallback = "") {
  const text = String(value || fallback || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function sanitizeApiPathForLog(path) {
  return String(path || "")
    .replace(/([?&]access_token=)[^&]+/gi, "$1[redacted]")
    .slice(0, 700);
}

function discordRouteKey(path, method) {
  return `${String(method || "GET").toUpperCase()}:${String(path || "")}`
    .replace(/\/\d{16,25}/g, "/:id")
    .replace(/[?&](?:limit|before|after|around)=[^&]+/g, "")
    .slice(0, 180);
}

function discordRetryAfterMs(response, json, attempt) {
  const raw = Number(json?.retry_after ?? response.headers.get("retry-after") ?? response.headers.get("x-ratelimit-reset-after") ?? 0);
  const normalized = Number.isFinite(raw) && raw > 0 ? (raw > 50 ? raw : raw * 1000) : 800 + attempt * 650;
  return Math.max(500, Math.min(20_000, Math.floor(normalized + Math.random() * 300)));
}

function shouldRetryDiscordStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function waitForDiscordRoute(env, routeKey) {
  const item = await kvGetJson(env, `discord-route:${routeKey}`).catch(() => null);
  const until = Number(item?.until || 0);
  const delay = until - Date.now();
  if (delay > 0) await sleep(Math.min(delay, 15_000));
}

async function setDiscordRouteCooldown(env, routeKey, delay) {
  await kvPutJson(env, `discord-route:${routeKey}`, { until: Date.now() + delay }, Math.ceil(delay / 1000) + 5).catch((error) => {
    logWorkerEvent("warn", "discord.route_cooldown.write_failed", { routeKey, message: error?.message });
  });
}

/** Discord REST client with KV-backed route cooldowns. */
export async function discordApiFetch(env, path, init = {}) {
  const startedAt = nowMs();
  const method = String(init.method || "GET").toUpperCase();
  const routeKey = discordRouteKey(path, method);
  const maxAttempts = method === "GET" ? 4 : 5;
  const timeout = getConfig(env).discordApiTimeoutMs;
  let lastResponse = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitForDiscordRoute(env, routeKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`https://discord.com/api/v10${path}`, {
        ...init,
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json; charset=utf-8",
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });
      lastResponse = response;
      if (String(env.DEBUG_LOGS || "").trim() === "1" || !response.ok) {
        logWorkerEvent(response.ok ? "info" : "warn", "discord.fetch", {
          method,
          path: sanitizeApiPathForLog(path),
          status: response.status,
          ok: response.ok,
          attempt: attempt + 1,
          ms: elapsedMs(startedAt),
        });
      }
      if (response.status === 429) {
        const raw = await response.clone().text().catch(() => "");
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
        const delay = discordRetryAfterMs(response, json, attempt);
        await setDiscordRouteCooldown(env, routeKey, delay);
        if (attempt < maxAttempts - 1) {
          await sleep(delay);
          continue;
        }
      } else if (shouldRetryDiscordStatus(response.status) && attempt < maxAttempts - 1) {
        await sleep(discordRetryAfterMs(response, null, attempt));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt >= maxAttempts - 1) throw error;
      await sleep(500 + attempt * 700);
    } finally {
      clearTimeout(timer);
    }
  }
  return lastResponse || new Response("Discord request failed", { status: 599 });
}
