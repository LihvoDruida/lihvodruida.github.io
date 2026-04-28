const DEFAULT_CACHE_SECONDS = 0;
const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 24;
const DEFAULT_FILTERED_LIST_PAGES = 3;
const MAX_GITHUB_LIST_PAGES = 5;


const PATHS = new Set(["/", "/api/guild-applications", "/api/discord-interactions", "/api/discord-rules-stats", "/api/discord-raid-rules-signups"]);
const DEFAULT_LABEL = "guild-application";
const DEFAULT_REVIEW_LABEL = "status:review";

const STATUS = {
  REVIEW: { key: "review", label: "На розгляді", color: 0xd4a63a },
  ACCEPTED: { key: "accepted", label: "Прийнято", color: 0x3ba55d },
  DECLINED: { key: "declined", label: "Відхилено", color: 0xed4245 },
};

const STATUS_KEYS = new Set(Object.values(STATUS).map((status) => status.key));
const STATUS_ALIASES = {
  pending: STATUS.REVIEW.key,
  review: STATUS.REVIEW.key,
  approved: STATUS.ACCEPTED.key,
  accepted: STATUS.ACCEPTED.key,
  rejected: STATUS.DECLINED.key,
  declined: STATUS.DECLINED.key,
};

function normalizeStatusKey(value) {
  return STATUS_ALIASES[String(value || "").trim().toLowerCase()] || STATUS.REVIEW.key;
}

const INTERACTION_COOLDOWN_MS = 2500;
const interactionCooldowns = new Map();
const RULES_CUSTOM_ID_PREFIX = "mbv1";

function safeLogValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[max-depth]";
  if (typeof value === "string") {
    return value
      .replace(/ghp_[A-Za-z0-9_]+/g, "[redacted]")
      .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
      .replace(/Bot\s+[A-Za-z0-9._-]+/g, "Bot [redacted]")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
      .slice(0, 500);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeLogValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, 40).map(([key, item]) => [
        key,
        /token|secret|password|authorization|cookie|signature/i.test(key) ? "[redacted]" : safeLogValue(item, depth + 1),
      ])
    );
  }
  return String(value).slice(0, 240);
}

function logWorkerEvent(level, event, details = {}) {
  const payload = safeLogValue({ event, time: new Date().toISOString(), ...details });
  const line = "[guild-worker:" + level + "] " + JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function nowMs() {
  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, nowMs() - startedAt);
}

function requestIdFromRequest(request) {
  return (
    request.headers.get("CF-Ray") ||
    request.headers.get("X-Request-ID") ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
  );
}

function isDebugEnabled(request, env) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("debug") === "1" ||
    url.searchParams.get("diag") === "1" ||
    String(env.DEBUG_LOGS || "").trim() === "1" ||
    String(env.DEBUG_RESPONSES || "").trim() === "1"
  );
}

function isDebugResponseEnabled(request, env) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("debug") === "1" ||
    url.searchParams.get("diag") === "1" ||
    String(env.DEBUG_RESPONSES || "").trim() === "1"
  );
}

function withTelemetryHeaders(response, requestId, startedAt) {
  try {
    response.headers.set("X-Guild-Worker-Request-Id", requestId);
    response.headers.set("X-Guild-Worker-Duration-Ms", String(elapsedMs(startedAt)));
  } catch {
    // Some platform responses may have immutable headers. Ignore telemetry header injection then.
  }
  return response;
}

function envDiagnostics(env) {
  return {
    github_token: Boolean(env.GITHUB_TOKEN),
    github_owner: Boolean(env.GITHUB_OWNER),
    github_repo: Boolean(env.GITHUB_REPO),
    guild_applications_label: env.GUILD_APPLICATIONS_LABEL || DEFAULT_LABEL,
    discord_bot_token: Boolean(env.DISCORD_BOT_TOKEN),
    discord_channel_id: Boolean(env.DISCORD_CHANNEL_ID),
    discord_public_key: Boolean(env.DISCORD_PUBLIC_KEY),
    discord_guild_id: Boolean(env.DISCORD_GUILD_ID),
    rules_stats_binding: hasValidRulesStatsBinding(env),
    dashboard_profile_lookup_endpoint: Boolean(String(env.DASHBOARD_PROFILE_LOOKUP_ENDPOINT || env.ADMIN_PROFILE_LOOKUP_ENDPOINT || env.ADMIN_DASHBOARD_URL || "").trim()),
    internal_profile_lookup_token: Boolean(String(env.INTERNAL_PROFILE_LOOKUP_TOKEN || "").trim()),
    allowed_origins_configured: Boolean(String(env.ALLOWED_ORIGINS || "").trim()),
  };
}

function sanitizeApiPathForLog(path) {
  return String(path || "")
    .replace(/([?&]access_token=)[^&]+/gi, "$1[redacted]")
    .slice(0, 700);
}

function parsePositiveInt(value, fallback, min, max) {
  const number = parseInt(String(value || ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

async function runMeasured(event, details, task, level = "info") {
  const startedAt = nowMs();
  try {
    const result = await task();
    logWorkerEvent(level, `${event}.ok`, { ...details, ms: elapsedMs(startedAt) });
    return result;
  } catch (error) {
    logWorkerEvent("error", `${event}.failed`, { ...details, ms: elapsedMs(startedAt), message: error?.message });
    throw error;
  }
}

function summarizeApplicationItems(items) {
  const summary = {
    total: items.length,
    states: {},
    statuses: {},
    labels: {},
  };

  for (const item of items) {
    const state = item.state || "unknown";
    const status = item.status_key || "unknown";
    summary.states[state] = (summary.states[state] || 0) + 1;
    summary.statuses[status] = (summary.statuses[status] || 0) + 1;

    for (const label of Array.isArray(item.labels) ? item.labels : []) {
      summary.labels[label] = (summary.labels[label] || 0) + 1;
    }
  }

  return summary;
}

function parseCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function snowflake(value) {
  const text = String(value || "").trim();
  return /^\d{16,25}$/.test(text) ? text : "";
}

function getInteractionGuildId(interaction, env) {
  return snowflake(interaction?.guild_id) || snowflake(env.DISCORD_GUILD_ID);
}

function base36ToSnowflake(value) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = 0n;

  for (const raw of String(value || "").toLowerCase()) {
    const digit = alphabet.indexOf(raw);
    if (digit < 0) throw new Error("Некоректний custom_id правил.");
    result = result * 36n + BigInt(digit);
  }

  return result.toString(10);
}

function decodeRoleIdsFromCustomId(value, prefix) {
  try {
    const roleIds = String(value || "")
      .slice(prefix.length)
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(base36ToSnowflake)
      .filter(snowflake);

    return roleIds.length ? Array.from(new Set(roleIds)) : [];
  } catch {
    return [];
  }
}

function decodeRulesCustomId(customId) {
  const value = String(customId || "").trim();

  if (value === `${RULES_CUSTOM_ID_PREFIX}:r:s`) {
    return { type: "raid", action: "raid_signup", roleIds: [] };
  }

  if (value === `${RULES_CUSTOM_ID_PREFIX}:r:c:s`) {
    return { type: "raid", action: "confirm_raid_signup", roleIds: [] };
  }

  if (value === `${RULES_CUSTOM_ID_PREFIX}:d`) {
    return { type: "guild", action: "decline", roleIds: [] };
  }

  if (value === `${RULES_CUSTOM_ID_PREFIX}:c:d`) {
    return { type: "guild", action: "confirm_decline", roleIds: [] };
  }

  const acceptPrefix = `${RULES_CUSTOM_ID_PREFIX}:a:`;
  if (value.startsWith(acceptPrefix)) {
    const roleIds = decodeRoleIdsFromCustomId(value, acceptPrefix);
    return roleIds.length ? { type: "guild", action: "accept", roleIds } : null;
  }

  const confirmAcceptPrefix = `${RULES_CUSTOM_ID_PREFIX}:c:a:`;
  if (value.startsWith(confirmAcceptPrefix)) {
    const roleIds = decodeRoleIdsFromCustomId(value, confirmAcceptPrefix);
    return roleIds.length ? { type: "guild", action: "confirm_accept", roleIds } : null;
  }

  return null;
}

function getDiscordUserId(interaction) {
  return interaction?.member?.user?.id || interaction?.user?.id || "unknown";
}

function hasAllowedDiscordRole(interaction, env) {
  const allowedRoles = parseCsvSet(env.DISCORD_ALLOWED_ROLES);
  if (!allowedRoles.size) return true;

  const memberRoles = Array.isArray(interaction?.member?.roles)
    ? interaction.member.roles.map(String)
    : [];

  return memberRoles.some((roleId) => allowedRoles.has(roleId));
}

function isInteractionRateLimited(interaction, scope = "global") {
  const userId = getDiscordUserId(interaction);
  const cacheKey = `${scope}:${userId}`;
  const now = Date.now();
  const last = interactionCooldowns.get(cacheKey) || 0;

  if (interactionCooldowns.size > 500) {
    for (const [key, timestamp] of interactionCooldowns) {
      if (now - timestamp > 60_000) interactionCooldowns.delete(key);
    }
  }

  if (now - last < INTERACTION_COOLDOWN_MS) return true;
  interactionCooldowns.set(cacheKey, now);
  return false;
}

async function retryAsync(task, retries = 2, delayMs = 250) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  throw lastError;
}

function buildCorsHeaders(corsOrigin, status = 200) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200, corsOrigin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: buildCorsHeaders(corsOrigin, status),
  });
}


