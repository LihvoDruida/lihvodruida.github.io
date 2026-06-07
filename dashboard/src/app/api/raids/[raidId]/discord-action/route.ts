import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleRaidDiscordAction, type RaidCharacterRole, type RaidSignupStatus } from "@/lib/raids";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  assertRequestBodySize,
  checkRateLimit,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
  verifyInternalBearerToken,
} from "@/lib/security";

export const revalidate = 0;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_RAID_ACTION_TOKENS = [
  "DISCORD_RULES_STATS_TOKEN",
  "WORKER_STATS_TOKEN",
  "INTERNAL_PROFILE_LOOKUP_TOKEN",
];

const IDEMPOTENCY_COLLECTION = "dashboardWorkerIdempotency";
const IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;

function idempotencyDocId(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

type IdempotencyReservation =
  | { state: "none" }
  | { state: "hit"; value: unknown }
  | { state: "processing" };

async function reserveIdempotencyKey(key: string): Promise<IdempotencyReservation> {
  if (!key) return { state: "none" };
  const db = getFirebaseAdminDb();
  const ref = db.collection(IDEMPOTENCY_COLLECTION).doc(idempotencyDocId(key));
  const now = Date.now();
  const expiresAt = now + IDEMPOTENCY_TTL_MS;

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      if (Number(data.expiresAtMs || 0) > now && data.response) {
        return { state: "hit", value: data.response };
      }
      if (Number(data.expiresAtMs || 0) > now && data.status === "processing") {
        return { state: "processing" };
      }
    }

    transaction.set(ref, {
      keyHash: idempotencyDocId(key),
      status: "processing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAtMs: expiresAt,
    });
    return { state: "none" };
  });
}

async function storeIdempotencyResponse(key: string, value: unknown) {
  if (!key) return;
  const db = getFirebaseAdminDb();
  await db.collection(IDEMPOTENCY_COLLECTION).doc(idempotencyDocId(key)).set({
    status: "done",
    response: value,
    updatedAt: new Date().toISOString(),
    expiresAtMs: Date.now() + IDEMPOTENCY_TTL_MS,
  }, { merge: true });
}

function cleanIdempotencyKey(value: unknown) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9:._-]{12,220}$/.test(key) ? key : "";
}

function cleanAction(value: unknown): RaidSignupStatus {
  return value === "late" ? "late" : value === "skipped" || value === "skip" ? "skipped" : "going";
}

function cleanSignupRole(value: unknown): RaidCharacterRole | null {
  const role = String(value || "").trim().toLowerCase();
  if (role === "tank") return "tank";
  if (role === "healer" || role === "heal") return "healer";
  if (role === "dps" || role === "dd") return "dps";
  return null;
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
      const reservation = await reserveIdempotencyKey(idempotencyKey);
      if (reservation.state === "hit") {
        return NextResponse.json(reservation.value, { headers: noStoreHeaders({ "X-Mistblossom-Idempotency": "HIT" }) });
      }
      if (reservation.state === "processing") {
        return NextResponse.json({ ok: false, content: "Запит уже обробляється. Натисни ще раз за кілька секунд, якщо Discord не оновив відповідь." }, { status: 409, headers: noStoreHeaders({ "X-Mistblossom-Idempotency": "PROCESSING" }) });
      }
    }

    const result = await handleRaidDiscordAction({
      raidId,
      action: cleanAction(body?.action),
      userId,
      userName: String(body?.userName || body?.user_name || "Discord user").trim().slice(0, 120) || "Discord user",
      characterKey: String(body?.characterKey || body?.character_key || "").trim().slice(0, 120) || null,
      signupRole: cleanSignupRole(body?.signupRole || body?.signup_role || body?.role),
      messageRef: {
        channelId,
        messageId,
      },
    });
    if (idempotencyKey) await storeIdempotencyResponse(idempotencyKey, result);
    return NextResponse.json(result, { headers: noStoreHeaders(idempotencyKey ? { "X-Mistblossom-Idempotency": "MISS" } : undefined) });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("error", "raids.discord_action.failed", request, { raidId, message });
    return NextResponse.json({ ok: false, content: message }, { status: 500, headers: noStoreHeaders() });
  }
}
