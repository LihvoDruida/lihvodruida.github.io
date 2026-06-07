import { NextRequest, NextResponse } from "next/server";
import {
  getRaidLifecyclePlan,
  runRaidLifecycleAction,
  syncRaidLifecycleBatch,
} from "@/lib/raids";
import {
  assertRequestBodySize,
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

function lifecycleAuth(request: NextRequest) {
  return verifyInternalBearerToken(
    request,
    ["RAID_LIFECYCLE_SECRET", "CRON_SECRET", "INTERNAL_API_TOKEN"],
    { minLength: 24 },
  );
}

async function enforceLifecycleRateLimit(request: NextRequest) {
  const ip = getClientIp(request);
  const limitState = checkRateLimit(`raids-lifecycle:${ip}`, 60, 60 * 60 * 1000);
  if (!limitState.ok) return rateLimitResponse(limitState.resetAt);
  return null;
}

export async function GET(request: NextRequest) {
  const token = await lifecycleAuth(request);
  if (!token.ok) return unauthorizedResponse();

  const limited = await enforceLifecycleRateLimit(request);
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const limit = integerParam(url.searchParams.get("limit"), 100, 1, 100);
    const mode = String(url.searchParams.get("mode") || "sync").toLowerCase();

    if (mode === "plan") {
      const result = await getRaidLifecyclePlan(limit);
      logDashboardEvent("info", "raids.lifecycle.plan", request, result);
      return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
    }

    // Backward compatibility: old Worker/dashboard cron calls GET without mode
    // and expects the dashboard to perform the lifecycle work itself.
    const result = await syncRaidLifecycleBatch(limit);
    logDashboardEvent("info", "raids.lifecycle.sync", request, result);
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "raids.lifecycle.failed", request, { message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: NextRequest) {
  const tooLarge = assertRequestBodySize(request, 32 * 1024);
  if (tooLarge) return tooLarge;

  const token = await lifecycleAuth(request);
  if (!token.ok) return unauthorizedResponse();

  const limited = await enforceLifecycleRateLimit(request);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const raidId = String(body?.raidId || body?.id || "").trim();
    const requestId = String(body?.requestId || request.headers.get("x-idempotency-key") || "").slice(0, 140);

    if (action === "run") {
      const url = new URL(request.url);
      const limit = integerParam(url.searchParams.get("limit"), 100, 1, 100);
      const result = await syncRaidLifecycleBatch(limit);
      logDashboardEvent("info", "raids.lifecycle.manual_run", request, { requestId, ...result });
      return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
    }

    if (action !== "close" && action !== "delete-discord") {
      return NextResponse.json(
        { ok: false, error: "Unsupported lifecycle action." },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const result = await runRaidLifecycleAction(action, raidId);
    logDashboardEvent("info", "raids.lifecycle.action", request, {
      requestId,
      source: body?.source || null,
      lifecycleReason: body?.reason || null,
      ...result,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "raids.lifecycle.action_failed", request, { message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