function getRulesStatsKv(env) {
  const kv = env.RULES_STATS || null;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") return null;
  return kv;
}

function hasRulesStatsBinding(env) {
  return Boolean(env.RULES_STATS);
}

function hasValidRulesStatsBinding(env) {
  return Boolean(getRulesStatsKv(env));
}

function rulesStatsKey(guildId, suffix) {
  return `rules:${snowflake(guildId) || "global"}:${suffix}`;
}

function raidRulesKey(guildId, suffix) {
  return `raid-rules:${snowflake(guildId) || "global"}:${suffix}`;
}

function dashboardAuthUrl(env) {
  const raw = String(env.ADMIN_DASHBOARD_URL || env.DASHBOARD_URL || "https://admin.lihvodruida.pp.ua/").trim() || "https://admin.lihvodruida.pp.ua/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function dashboardProfileLookupEndpoint(env) {
  const explicit = String(env.DASHBOARD_PROFILE_LOOKUP_ENDPOINT || env.ADMIN_PROFILE_LOOKUP_ENDPOINT || "").trim();
  if (explicit) return explicit;
  try {
    return new URL("/api/profile/discord-lookup", dashboardAuthUrl(env)).toString();
  } catch {
    return "https://admin.lihvodruida.pp.ua/api/profile/discord-lookup";
  }
}

function pickMainCharacter(value) {
  if (!value || typeof value !== "object") return null;
  return {
    key: String(value.key || ""),
    name: String(value.name || ""),
    realmName: String(value.realmName || value.realm_name || ""),
    realmSlug: String(value.realmSlug || value.realm_slug || ""),
    region: String(value.region || ""),
    className: String(value.className || value.class_name || ""),
    profileUrl: String(value.profileUrl || value.profile_url || ""),
  };
}

function hasUsableMainCharacter(value) {
  const main = pickMainCharacter(value);
  return Boolean(main?.name && (main.realmName || main.realmSlug));
}

function formatMainCharacterForMessage(mainCharacter) {
  const main = pickMainCharacter(mainCharacter);
  if (!main?.name) return "main-персонаж не знайдений";
  const realm = main.realmName || main.realmSlug || "realm не вказано";
  return `${main.name} • ${realm}`;
}

async function lookupDashboardProfileByDiscord(env, discordId) {
  const cleanDiscordId = snowflake(discordId);
  const token = String(env.INTERNAL_PROFILE_LOOKUP_TOKEN || "").trim();
  if (!cleanDiscordId) return { ok: false, reason: "invalid-discord-id" };
  if (!token) return { ok: false, reason: "missing-profile-lookup-token" };

  const url = new URL(dashboardProfileLookupEndpoint(env));
  url.searchParams.set("discord_id", cleanDiscordId);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });
    const raw = await response.text().catch(() => "");
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

    if (response.status === 404) return { ok: false, reason: "profile-not-found", status: response.status };
    if (!response.ok || !data?.found) {
      return { ok: false, reason: response.status === 403 ? "profile-lookup-forbidden" : "profile-lookup-failed", status: response.status, message: data?.error || raw };
    }

    return { ok: true, profile: data, mainCharacter: pickMainCharacter(data.mainCharacter) };
  } catch (error) {
    return { ok: false, reason: "profile-lookup-exception", message: error?.message };
  }
}

async function recordRaidRulesSignup(env, guildId, userId, userLabel, profile) {
  const kv = getRulesStatsKv(env);
  const cleanGuildId = snowflake(guildId) || snowflake(env.DISCORD_GUILD_ID) || "global";
  const cleanUserId = snowflake(userId);
  if (!kv || !cleanUserId) return { skipped: true };

  const signedAt = new Date().toISOString();
  const signup = {
    discordId: cleanUserId,
    discordName: limitText(userLabel || profile?.displayName || "Discord user", 120, "Discord user"),
    profileId: profile?.profileId || null,
    mainCharacter: pickMainCharacter(profile?.mainCharacter),
    signedAt,
  };

  await kv.put(raidRulesKey(cleanGuildId, `user:${cleanUserId}`), JSON.stringify(signup));
  await kv.put(raidRulesKey(cleanGuildId, "updated_at"), signedAt);
  return { ok: true, signup };
}

async function getRaidRulesSignups(env, guildId) {
  const kv = getRulesStatsKv(env);
  if (!kv) {
    const hasBinding = hasRulesStatsBinding(env);
    return {
      configured: false,
      total: 0,
      updated_at: null,
      signups: [],
      source: hasBinding ? "invalid-binding" : "missing-kv-binding",
      message: hasBinding ? "RULES_STATS exists, but it is not a KV namespace binding." : "RULES_STATS KV binding is not configured.",
    };
  }

  const cleanGuildId = snowflake(guildId) || snowflake(env.DISCORD_GUILD_ID);
  const guildKey = cleanGuildId || "global";
  const prefix = raidRulesKey(guildKey, "user:");
  const keys = await listAllKvKeys(kv, prefix);
  const values = await Promise.all(keys.map(async (key) => {
    try {
      const raw = await kv.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }));

  const signups = values
    .filter((item) => item && snowflake(item.discordId || item.discord_id))
    .map((item) => ({
      discordId: snowflake(item.discordId || item.discord_id),
      discordName: limitText(item.discordName || item.discord_name || "Discord user", 120, "Discord user"),
      profileId: item.profileId || item.profile_id || null,
      mainCharacter: pickMainCharacter(item.mainCharacter || item.main_character),
      signedAt: String(item.signedAt || item.signed_at || ""),
    }))
    .sort((a, b) => Date.parse(b.signedAt || "") - Date.parse(a.signedAt || ""));

  return {
    configured: true,
    guild_id: cleanGuildId || "global",
    total: signups.length,
    updated_at: await kv.get(raidRulesKey(guildKey, "updated_at")),
    signups,
    source: "kv",
  };
}

async function handleRaidRulesSignups(request, env) {
  const origin = allowedOrigin(request, env) || "*";
  const url = new URL(request.url);
  const guildId = snowflake(url.searchParams.get("guild_id")) || snowflake(env.DISCORD_GUILD_ID);
  try {
    return json(await getRaidRulesSignups(env, guildId), 200, origin);
  } catch (error) {
    logWorkerEvent("error", "raid_rules.signups.failed", { message: error?.message, guildId });
    return json({
      configured: hasValidRulesStatsBinding(env),
      total: 0,
      updated_at: null,
      signups: [],
      source: hasRulesStatsBinding(env) ? "error" : "missing-kv-binding",
      error: error instanceof Error ? error.message : "Raid rules signups are unavailable.",
    }, 500, origin);
  }
}

async function readKvNumber(kv, key) {
  const value = await kv.get(key);
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

async function writeKvNumber(kv, key, value) {
  await kv.put(key, String(Math.max(0, Math.floor(Number(value) || 0))));
}

async function listAllKvKeys(kv, prefix) {
  const keys = [];
  let cursor;

  do {
    const page = await kv.list({ prefix, cursor });
    for (const item of Array.isArray(page?.keys) ? page.keys : []) {
      if (item?.name) keys.push(String(item.name));
    }
    cursor = page?.list_complete ? undefined : page?.cursor;
  } while (cursor);

  return keys;
}

function maxIsoDate(values) {
  let latest = null;
  let latestTime = 0;

  for (const value of values) {
    const text = String(value || "").trim();
    const time = Date.parse(text);
    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time;
      latest = text;
    }
  }

  return latest;
}

async function getAggregatedRulesStats(kv) {
  const keys = await listAllKvKeys(kv, "rules:");
  const acceptedKeys = keys.filter((key) => /^rules:(?:\d+|global):accepted$/.test(key));
  const declinedKeys = keys.filter((key) => /^rules:(?:\d+|global):declined$/.test(key));
  const updatedKeys = keys.filter((key) => /^rules:(?:\d+|global):updated_at$/.test(key));

  const [acceptedValues, declinedValues, updatedValues] = await Promise.all([
    Promise.all(acceptedKeys.map((key) => readKvNumber(kv, key))),
    Promise.all(declinedKeys.map((key) => readKvNumber(kv, key))),
    Promise.all(updatedKeys.map((key) => kv.get(key))),
  ]);

  const accepted = acceptedValues.reduce((sum, value) => sum + value, 0);
  const declined = declinedValues.reduce((sum, value) => sum + value, 0);

  return {
    configured: true,
    guild_id: "all",
    scope: "aggregate",
    accepted,
    declined,
    total: accepted + declined,
    updated_at: maxIsoDate(updatedValues),
    source: "kv",
  };
}

async function getRulesStats(env, guildId) {
  const kv = getRulesStatsKv(env);
  if (!kv) {
    const hasBinding = hasRulesStatsBinding(env);
    return {
      configured: false,
      accepted: 0,
      declined: 0,
      total: 0,
      updated_at: null,
      source: hasBinding ? "invalid-binding" : "missing-kv-binding",
      message: hasBinding
        ? "RULES_STATS exists, but it is not a KV namespace binding."
        : "RULES_STATS KV binding is not configured.",
    };
  }

  const cleanGuildId = snowflake(guildId) || snowflake(env.DISCORD_GUILD_ID);
  if (!cleanGuildId) {
    return getAggregatedRulesStats(kv);
  }

  const [accepted, declined, updatedAt] = await Promise.all([
    readKvNumber(kv, rulesStatsKey(cleanGuildId, "accepted")),
    readKvNumber(kv, rulesStatsKey(cleanGuildId, "declined")),
    kv.get(rulesStatsKey(cleanGuildId, "updated_at")),
  ]);

  return {
    configured: true,
    guild_id: cleanGuildId,
    scope: "guild",
    accepted,
    declined,
    total: accepted + declined,
    updated_at: updatedAt || null,
    source: "kv",
  };
}

async function getRecordedRulesDecision(env, guildId, userId) {
  const kv = getRulesStatsKv(env);
  const cleanGuildId = snowflake(guildId) || snowflake(env.DISCORD_GUILD_ID);
  const cleanUserId = snowflake(userId);
  if (!kv || !cleanGuildId || !cleanUserId) return null;

  const value = await kv.get(rulesStatsKey(cleanGuildId, `user:${cleanUserId}`));
  return value === "accepted" || value === "declined" ? value : null;
}

async function recordRulesDecision(env, guildId, userId, action) {
  const kv = getRulesStatsKv(env);
  const cleanGuildId = snowflake(guildId) || snowflake(env.DISCORD_GUILD_ID) || "global";
  const cleanUserId = snowflake(userId);
  const normalizedAction = action === "declined" ? "declined" : "accepted";

  if (!kv || !cleanUserId) return { skipped: true };

  const userKey = rulesStatsKey(cleanGuildId, `user:${cleanUserId}`);
  const previous = await kv.get(userKey);

  if (previous === normalizedAction) {
    await kv.put(rulesStatsKey(cleanGuildId, "updated_at"), new Date().toISOString());
    return { ok: true, unchanged: true };
  }

  const targetKey = rulesStatsKey(cleanGuildId, normalizedAction);
  const targetCount = await readKvNumber(kv, targetKey);
  await writeKvNumber(kv, targetKey, targetCount + 1);

  if (previous === "accepted" || previous === "declined") {
    const previousKey = rulesStatsKey(cleanGuildId, previous);
    const previousCount = await readKvNumber(kv, previousKey);
    await writeKvNumber(kv, previousKey, previousCount - 1);
  }

  await kv.put(userKey, normalizedAction);
  await kv.put(rulesStatsKey(cleanGuildId, "updated_at"), new Date().toISOString());

  return { ok: true };
}

async function handleRulesStats(request, env) {
  const origin = allowedOrigin(request, env) || "*";
  const url = new URL(request.url);
  const guildId = snowflake(url.searchParams.get("guild_id")) || snowflake(env.DISCORD_GUILD_ID);

  try {
    return json(await getRulesStats(env, guildId), 200, origin);
  } catch (error) {
    logWorkerEvent("error", "rules.stats.failed", { message: error?.message, guildId });
    return json(
      {
        configured: hasValidRulesStatsBinding(env),
        accepted: 0,
        declined: 0,
        total: 0,
        updated_at: null,
        source: hasRulesStatsBinding(env) ? "error" : "missing-kv-binding",
        error: error instanceof Error ? error.message : "Rules stats are unavailable.",
      },
      500,
      origin
    );
  }
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configured.length) return origin || "*";
  if (!origin) return configured[0];
  return configured.includes(origin) ? origin : "";
}

