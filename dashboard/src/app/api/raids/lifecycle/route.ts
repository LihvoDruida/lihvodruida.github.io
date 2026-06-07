import { NextRequest, NextResponse } from "next/server";
import { syncRaidLifecycleBatch } from "@/lib/raids";
import {
  checkRateLimit,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  rateLimitResponse,
  safeErrorMessage,
  unauthorizedResponse,
  verifyInternalBearerToken,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.floor(number), max));
}

export async function GET(request: NextRequest) {
  const token = await verifyInternalBearerToken(request, [
    "RAID_LIFECYCLE_SECRET",
    "CRON_SECRET",
    "INTERNAL_API_TOKEN",
    "INTERNAL_PROFILE_LOOKUP_TOKEN",
    "DISCORD_RULES_STATS_TOKEN",
    "WORKER_STATS_TOKEN",
  ], { minLength: 24 });
  if (!token.ok) {
    logDashboardEvent("warn", "raids.lifecycle.forbidden", request, { reason: token.reason, envName: token.envName || null });
    return unauthorizedResponse();
  }

  const ip = getClientIp(request);
  const limitState = checkRateLimit(`raids-lifecycle:${ip}`, 12, 60 * 60 * 1000);
  if (!limitState.ok) return rateLimitResponse(limitState.resetAt);

  try {
    const url = new URL(request.url);
    const limit = integerParam(url.searchParams.get("limit"), 100, 1, 100);
    const result = await syncRaidLifecycleBatch(limit);
    logDashboardEvent("info", "raids.lifecycle.cron", request, result);
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "raids.lifecycle.cron_failed", request, { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noStoreHeaders() });
  }
}
