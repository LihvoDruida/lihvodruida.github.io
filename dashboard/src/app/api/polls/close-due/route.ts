import { NextRequest, NextResponse } from "next/server";
import { closeDueRaidPolls } from "@/lib/raidPolls";
import { noStoreHeaders, safeErrorMessage, verifyInternalBearerToken } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const INTERNAL_POLL_CRON_TOKENS = ["WORKER_STATS_TOKEN", "INTERNAL_PROFILE_LOOKUP_TOKEN", "DISCORD_RULES_STATS_TOKEN"];

export async function POST(request: NextRequest) {
  const auth = await verifyInternalBearerToken(request, INTERNAL_POLL_CRON_TOKENS, { minLength: 24 });
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  try {
    const closed = await closeDueRaidPolls();
    return NextResponse.json({ ok: true, closed }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500, headers: noStoreHeaders() });
  }
}