function stripDiscordMarker(value) {
  return String(value || "")
    .replace(/<!--\s*mistblossom:discord[\s\S]*?-->/gi, "")
    .trim();
}

function cleanText(value, maxLength = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultilineText(value, maxLength = 400) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeDiscordMarkdown(value) {
  return String(value || "")
    .replace(/@/g, "@​")
    .replace(/([*_`~|>])/g, "\\$1")
    .trim();
}

function formatCopyableValue(value, fallback = "Не вказано") {
  const clean = escapeDiscordMarkdown(String(value || "").trim());
  return `\`${clean || fallback}\``;
}

function limitText(value, maxLength, fallback = "Не вказано") {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, maxLength);
}

function buildCharacterRealmTag(characterName, realm) {
  const character = cleanText(characterName, 60);
  const compactRealm = cleanText(realm, 60).replace(/\s+/g, "");
  return [character, compactRealm].filter(Boolean).join("-");
}

function composeSourceValue(sourceCreator, sourcePlatform, sourceOther, sourceFallback) {
  const creator = cleanText(sourceCreator, 80);
  const platform = cleanText(sourcePlatform, 40);
  const other = cleanText(sourceOther, 120);
  const fallback = cleanText(sourceFallback, 120);

  if (creator === "Інше") {
    return other ? `Інше — ${other}` : "";
  }

  if (creator && platform) {
    return `${creator} — ${platform}`;
  }

  return fallback;
}

function sanitizePayload(payload) {
  return {
    region: cleanText(payload.region, 8).toLowerCase(),
    characterName: cleanText(payload.characterName, 60),
    faction: cleanText(payload.faction, 24),
    realm: cleanText(payload.realm, 60),
    className: cleanText(payload.className, 60),
    discord: cleanText(payload.discord, 80),
    battleTag: cleanText(payload.battleTag, 80),
    sourceCreator: cleanText(payload.sourceCreator, 80),
    sourcePlatform: cleanText(payload.sourcePlatform, 40),
    sourceOther: cleanText(payload.sourceOther, 120),
    source: composeSourceValue(
      payload.sourceCreator,
      payload.sourcePlatform,
      payload.sourceOther,
      payload.source
    ),
    availability: stripDiscordMarker(cleanMultilineText(stripDiscordMarker(payload.availability)), 400),
  };
}

function validateApplication(payload) {
  if (
    !payload.region ||
    !payload.characterName ||
    !payload.faction ||
    !payload.realm ||
    !payload.availability
  ) {
    return "Будь ласка, заповни всі обов’язкові поля.";
  }

  const hasStructuredSource = !!payload.sourceCreator;

  if (hasStructuredSource) {
    if (payload.sourceCreator === "Інше" && !payload.sourceOther) {
      return "Вкажи, звідки саме ти дізнався про нас.";
    }

    if (payload.sourceCreator !== "Інше" && !payload.sourcePlatform) {
      return "Будь ласка, обери платформу.";
    }
  }

  if (payload.faction.toLowerCase() === "horde" && !payload.battleTag) {
    return "Для фракції Horde поле BattleTag є обов’язковим.";
  }

  return null;
}

function buildIssueBody(payload) {
  return [
    "### Персонаж",
    `- Регіон: ${payload.region}`,
    `- Ім’я персонажа: ${payload.characterName}`,
    `- Фракція: ${payload.faction}`,
    `- Реалм: ${payload.realm}`,
    `- Клас: ${payload.className || "Не вказано"}`,
    "",
    "### Контакти",
    "- Discord: Приховано",
    "- BattleTag: Приховано",
    `- Звідки дізнався: ${payload.source || "Не вказано"}`,
    "",
    "### Коли зазвичай грає",
    payload.availability,
  ].join("\n");
}

function extractApplicationDetails(body) {
  const text = String(body || "");
  const read = (pattern) => cleanText((text.match(pattern) || [])[1] || "", 120);

  return {
    region: read(/- Регіон: (.+)/),
    faction: read(/- Фракція: (.+)/),
    character: read(/- Ім’я персонажа: (.+)/),
    realm: read(/- Реалм: (.+)/),
    class_name: read(/- Клас: (.+)/),
  };
}

function extractSummary(body) {
  const details = extractApplicationDetails(body);
  return [details.character, details.realm, details.region, details.faction, details.class_name]
    .filter(Boolean)
    .join(" • ");
}

function normalizeLabels(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels.map((label) => String(label?.name || "").toLowerCase())
    : [];
}

function getIssueStatusKey(issue) {
  const labels = normalizeLabels(issue);

  if (labels.includes("status:accepted") || labels.includes("statusaccepted") || labels.includes("status:approved") || labels.includes("statusapproved")) {
    return STATUS.ACCEPTED.key;
  }
  if (labels.includes("status:declined") || labels.includes("statusdeclined") || labels.includes("status:rejected") || labels.includes("statusrejected")) {
    return STATUS.DECLINED.key;
  }

  return STATUS.REVIEW.key;
}

function getIssueStatus(issue) {
  const key = getIssueStatusKey(issue);
  return Object.values(STATUS).find((status) => status.key === key)?.label || STATUS.REVIEW.label;
}

function resolveDiscordColor(statusText) {
  const status = Object.values(STATUS).find((item) => item.label === statusText);
  return status?.color || STATUS.REVIEW.color;
}

function slugifyRaiderIoValue(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function hasPositiveScore(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function formatMPlusSection(seasonData) {
  if (!seasonData || typeof seasonData !== "object" || !seasonData.scores) {
    return "Дані відсутні";
  }

  const scores = seasonData.scores;
  const lines = [];

  if (hasPositiveScore(scores.all)) {
    lines.push(`**Raider.IO M+:** ${formatScore(scores.all)}`);
  }
  if (hasPositiveScore(scores.tank)) {
    lines.push(`**Танк:** ${formatScore(scores.tank)}`);
  }
  if (hasPositiveScore(scores.healer)) {
    lines.push(`**Хіл:** ${formatScore(scores.healer)}`);
  }
  if (hasPositiveScore(scores.dps)) {
    lines.push(`**DPS:** ${formatScore(scores.dps)}`);
  }

  return lines.length ? lines.join("\n") : "Дані відсутні";
}

function prettifyRaidKey(key) {
  return String(key || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasRaidProgressData(raid) {
  if (!raid || typeof raid !== "object") return false;
  if (cleanText(raid.summary, 80)) return true;

  return (
    Number(raid.normal_bosses_killed || 0) > 0 ||
    Number(raid.heroic_bosses_killed || 0) > 0 ||
    Number(raid.mythic_bosses_killed || 0) > 0
  );
}

function formatRaidSummary(raid) {
  const summary = cleanText(raid?.summary, 80);
  if (summary) return summary;

  const total = Number(raid?.total_bosses || 0);
  const normal = Number(raid?.normal_bosses_killed || 0);
  const heroic = Number(raid?.heroic_bosses_killed || 0);
  const mythic = Number(raid?.mythic_bosses_killed || 0);

  const parts = [];
  if (mythic > 0) parts.push(`${mythic}/${total || "?"} M`);
  if (heroic > 0) parts.push(`${heroic}/${total || "?"} H`);
  if (normal > 0) parts.push(`${normal}/${total || "?"} N`);

  return parts.join(" • ");
}

function splitRaidProgressionByExpansion(raidProgression) {
  const entries = Object.entries(raidProgression || {})
    .map(([key, value]) => ({
      key,
      ...(value || {}),
    }))
    .filter((item) => Number.isFinite(Number(item.expansion_id)));

  const grouped = new Map();

  for (const raid of entries) {
    const expansionId = Number(raid.expansion_id);
    if (!grouped.has(expansionId)) {
      grouped.set(expansionId, []);
    }
    grouped.get(expansionId).push(raid);
  }

  const expansionIds = Array.from(grouped.keys()).sort((a, b) => b - a);

  return {
    current: expansionIds.length ? grouped.get(expansionIds[0]) || [] : [],
    previous: expansionIds.length > 1 ? grouped.get(expansionIds[1]) || [] : [],
  };
}

function formatRaidSection(raids) {
  const usefulRaids = (Array.isArray(raids) ? raids : []).filter(hasRaidProgressData);

  if (!usefulRaids.length) {
    return "Дані відсутні";
  }

  return usefulRaids
    .slice(0, 8)
    .map((raid) => {
      const summary = formatRaidSummary(raid);
      const name = prettifyRaidKey(raid.key);
      return summary ? `• **${name}:** ${summary}` : `• **${name}:** Дані відсутні`;
    })
    .join("\n");
}

async function fetchRaiderIoProfile(payload) {
  const startedAt = nowMs();
  const region = cleanText(payload.region, 8).toLowerCase();
  const realmSlug = slugifyRaiderIoValue(payload.realm);
  const characterSlug = slugifyRaiderIoValue(payload.characterName);

  if (!region || !realmSlug || !characterSlug) {
    logWorkerEvent("warn", "raiderio.profile.invalid_params", { region, realmSlug, characterSlug, ms: elapsedMs(startedAt) });
    return {
      ok: false,
      error: "Не вдалося підготувати параметри Raider.IO.",
    };
  }

  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realmSlug);
  url.searchParams.set("name", characterSlug);
  url.searchParams.set(
    "fields",
    "mythic_plus_scores_by_season:current:previous,raid_progression:current-expansion:previous-expansion"
  );

  try {
    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
      },
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const apiMessage =
        cleanText(data?.message || data?.error || "", 160) ||
        `HTTP ${response.status}`;
      logWorkerEvent("warn", "raiderio.profile.failed", {
        status: response.status,
        message: apiMessage,
        region,
        realmSlug,
        characterSlug,
        ms: elapsedMs(startedAt),
      });
      return {
        ok: false,
        error: `Не вдалося отримати дані Raider.IO: ${apiMessage}.`,
      };
    }

    logWorkerEvent("info", "raiderio.profile.ok", { region, realmSlug, characterSlug, ms: elapsedMs(startedAt) });
    return { ok: true, data };
  } catch (error) {
    logWorkerEvent("warn", "raiderio.profile.exception", {
      message: error?.message,
      region,
      realmSlug,
      characterSlug,
      ms: elapsedMs(startedAt),
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Не вдалося отримати дані Raider.IO: ${error.message}`
          : "Не вдалося отримати дані Raider.IO.",
    };
  }
}

function buildRaiderIoEmbedFields(raiderIoResult) {
  if (!raiderIoResult?.ok) {
    const errorText = limitText(
      raiderIoResult?.error || "Не вдалося отримати дані Raider.IO.",
      1024,
      "Не вдалося отримати дані Raider.IO."
    );

    return [
      {
        name: "Raider.IO • Mythic+ (current)",
        value: errorText,
        inline: false,
      },
      {
        name: "Raider.IO • Mythic+ (previous)",
        value: errorText,
        inline: false,
      },
      {
        name: "Raider.IO • Рейди (current expansion)",
        value: errorText,
        inline: false,
      },
      {
        name: "Raider.IO • Рейди (previous expansion)",
        value: errorText,
        inline: false,
      },
    ];
  }

  const data = raiderIoResult.data || {};
  const seasons = Array.isArray(data.mythic_plus_scores_by_season)
    ? data.mythic_plus_scores_by_season
    : [];
  const currentSeason = seasons[0] || null;
  const previousSeason = seasons[1] || null;

  const raidGroups = splitRaidProgressionByExpansion(data.raid_progression);

  return [
    {
      name: "Raider.IO • Mythic+ (current)",
      value: limitText(formatMPlusSection(currentSeason), 1024, "Дані відсутні"),
      inline: false,
    },
    {
      name: "Raider.IO • Mythic+ (previous)",
      value: limitText(formatMPlusSection(previousSeason), 1024, "Дані відсутні"),
      inline: false,
    },
    {
      name: "Raider.IO • Рейди (current expansion)",
      value: limitText(formatRaidSection(raidGroups.current), 1024, "Дані відсутні"),
      inline: false,
    },
    {
      name: "Raider.IO • Рейди (previous expansion)",
      value: limitText(formatRaidSection(raidGroups.previous), 1024, "Дані відсутні"),
      inline: false,
    },
  ];
}

function buildDiscordEmbeds(payload, issue, env, raiderIoResult) {
  const statusText = getIssueStatus(issue);
  const issueUrl = issue?.html_url ? String(issue.html_url) : "";
  const characterTag =
    buildCharacterRealmTag(payload.characterName, payload.realm) || payload.characterName;

  const description = [
    `**Статус:** ${escapeDiscordMarkdown(statusText)}`,
    issueUrl ? `**Issue:** ${issueUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4096);

  return [
    {
      title: limitText(`Нова заявка • ${characterTag}`, 256, "Нова заявка до гільдії"),
      description,
      color: resolveDiscordColor(statusText),
      fields: [
        {
          name: "Дані про персонажа",
          value: limitText(
            [
              `**Ім’я персонажа:** ${formatCopyableValue(characterTag)}`,
              `**Регіон:** ${formatCopyableValue(payload.region)}`,
              `**Фракція:** ${escapeDiscordMarkdown(payload.faction || "Не вказано")}`,
              `**Реалм:** ${escapeDiscordMarkdown(payload.realm || "Не вказано")}`,
              `**Клас:** ${escapeDiscordMarkdown(payload.className || "Не вказано")}`,
            ].join("\n"),
            1024
          ),
          inline: false,
        },
        {
          name: "Контакти",
          value: limitText(
            [
              `**Discord:** ${formatCopyableValue(payload.discord)}`,
              `**BattleTag:** ${formatCopyableValue(payload.battleTag)}`,
            ].join("\n"),
            1024
          ),
          inline: false,
        },
        {
          name: "Додатково",
          value: limitText(
            `**Звідки дізнався:** ${escapeDiscordMarkdown(payload.source || "Не вказано")}`,
            1024
          ),
          inline: false,
        },
        {
          name: "Коли зазвичай грає",
          value: limitText(
            escapeDiscordMarkdown(payload.availability || "Не вказано"),
            1024
          ),
          inline: false,
        },
        ...buildRaiderIoEmbedFields(raiderIoResult),
      ],
      footer: {
        text: limitText(env.DISCORD_GUILD_NAME || "Mistblossom Vanguard", 2048),
      },
      timestamp: new Date().toISOString(),
    },
  ];
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (!clean || clean.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

async function verifyDiscordRequest(request, env, rawBody) {
  const publicKey = String(env.DISCORD_PUBLIC_KEY || "").trim();
  if (!publicKey) return false;

  const signature = request.headers.get("X-Signature-Ed25519") || "";
  const timestamp = request.headers.get("X-Signature-Timestamp") || "";
  if (!signature || !timestamp) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );

    return crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + rawBody)
    );
  } catch {
    return false;
  }
}

function discordInteractionResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function buildApplicationButtons(issueNumber) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Прийняти",
          custom_id: `guild_application:accepted:${issueNumber}`,
        },
        {
          type: 2,
          style: 4,
          label: "Відхилити",
          custom_id: `guild_application:declined:${issueNumber}`,
        },
      ],
    },
  ];
}

