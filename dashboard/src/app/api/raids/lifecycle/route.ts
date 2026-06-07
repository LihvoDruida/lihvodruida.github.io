import { NextRequest, NextResponse } from "next/server";
import { syncRaidLifecycleBatch } from "@/lib/raids";
import {
  logDashboardEvent,
  noStoreHeaders,
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

declare global {
  // eslint-disable-next-line no-var
  var __mistblossomRaidLifecycleRouteGuard:
    | { inFlight?: Promise<unknown>; lastStartedAt: number; lastResult?: Record<string, unknown> }
    | undefined;
}

function lifecycleGuard() {
  const guard = globalThis.__mistblossomRaidLifecycleRouteGuard || { lastStartedAt: 0 };
  globalThis.__mistblossomRaidLifecycleRouteGuard = guard;
  return guard;
}

function lifecycleMinIntervalMs() {
  const value = Number(process.env.RAID_LIFECYCLE_MIN_INTERVAL_MS || process.env.DASHBOARD_RAID_LIFECYCLE_MIN_INTERVAL_MS || 45_000);
  if (!Number.isFinite(value)) return 45_000;
  return Math.max(0, Math.min(Math.floor(value), 10 * 60_000));
}

function wantsForceRun(request: NextRequest) {
  const url = new URL(request.url);
  return url.searchParams.get("force") === "1" || request.headers.get("x-force-lifecycle") === "1";
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

  const guard = lifecycleGuard();
  const force = wantsForceRun(request);
  const minInterval = lifecycleMinIntervalMs();
  const now = Date.now();

  if (!force && guard.inFlight) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "in_flight", ...(guard.lastResult || {}) },
      { headers: noStoreHeaders({ "X-Mistblossom-Lifecycle": "in-flight" }) },
    );
  }

  if (!force && guard.lastStartedAt && now - guard.lastStartedAt < minInterval) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "cooldown", cooldownMs: minInterval, ...(guard.lastResult || {}) },
      { headers: noStoreHeaders({ "X-Mistblossom-Lifecycle": "cooldown" }) },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = integerParam(url.searchParams.get("limit"), 100, 1, 100);
    guard.lastStartedAt = now;
    const promise = syncRaidLifecycleBatch(limit);
    guard.inFlight = promise;
    const result = await promise;
    guard.lastResult = result as Record<string, unknown>;
    logDashboardEvent("info", "raids.lifecycle.cron", request, { ...result, cooldownMs: minInterval });
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "raids.lifecycle.cron_failed", request, { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: noStoreHeaders() });
  } finally {
    const guard = lifecycleGuard();
    guard.inFlight = undefined;
  }
}
