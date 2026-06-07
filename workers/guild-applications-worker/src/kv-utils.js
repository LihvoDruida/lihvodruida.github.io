import { logWorkerEvent } from "./logger.js";

const memoryFallback = new Map();
let lastMissingKvWarning = 0;

export function getWorkerStateKv(env) {
  return env?.WORKER_STATE || env?.RULES_STATS || env?.PUBLIC_API_CACHE || null;
}

function memoryGet(key) {
  const item = memoryFallback.get(key);
  if (!item) return null;
  if (item.expiresAt && item.expiresAt <= Date.now()) {
    memoryFallback.delete(key);
    return null;
  }
  return item.value;
}

function memoryPut(key, value, ttlSeconds) {
  if (memoryFallback.size > 1000) {
    const now = Date.now();
    for (const [entryKey, item] of memoryFallback) if (item.expiresAt <= now) memoryFallback.delete(entryKey);
  }
  memoryFallback.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000 });
}

function warnMissingKv(scope) {
  const now = Date.now();
  if (now - lastMissingKvWarning < 60_000) return;
  lastMissingKvWarning = now;
  logWorkerEvent("warn", "kv.fallback_memory", { scope, binding: "WORKER_STATE" });
}

export async function kvGetJson(env, key) {
  const kv = getWorkerStateKv(env);
  if (!kv) return memoryGet(key);
  const raw = await kv.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function kvPutJson(env, key, value, ttlSeconds = 60) {
  const kv = getWorkerStateKv(env);
  if (!kv) {
    warnMissingKv("put_json");
    memoryPut(key, value, ttlSeconds);
    return;
  }
  await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(1, Math.floor(ttlSeconds)) });
}

export async function kvDelete(env, key) {
  const kv = getWorkerStateKv(env);
  if (!kv) {
    memoryFallback.delete(key);
    return;
  }
  await kv.delete(key);
}

/**
 * KV-backed cooldown/rate-limit. KV write is intentionally simple and idempotent;
 * occasional duplicate writes are acceptable because the dashboard write path has
 * its own Firestore transaction/idempotency guard.
 */
export async function isKvRateLimited(env, key, windowMs) {
  const storageKey = `rate:${key}`;
  const now = Date.now();
  const current = await kvGetJson(env, storageKey).catch(() => null);
  if (current?.until && Number(current.until) > now) return true;
  await kvPutJson(env, storageKey, { until: now + windowMs }, Math.ceil(windowMs / 1000) + 5).catch((error) => {
    logWorkerEvent("warn", "rate_limit.kv_write_failed", { key, message: error?.message });
  });
  return false;
}

export async function getIdempotencyResult(env, key) {
  return kvGetJson(env, `idem:${key}`);
}

export async function storeIdempotencyResult(env, key, value, ttlSeconds = 120) {
  await kvPutJson(env, `idem:${key}`, value, ttlSeconds);
}