function getDiscordUserLabel(interaction) {
  const user = interaction?.member?.user || interaction?.user || {};
  return user.global_name || user.username || user.id || "Discord moderator";
}


function getStatusByKey(statusKey) {
  return Object.values(STATUS).find((item) => item.key === statusKey) || STATUS.REVIEW;
}

function getStatusIcon(statusKey) {
  if (statusKey === STATUS.ACCEPTED.key) return "🟢";
  if (statusKey === STATUS.DECLINED.key) return "🔴";
  return "🟡";
}

function buildStatusUpdateContent(issueNumber, statusKey, moderator) {
  const status = getStatusByKey(statusKey);
  const icon = getStatusIcon(statusKey);
  const moderatorLabel = escapeDiscordMarkdown(limitText(moderator, 80, "Discord moderator"));

  return [
    `📋 **Заявка #${issueNumber} оновлена**`,
    `> Статус: ${icon} **${status.label}**`,
    `> Модератор: 👤 **${moderatorLabel}**`,
    `> GitHub Issue: 🔒 **закрито**`,
  ].join("\n");
}

function updateEmbedDescriptionStatus(description, statusKey) {
  const status = getStatusByKey(statusKey);
  const icon = getStatusIcon(statusKey);
  const statusLine = `**Статус:** ${icon} ${status.label}`;
  const text = String(description || "").trim();

  if (!text) return statusLine;

  if (/\*\*Статус:\*\*[^\n]*/.test(text)) {
    return text.replace(/\*\*Статус:\*\*[^\n]*/, statusLine);
  }

  return [statusLine, text].join("\n");
}

