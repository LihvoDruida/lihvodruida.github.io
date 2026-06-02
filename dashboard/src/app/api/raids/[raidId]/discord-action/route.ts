import { NextRequest, NextResponse } from "next/server";
import { handleRaidDiscordAction, type RaidSignupStatus } from "@/lib/raids";
import {
  assertRequestBodySize,
  checkRateLimit,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
  verifyInternalBearerToken,
} from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_RAID_ACTION_TOKENS = [
  "DISCORD_RULES_STATS_TOKEN",
  "WORKER_STATS_TOKEN",
  "INTERNAL_PROFILE_LOOKUP_TOKEN",
];

declare global {
  // eslint-disable-next-line no-var
  var __mistblossomRaidDiscordActionIdempotency: Map<string, { value: unknown; expiresAt: number }> | undefined;
}

function idempotencyCache() {
  const map = globalThis.__mistblossomRaidDiscordActionIdempotency || new Map<string, { value: unknown; expiresAt: number }>();
  globalThis.__mistblossomRaidDiscordActionIdempotency = map;
  const now = Date.now();
  if (map.size > 500) {
    for (const [key, item] of map) if (item.expiresAt <= now) map.delete(key);
  }
  return map;
}

function cleanIdempotencyKey(value: unknown) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9:._-]{12,220}$/.test(key) ? key : "";
}

function cleanAction(value: unknown): RaidSignupStatus {
  return value === "late" ? "late" : value === "skipped" || value === "skip" ? "skipped" : "going";
}

function cleanDiscordId(value: unknown) {
  const id = String(value || "").trim();
  return /^\d{16,25}$/.test(id) ? id : "";
}

function cleanDiscordMessageId(value: unknown) {
  const id = String(value || "").trim();
  return /^\d{16,25}$/.test(id) ? id : "";
}

export async function POST(request: NextRequest, context: { params: Promise<{ raidId: string }> }) {
  const tooLarge = assertRequestBodySize(request, 16 * 1024);
  if (tooLarge) return tooLarge;

  const ip = getClientIp(request);
  const limit = checkRateLimit(`raid-discord-action:${ip}`, 90, 10 * 60 * 1000);
  if (!limit.ok) {
    logDashboardEvent("warn", "raids.discord_action.rate_limited", request, { resetAt: limit.resetAt });
    return NextResponse.json({ ok: false, content: "Rate limited" }, { status: 429, headers: noStoreHeaders({ "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) }) });
  }

  const auth = await verifyInternalBearerToken(request, INTERNAL_RAID_ACTION_TOKENS, { minLength: 24 });
  if (!auth.ok) {
    logDashboardEvent("warn", "raids.discord_action.forbidden", request, { reason: auth.reason });
    return NextResponse.json({ ok: false, content: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }

  const { raidId } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    const userId = cleanDiscordId(body?.userId || body?.user_id);
    const channelId = cleanDiscordMessageId(body?.channelId || body?.channel_id);
    const messageId = cleanDiscordMessageId(body?.messageId || body?.message_id);

    if (!userId) {
      return NextResponse.json({ ok: false, content: "Invalid Discord user id" }, { status: 400, headers: noStoreHeaders() });
    }

    const idempotencyKey = cleanIdempotencyKey(request.headers.get("x-idempotency-key"));
    if (idempotencyKey) {
      const cached = idempotencyCache().get(idempotencyKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.value, { headers: noStoreHeaders({ "X-Mistblossom-Idempotency": "HIT" }) });
      }
    }

    const result = await handleRaidDiscordAction({
      raidId,
      action: cleanAction(body?.action),
      userId,
      userName: String(body?.userName || body?.user_name || "Discord user").trim().slice(0, 120) || "Discord user",
      characterKey: String(body?.characterKey || body?.character_key || "").trim().slice(0, 120) || null,
      messageRef: {
        channelId,
        messageId,
      },
    });
    if (idempotencyKey) {
      idempotencyCache().set(idempotencyKey, { value: result, expiresAt: Date.now() + 90_000 });
    }
    return NextResponse.json(result, { headers: noStoreHeaders(idempotencyKey ? { "X-Mistblossom-Idempotency": "MISS" } : undefined) });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("error", "raids.discord_action.failed", request, { raidId, message });
    return NextResponse.json({ ok: false, content: message }, { status: 500, headers: noStoreHeaders() });
  }
}
