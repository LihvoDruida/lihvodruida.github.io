import { NextRequest, NextResponse } from "next/server";
import { closeDueRaidPolls } from "@/lib/raidPolls";
import { logDashboardEvent, noStoreHeaders, safeErrorMessage, verifyInternalBearerToken } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const INTERNAL_POLL_CRON_TOKENS = ["RAID_LIFECYCLE_SECRET", "CRON_SECRET", "INTERNAL_API_TOKEN", "WORKER_STATS_TOKEN", "INTERNAL_PROFILE_LOOKUP_TOKEN", "DISCORD_RULES_STATS_TOKEN"];

async function run(request: NextRequest) {
  const auth = await verifyInternalBearerToken(request, INTERNAL_POLL_CRON_TOKENS, { minLength: 24 });
  if (!auth.ok) {
    logDashboardEvent("warn", "raid_polls.close_due.forbidden", request, { reason: auth.reason, envName: auth.envName || null });
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }
  try {
    const result = await closeDueRaidPolls();
    logDashboardEvent(result.failed ? "warn" : "info", "raid_polls.close_due", request, result);
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("warn", "raid_polls.close_due_degraded", request, { message });
    return NextResponse.json({
      ok: true,
      degraded: true,
      checked: 0,
      scanned: 0,
      closed: 0,
      repeatedChecked: 0,
      repeated: 0,
      deleted: 0,
      failed: 1,
      errors: [message],
    }, { headers: noStoreHeaders() });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