function buildUpdatedApplicationEmbeds(interaction, statusKey, issueNumber, moderator, env) {
  const status = getStatusByKey(statusKey);
  const embeds = Array.isArray(interaction?.message?.embeds)
    ? interaction.message.embeds.map((embed) => ({ ...embed }))
    : [];

  const primaryEmbed = embeds[0] || {
    title: `Заявка #${issueNumber}`,
    description: "",
    fields: [],
  };

  primaryEmbed.color = status.color;
  primaryEmbed.description = updateEmbedDescriptionStatus(primaryEmbed.description, statusKey);
  primaryEmbed.footer = {
    text: limitText(
      `${env.DISCORD_GUILD_NAME || "Mistblossom Vanguard"} • Оновив: ${moderator}`,
      2048
    ),
  };
  primaryEmbed.timestamp = new Date().toISOString();

  embeds[0] = primaryEmbed;

  return embeds.slice(0, 10);
}


async function discordApiFetch(env, path, init = {}) {
  const startedAt = nowMs();
  const method = init.method || "GET";

  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });

  if (String(env.DEBUG_LOGS || "").trim() === "1" || !response.ok) {
    logWorkerEvent(response.ok ? "info" : "warn", "discord.fetch", {
      method,
      path: sanitizeApiPathForLog(path),
      status: response.status,
      ok: response.ok,
      ms: elapsedMs(startedAt),
    });
  }

  return response;
}

const APPLICATION_STATUS_LABELS = [
  "status:review",
  "status:accepted",
  "status:declined",
  "status:approved",
  "status:rejected",

  // Legacy broken labels from older builds.
  "statusreview",
  "statusaccepted",
  "statusdeclined",
  "statusapproved",
  "statusrejected",
];

function getTargetStatusLabel(status) {
  if (status === STATUS.ACCEPTED.key) return "status:accepted";
  if (status === STATUS.DECLINED.key) return "status:declined";
  return "status:review";
}

function getStatusComment(status, moderator) {
  const moderatorLabel = limitText(moderator, 80, "Discord moderator");

  if (status === STATUS.ACCEPTED.key) {
    return `✅ Заявку прийнято через Discord. Модератор: ${moderatorLabel}`;
  }

  if (status === STATUS.DECLINED.key) {
    return `❌ Заявку відхилено через Discord. Модератор: ${moderatorLabel}`;
  }

  return `🔎 Заявку повернуто на розгляд через Discord. Модератор: ${moderatorLabel}`;
}

async function removeIssueLabelIfExists(env, issueNumber, label) {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
    { method: "DELETE" }
  );

  if (response.ok || response.status === 404) return;

  const { raw, data } = await parseJsonResponse(response);
  throw new Error(data?.message || raw || `Не вдалося прибрати label ${label}.`);
}


async function fetchGithubIssue(env, issueNumber) {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}`
  );

  const { raw, data } = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.message || raw || "Не вдалося отримати заявку з GitHub.");
  }

  return data;
}

async function closeGithubIssue(env, issueNumber, status) {
  if (![STATUS.ACCEPTED.key, STATUS.DECLINED.key].includes(status)) return;

  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "closed",
        state_reason: status === STATUS.ACCEPTED.key ? "completed" : "not_planned",
      }),
    }
  );

  if (!response.ok) {
    const { raw, data } = await parseJsonResponse(response);
    throw new Error(data?.message || raw || "Статус змінено, але issue не закрито.");
  }
}
async function createStatusComment(env, issueNumber, status, moderator) {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body: getStatusComment(status, moderator) }),
    }
  );

  if (!response.ok) {
    const { raw, data } = await parseJsonResponse(response);
    throw new Error(data?.message || raw || "Статус змінено, але коментар не створено.");
  }
}

async function updateApplicationIssueStatus(env, issueNumber, status, moderator) {
  const startedAt = nowMs();
  const cleanIssueNumber = Number(issueNumber);
  if (!Number.isInteger(cleanIssueNumber) || cleanIssueNumber <= 0) {
    throw new Error("Некоректний номер заявки.");
  }

  const targetLabel = getTargetStatusLabel(status);
  const issue = await retryAsync(() => fetchGithubIssue(env, cleanIssueNumber));
  const currentStatus = getIssueStatusKey(issue);

  logWorkerEvent("info", "application.status.current", {
    issueNumber: cleanIssueNumber,
    currentStatus,
    targetStatus: status,
    state: issue?.state,
    labels: Array.isArray(issue?.labels) ? issue.labels.map((label) => label?.name).filter(Boolean) : [],
  });

  if (currentStatus === status && issue?.state === "closed") {
    logWorkerEvent("info", "application.status.unchanged", { issueNumber: cleanIssueNumber, status, ms: elapsedMs(startedAt) });
    return { ok: true, label: targetLabel, unchanged: true, alreadyClosed: true };
  }

  if (currentStatus === status) {
    await retryAsync(() => closeGithubIssue(env, cleanIssueNumber, status));
    logWorkerEvent("info", "application.status.closed_existing", { issueNumber: cleanIssueNumber, status, ms: elapsedMs(startedAt) });
    return { ok: true, label: targetLabel, unchanged: true, closed: true };
  }

  await Promise.all(
    APPLICATION_STATUS_LABELS
      .filter((label) => label !== targetLabel)
      .map((label) => retryAsync(() => removeIssueLabelIfExists(env, cleanIssueNumber, label)))
  );

  const addResponse = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${cleanIssueNumber}/labels`,
    {
      method: "POST",
      body: JSON.stringify({ labels: [targetLabel] }),
    }
  );

  if (!addResponse.ok) {
    const { raw, data } = await parseJsonResponse(addResponse);
    throw new Error(data?.message || raw || `Не вдалося додати label ${targetLabel}.`);
  }

  await Promise.all([
    retryAsync(() => closeGithubIssue(env, cleanIssueNumber, status)),
    retryAsync(() => createStatusComment(env, cleanIssueNumber, status, moderator)),
  ]);

  logWorkerEvent("info", "application.status.updated", {
    issueNumber: cleanIssueNumber,
    status,
    label: targetLabel,
    ms: elapsedMs(startedAt),
  });

  return { ok: true, label: targetLabel, closed: true };
}

function ephemeral(content) {
  return discordInteractionResponse({
    type: 4,
    data: {
      content: limitText(content, 1900, "Дію виконано."),
      flags: 64,
      allowed_mentions: { parse: [] },
    },
  });
}

function isEphemeralMessageInteraction(interaction) {
  return Boolean(Number(interaction?.message?.flags || 0) & 64);
}

function updateInteractionMessage(content) {
  return discordInteractionResponse({
    type: 7,
    data: {
      content: limitText(content, 1900, "Дію виконано."),
      components: [],
      allowed_mentions: { parse: [] },
    },
  });
}

function finishRulesDecision(interaction, content) {
  return isEphemeralMessageInteraction(interaction) ? updateInteractionMessage(content) : ephemeral(content);
}

function snowflakeToBase36(id) {
  return BigInt(id).toString(36);
}

function buildRulesDirectAcceptCustomId(roleIds) {
  const cleaned = Array.from(new Set((roleIds || []).map(snowflake).filter(Boolean)));
  if (!cleaned.length) return "";
  return `${RULES_CUSTOM_ID_PREFIX}:a:${cleaned.map(snowflakeToBase36).join(".")}`;
}

function buildRulesDirectDecisionComponents(roleIds) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Прийняти правила",
          custom_id: buildRulesDirectAcceptCustomId(roleIds),
        },
        {
          type: 2,
          style: 4,
          label: "Відмовитися",
          custom_id: `${RULES_CUSTOM_ID_PREFIX}:d`,
        },
      ],
    },
  ];
}

function rulesConfirmationResponse(rulesAction) {
  const isDecline = rulesAction.action === "confirm_decline";
  const isRaidSignup = rulesAction.action === "confirm_raid_signup";
  const components = isRaidSignup
    ? [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "Підтвердити підпис",
              custom_id: `${RULES_CUSTOM_ID_PREFIX}:r:s`,
            },
          ],
        },
      ]
    : isDecline
      ? [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 4,
                label: "Підтвердити відмову",
                custom_id: `${RULES_CUSTOM_ID_PREFIX}:d`,
              },
            ],
          },
        ]
      : buildRulesDirectDecisionComponents(rulesAction.roleIds);

  return discordInteractionResponse({
    type: 4,
    data: {
      flags: 64,
      allowed_mentions: { parse: [] },
      content: isRaidSignup
        ? "🐉 Підтверди підпис на правила рейду. Бот перевірить твою авторизацію в панелі та main-персонажа."
        : isDecline
          ? "⚠️ Підтверди відмову від правил. Після підтвердження бот видалить тебе із сервера."
          : "🌸 Підтверди прийняття правил. Після підтвердження бот видасть потрібну роль.",
      components,
    },
  });
}

async function addGuildMemberRoles(env, guildId, userId, roleIds, reason) {
  const cleanGuildId = snowflake(guildId);
  const cleanUserId = snowflake(userId);
  const cleanRoleIds = Array.from(new Set((roleIds || []).map(snowflake).filter(Boolean)));

  if (!cleanGuildId || !cleanUserId || !cleanRoleIds.length) {
    throw new Error("Не вистачає guild/user/role ID для видачі ролі.");
  }

  await Promise.all(
    cleanRoleIds.map(async (roleId) => {
      const response = await discordApiFetch(
        env,
        `/guilds/${cleanGuildId}/members/${cleanUserId}/roles/${roleId}`,
        {
          method: "PUT",
          headers: reason ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) } : {},
        }
      );

      if (!response.ok && response.status !== 204) {
        const raw = await response.text().catch(() => "");
        throw new Error(raw || `Discord role error ${response.status}`);
      }

      return roleId;
    })
  );
}

async function kickGuildMember(env, guildId, userId, reason) {
  const cleanGuildId = snowflake(guildId);
  const cleanUserId = snowflake(userId);

  if (!cleanGuildId || !cleanUserId) {
    throw new Error("Не вистачає guild/user ID для кіку.");
  }

  const response = await discordApiFetch(env, `/guilds/${cleanGuildId}/members/${cleanUserId}`, {
    method: "DELETE",
    headers: reason ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) } : {},
  });

  if (!response.ok && response.status !== 204) {
    const raw = await response.text().catch(() => "");
    throw new Error(raw || `Discord kick error ${response.status}`);
  }
}

function memberHasAllRoles(interaction, roleIds) {
  const wanted = Array.from(new Set((roleIds || []).map(snowflake).filter(Boolean)));
  if (!wanted.length) return false;

  const memberRoles = Array.isArray(interaction?.member?.roles)
    ? interaction.member.roles.map(String)
    : [];

  return wanted.every((roleId) => memberRoles.includes(roleId));
}

async function handleRulesInteraction(interaction, env, rulesAction) {
  const guildId = getInteractionGuildId(interaction, env);
  const userId = getDiscordUserId(interaction);
  const userLabel = getDiscordUserLabel(interaction);

  if (rulesAction.action === "confirm_accept" || rulesAction.action === "confirm_decline" || rulesAction.action === "confirm_raid_signup") {
    logWorkerEvent("info", "rules.confirmation.requested", { action: rulesAction.action, guildId, userId, roles: rulesAction.roleIds?.length || 0 });

    if (rulesAction.action !== "confirm_raid_signup") {
      const recordedDecision = await getRecordedRulesDecision(env, guildId, userId).catch(() => null);

      if (recordedDecision === "accepted" || (rulesAction.action === "confirm_accept" && memberHasAllRoles(interaction, rulesAction.roleIds))) {
        await recordRulesDecision(env, guildId, userId, "accepted").catch(() => null);
        return finishRulesDecision(interaction, "✅ Ти вже прийняв правила. Кнопки для тебе більше не потрібні.");
      }

      if (recordedDecision === "declined") {
        return finishRulesDecision(interaction, "🚪 Ти вже відмовився від правил. Дія для тебе завершена.");
      }
    }

    return rulesConfirmationResponse(rulesAction);
  }

  if (isInteractionRateLimited(interaction, "rules")) {
    return finishRulesDecision(interaction, "⏳ Зачекай кілька секунд перед наступною дією.");
  }

  if (rulesAction.action === "raid_signup") {
    const profileResult = await lookupDashboardProfileByDiscord(env, userId);
    if (!profileResult.ok || !hasUsableMainCharacter(profileResult.mainCharacter)) {
      logWorkerEvent("warn", "raid_rules.signup.profile_missing", { guildId, userId, reason: profileResult.reason, status: profileResult.status });
      return finishRulesDecision(
        interaction,
        `❌ Підпис не зараховано: не знайдено авторизований профіль або main-персонажа. Авторизуйся в панелі та вибери main: ${dashboardAuthUrl(env)}`
      );
    }

    const stored = await recordRaidRulesSignup(env, guildId, userId, userLabel, {
      ...profileResult.profile,
      mainCharacter: profileResult.mainCharacter,
    }).catch((error) => {
      logWorkerEvent("warn", "raid_rules.signup.record_failed", { guildId, userId, message: error?.message });
      return { ok: false, error };
    });

    if (!stored?.ok) {
      return finishRulesDecision(interaction, "❌ Підпис не збережено: KV RULES_STATS недоступний або неправильно налаштований.");
    }

    logWorkerEvent("info", "raid_rules.signup.accepted", { guildId, userId, character: stored.signup?.mainCharacter?.name });
    return finishRulesDecision(interaction, `✅ Підпис на правила рейду зараховано. Main: ${formatMainCharacterForMessage(stored.signup?.mainCharacter)}.`);
  }

  try {
    if (rulesAction.action === "accept") {
      if (memberHasAllRoles(interaction, rulesAction.roleIds)) {
        await recordRulesDecision(env, guildId, userId, "accepted").catch(() => null);
        return finishRulesDecision(interaction, "✅ Ти вже прийняв правила. Роль уже є, повторно нічого робити не потрібно.");
      }

      await addGuildMemberRoles(
        env,
        guildId,
        userId,
        rulesAction.roleIds,
        `Rules accepted by ${userLabel}`
      );
      await recordRulesDecision(env, guildId, userId, "accepted").catch((error) => logWorkerEvent("warn", "rules.stats.record_failed", { action: "accepted", guildId, userId, message: error?.message }));
      logWorkerEvent("info", "rules.accepted", { guildId, userId, roles: rulesAction.roleIds.length });

      return finishRulesDecision(interaction, "✅ Правила прийнято. Роль видано. Для тебе ця дія вже завершена.");
    }

    await kickGuildMember(env, guildId, userId, `Rules declined by ${userLabel}`);
    await recordRulesDecision(env, guildId, userId, "declined").catch((error) => logWorkerEvent("warn", "rules.stats.record_failed", { action: "declined", guildId, userId, message: error?.message }));
    logWorkerEvent("info", "rules.declined", { guildId, userId });
    return finishRulesDecision(interaction, "🚪 Ти відмовився від правил, тому бот видалив тебе із сервера.");
  } catch (error) {
    logWorkerEvent("error", "rules.action.failed", { action: rulesAction.action, guildId, userId, message: error?.message });
    return finishRulesDecision(
      interaction,
      `❌ Не вдалося виконати дію правил: ${limitText(error?.message, 180, "невідома помилка")}`
    );
  }
}

async function handleApplicationInteraction(interaction, env, customId) {
  const match = customId.match(/^guild_application:(accepted|declined):(\d+)$/);
  if (!match) return null;

  const status = match[1];
  const issueNumber = match[2];
  const moderator = getDiscordUserLabel(interaction);

  if (!hasAllowedDiscordRole(interaction, env)) {
    return ephemeral("⛔ У вас немає прав для зміни статусу заявки.");
  }

  if (isInteractionRateLimited(interaction, "application")) {
    return ephemeral("⏳ Зачекай кілька секунд перед наступною дією.");
  }

  try {
    await updateApplicationIssueStatus(env, issueNumber, status, moderator);
  } catch (error) {
    return ephemeral(
      `Не вдалося змінити статус заявки: ${limitText(error?.message, 160, "невідома помилка")}`
    );
  }

  const updatedEmbeds = buildUpdatedApplicationEmbeds(
    interaction,
    status,
    issueNumber,
    moderator,
    env
  );

  return discordInteractionResponse({
    type: 7,
    data: {
      content: buildStatusUpdateContent(issueNumber, status, moderator),
      embeds: updatedEmbeds,
      components: [],
      allowed_mentions: { parse: [] },
    },
  });
}

async function handleDiscordInteraction(request, env) {
  const rawBody = await request.text();
  const verified = await verifyDiscordRequest(request, env, rawBody);

  if (!verified) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody || "{}");

  if (interaction.type === 1) {
    return discordInteractionResponse({ type: 1 });
  }

  if (interaction.type !== 3) {
    return ephemeral("Цей тип взаємодії не підтримується.");
  }

  const customId = String(interaction?.data?.custom_id || "");

  const applicationResult = await handleApplicationInteraction(interaction, env, customId);
  if (applicationResult) return applicationResult;

  const rulesAction = decodeRulesCustomId(customId);
  if (rulesAction) return handleRulesInteraction(interaction, env, rulesAction);

  return ephemeral("Невідома або застаріла кнопка Mistblossom Vanguard.");
}

async function githubFetch(env, path, init = {}) {
  const startedAt = nowMs();
  const method = init.method || "GET";

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": env.GITHUB_USER_AGENT || "guild-applications-worker",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });

  if (String(env.DEBUG_LOGS || "").trim() === "1" || !response.ok) {
    logWorkerEvent(response.ok ? "info" : "warn", "github.fetch", {
      method,
      path: sanitizeApiPathForLog(path),
      status: response.status,
      ok: response.ok,
      rate_limit_remaining: response.headers.get("X-RateLimit-Remaining"),
      rate_limit_reset: response.headers.get("X-RateLimit-Reset"),
      ms: elapsedMs(startedAt),
    });
  }

  return response;
}

async function parseJsonResponse(response) {
  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  return { raw, data };
}

function buildDiscordMessageRefComment(discord) {
  const channelId = cleanText(discord?.channel_id, 80);
  const messageId = cleanText(discord?.message_id, 80);

  if (!channelId || !messageId) return "";

  return `\n\n<!-- mistblossom:discord ${JSON.stringify({
    channel_id: channelId,
    message_id: messageId,
  })} -->`;
}

async function storeDiscordMessageRef(env, issue, discord) {
  const marker = buildDiscordMessageRefComment(discord);
  if (!marker || !issue?.number) return { skipped: true };

  const body = String(issue.body || "");
  if (body.includes("mistblossom:discord")) return { skipped: true, reason: "already stored" };

  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issue.number}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body: body + marker }),
    }
  );

  if (!response.ok) {
    const { raw, data } = await parseJsonResponse(response);
    return { ok: false, error: data?.message || raw || "Не вдалося зберегти Discord message ref." };
  }

  return { ok: true };
}

async function createGithubIssue(env, payload) {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
    {
      method: "POST",
      body: JSON.stringify({
        title: `Заявка до гільдії: ${payload.characterName}`,
        body: buildIssueBody(payload),
        labels: [env.GUILD_APPLICATIONS_LABEL || DEFAULT_LABEL, DEFAULT_REVIEW_LABEL],
      }),
    }
  );

  const { raw, data } = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      data?.message ||
        raw ||
        "Не вдалося створити заявку. Спробуй ще раз трохи пізніше."
    );
  }

  return data;
}

async function sendDiscordNotification(env, payload, issue) {
  const botToken = String(env.DISCORD_BOT_TOKEN || "").trim();
  const channelId = String(env.DISCORD_CHANNEL_ID || "").trim();

  if (!botToken || !channelId) {
    return { skipped: true, reason: "DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID is missing" };
  }

  const raiderIoResult = await fetchRaiderIoProfile(payload);
  const response = await discordApiFetch(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: buildDiscordEmbeds(payload, issue, env, raiderIoResult),
      components: buildApplicationButtons(issue.number),
    }),
  });

  const raw = await response.text().catch(() => "");
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || raw || `Discord Application message error ${response.status}`);
  }

  return {
    ok: true,
    message_id: data?.id || null,
    channel_id: data?.channel_id || channelId,
    raider_io: raiderIoResult.ok
      ? { ok: true }
      : { ok: false, error: raiderIoResult.error || "Не вдалося отримати дані Raider.IO." },
  };
}

function mapIssueListItem(issue) {
  const details = extractApplicationDetails(issue.body);
  const statusKey = getIssueStatusKey(issue);

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    status_key: statusKey,
    status_text: getIssueStatus(issue),
    html_url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    closed_at: issue.closed_at,
    summary: extractSummary(issue.body),
    character_name: details.character,
    realm: details.realm,
    region: details.region,
    faction: details.faction,
    class_name: details.class_name,
    labels: Array.isArray(issue.labels) ? issue.labels.map((label) => label.name) : [],
  };
}

function resolveStatusFilter(rawStatus) {
  const text = String(rawStatus || "").trim().toLowerCase();
  if (!text || text === "all") return "all";
  return STATUS_ALIASES[text] || (STATUS_KEYS.has(text) ? text : null);
}

function buildGithubIssuesListPath(env, { limit, sort, direction, label, page }) {
  return `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=all&per_page=${limit}&sort=${sort}&direction=${direction}&labels=${label}&page=${page}`;
}

async function fetchApplicationIssuePage(env, options) {
  const startedAt = nowMs();
  const response = await githubFetch(env, buildGithubIssuesListPath(env, options));
  const { raw, data } = await parseJsonResponse(response);

  return {
    page: options.page,
    ok: response.ok,
    status: response.status,
    ms: elapsedMs(startedAt),
    raw: raw || "",
    data: Array.isArray(data) ? data : [],
    rate_limit_remaining: response.headers.get("X-RateLimit-Remaining"),
    rate_limit_reset: response.headers.get("X-RateLimit-Reset"),
  };
}

function dedupeIssuesByNumber(issues) {
  const seen = new Set();
  const result = [];

  for (const issue of issues) {
    const number = Number(issue?.number);
    if (!Number.isInteger(number) || seen.has(number)) continue;
    seen.add(number);
    result.push(issue);
  }

  return result;
}

async function listApplications(request, env) {
  const startedAt = nowMs();
  const origin = allowedOrigin(request, env) || "*";
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || String(DEFAULT_LIST_LIMIT), 10), 1),
    MAX_LIST_LIMIT
  );
  const sort = ["created", "updated"].includes(url.searchParams.get("sort"))
    ? url.searchParams.get("sort")
    : "created";
  const direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
  const labelName = env.GUILD_APPLICATIONS_LABEL || DEFAULT_LABEL;
  const label = encodeURIComponent(labelName);
  const rawStatus = cleanText(url.searchParams.get("status"), 24).toLowerCase();
  const status = resolveStatusFilter(rawStatus);
  const className = cleanText(url.searchParams.get("class"), 60).toLowerCase();
  const query = cleanText(url.searchParams.get("q"), 120).toLowerCase();
  const defaultPages = rawStatus && rawStatus !== "all" ? DEFAULT_FILTERED_LIST_PAGES : 1;
  const pages = parsePositiveInt(url.searchParams.get("pages"), defaultPages, 1, MAX_GITHUB_LIST_PAGES);
  const debug = isDebugResponseEnabled(request, env);

  if (rawStatus && rawStatus !== "all" && !status) {
    logWorkerEvent("warn", "applications.list.invalid_status", { rawStatus, label: labelName });
    return json(
      {
        error: "Некоректний фільтр статусу.",
        allowed_statuses: ["all", ...Array.from(STATUS_KEYS)],
        diagnostics: debug ? { rawStatus, label: labelName, env: envDiagnostics(env) } : undefined,
      },
      400,
      origin
    );
  }

  logWorkerEvent("info", "applications.list.start", {
    label: labelName,
    limit,
    pages,
    sort,
    direction,
    status: status || "invalid",
    className: className || "all",
    hasQuery: Boolean(query),
  });

  const pageNumbers = Array.from({ length: pages }, (_, index) => index + 1);
  const pageResults = await Promise.all(
    pageNumbers.map((page) => fetchApplicationIssuePage(env, { limit, sort, direction, label, page }))
  );

  const failedPage = pageResults.find((page) => !page.ok);
  if (failedPage) {
    logWorkerEvent("error", "applications.list.github_failed", {
      label: labelName,
      page: failedPage.page,
      status: failedPage.status,
      github_response: failedPage.raw.slice(0, 700),
      ms: elapsedMs(startedAt),
    });

    return json(
      {
        error: "Список заявок тимчасово недоступний.",
        github_status: failedPage.status,
        github_response: failedPage.raw || null,
        diagnostics: debug
          ? {
              label: labelName,
              pages_requested: pages,
              failed_page: failedPage.page,
              page_statuses: pageResults.map((page) => ({ page: page.page, ok: page.ok, status: page.status, ms: page.ms })),
              env: envDiagnostics(env),
            }
          : undefined,
      },
      502,
      origin
    );
  }

  const rawIssues = dedupeIssuesByNumber(pageResults.flatMap((page) => page.data));
  const mappedItems = rawIssues
    .filter((issue) => !issue.pull_request)
    .map(mapIssueListItem);
  const beforeFilterSummary = summarizeApplicationItems(mappedItems);

  let items = mappedItems;

  if (status && status !== "all") {
    items = items.filter((item) => item.status_key === status);
  }
  if (className && className !== "all") {
    items = items.filter((item) => String(item.class_name || "").toLowerCase() === className);
  }
  if (query) {
    items = items.filter((item) =>
      [item.title, item.summary, item.character_name, item.realm, item.region, item.faction, item.class_name]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }

  const afterFilterSummary = summarizeApplicationItems(items);
  const diagnostics = {
    label: labelName,
    repo: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
    limit,
    pages_requested: pages,
    pages: pageResults.map((page) => ({
      page: page.page,
      status: page.status,
      ok: page.ok,
      ms: page.ms,
      count: page.data.length,
      rate_limit_remaining: page.rate_limit_remaining,
      rate_limit_reset: page.rate_limit_reset,
    })),
    filters: {
      status: status || null,
      raw_status: rawStatus || "all",
      class: className || "all",
      query: query || null,
    },
    before_filters: beforeFilterSummary,
    after_filters: afterFilterSummary,
    env: envDiagnostics(env),
    ms: elapsedMs(startedAt),
  };

  logWorkerEvent("info", "applications.list.done", diagnostics);

  return json(
    {
      items,
      total: items.length,
      meta: {
        total_before_filters: mappedItems.length,
        total_after_filters: items.length,
        status_counts: afterFilterSummary.statuses,
        state_counts: afterFilterSummary.states,
      },
      diagnostics: debug ? diagnostics : undefined,
    },
    200,
    origin
  );
}

async function completeDiscordNotification(env, cleanPayload, issue) {
  const startedAt = nowMs();

  try {
    const discord = await sendDiscordNotification(env, cleanPayload, issue);

    if (discord?.ok) {
      discord.issue_ref = await storeDiscordMessageRef(env, issue, discord);
    }

    logWorkerEvent("info", "application.discord.done", {
      issueNumber: issue?.number,
      queued: false,
      ok: Boolean(discord?.ok),
      skipped: Boolean(discord?.skipped),
      reason: discord?.reason,
      message_id: discord?.message_id,
      channel_id: discord?.channel_id,
      raider_io: discord?.raider_io,
      issue_ref: discord?.issue_ref,
      ms: elapsedMs(startedAt),
    });

    return discord;
  } catch (error) {
    const discord = {
      ok: false,
      error: error instanceof Error ? error.message : "Discord notification failed.",
    };

    logWorkerEvent("error", "application.discord.failed", {
      issueNumber: issue?.number,
      message: discord.error,
      ms: elapsedMs(startedAt),
    });

    return discord;
  }
}

async function createApplication(request, env, ctx) {
  const startedAt = nowMs();
  const origin = allowedOrigin(request, env);

  if (!origin) {
    logWorkerEvent("warn", "application.create.origin_denied", {
      origin: request.headers.get("Origin") || "",
      allowed_origins_configured: Boolean(String(env.ALLOWED_ORIGINS || "").trim()),
    });
    return json({ error: "Надсилання заявок зараз недоступне." }, 403, "*");
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    logWorkerEvent("warn", "application.create.invalid_json", { ms: elapsedMs(startedAt) });
    return json({ error: "Не вдалося обробити заявку. Спробуй ще раз." }, 400, origin);
  }

  if (cleanText(payload.website, 200)) {
    logWorkerEvent("warn", "application.create.honeypot", { ms: elapsedMs(startedAt) });
    return json({ error: "Не вдалося надіслати заявку. Спробуй ще раз." }, 400, origin);
  }

  const cleanPayload = sanitizePayload(payload);
  const validationError = validateApplication(cleanPayload);

  if (validationError) {
    logWorkerEvent("warn", "application.create.validation_failed", {
      message: validationError,
      region: cleanPayload.region,
      faction: cleanPayload.faction,
      realm: cleanPayload.realm,
      characterName: cleanPayload.characterName,
      hasAvailability: Boolean(cleanPayload.availability),
      hasBattleTag: Boolean(cleanPayload.battleTag),
      ms: elapsedMs(startedAt),
    });
    return json({ error: validationError }, 400, origin);
  }

  try {
    const issue = await runMeasured(
      "application.github.create",
      { characterName: cleanPayload.characterName, realm: cleanPayload.realm, region: cleanPayload.region },
      () => createGithubIssue(env, cleanPayload)
    );

    const useAsyncDiscord =
      ctx &&
      typeof ctx.waitUntil === "function" &&
      String(env.APPLICATION_DISCORD_ASYNC || "1").trim() !== "0";

    let discord = { queued: true, async: true };

    if (useAsyncDiscord) {
      ctx.waitUntil(completeDiscordNotification(env, cleanPayload, issue));
      logWorkerEvent("info", "application.discord.queued", { issueNumber: issue.number });
    } else {
      discord = await completeDiscordNotification(env, cleanPayload, issue);
    }

    logWorkerEvent("info", "application.create.done", {
      issueNumber: issue.number,
      discord_async: useAsyncDiscord,
      ms: elapsedMs(startedAt),
    });

    return json(
      {
        ok: true,
        number: issue.number,
        html_url: issue.html_url,
        state: issue.state,
        status_text: getIssueStatus(issue),
        title: issue.title,
        discord,
      },
      201,
      origin
    );
  } catch (error) {
    logWorkerEvent("error", "application.create.failed", {
      message: error?.message,
      characterName: cleanPayload.characterName,
      realm: cleanPayload.realm,
      region: cleanPayload.region,
      ms: elapsedMs(startedAt),
    });

    return json(
      {
        error: error instanceof Error ? error.message : "Невідома помилка.",
      },
      500,
      origin
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = nowMs();
    const requestId = requestIdFromRequest(request);
    const url = new URL(request.url);

    logWorkerEvent("info", "request.start", {
      requestId,
      method: request.method,
      path: url.pathname,
      query: url.search ? url.search.slice(0, 500) : "",
      origin: request.headers.get("Origin") || "",
    });

    let response;

    try {
      if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
        logWorkerEvent("error", "request.env_missing", {
          requestId,
          path: url.pathname,
          env: envDiagnostics(env),
        });
        response = json({ error: "Прийом заявок тимчасово недоступний.", diagnostics: isDebugResponseEnabled(request, env) ? envDiagnostics(env) : undefined }, 500, "*");
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      if (request.method === "OPTIONS") {
        response = new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": allowedOrigin(request, env) || "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-store",
          },
        });
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      if (url.pathname === "/api/discord-rules-stats" && request.method === "GET") {
        response = await handleRulesStats(request, env);
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      if (url.pathname === "/api/discord-raid-rules-signups" && request.method === "GET") {
        response = await handleRaidRulesSignups(request, env);
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      if (url.pathname === "/api/discord-interactions" && request.method === "POST") {
        response = await handleDiscordInteraction(request, env);
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      if (!PATHS.has(url.pathname)) {
        response = json(
          { error: "Сторінку не знайдено." },
          404,
          allowedOrigin(request, env) || "*"
        );
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      if (request.method === "GET") {
        response = await listApplications(request, env);
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      if (request.method === "POST") {
        response = await createApplication(request, env, ctx);
        return withTelemetryHeaders(response, requestId, startedAt);
      }

      response = json(
        { error: "Ця дія зараз недоступна." },
        405,
        allowedOrigin(request, env) || "*"
      );
      return withTelemetryHeaders(response, requestId, startedAt);
    } catch (error) {
      logWorkerEvent("error", "request.unhandled", {
        requestId,
        method: request.method,
        path: url.pathname,
        message: error?.message,
        stack: String(error?.stack || "").slice(0, 1200),
        ms: elapsedMs(startedAt),
      });

      response = json(
        {
          error: "Внутрішня помилка Worker.",
          request_id: requestId,
          diagnostics: isDebugResponseEnabled(request, env)
            ? { message: error?.message, env: envDiagnostics(env) }
            : undefined,
        },
        500,
        allowedOrigin(request, env) || "*"
      );
      return withTelemetryHeaders(response, requestId, startedAt);
    } finally {
      logWorkerEvent("info", "request.end", {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response?.status,
        ms: elapsedMs(startedAt),
      });
    }
  },
};
