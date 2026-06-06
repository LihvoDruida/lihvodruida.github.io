import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewRaidDirectory } from "@/lib/permissions";
import { getRaidPoll } from "@/lib/raidPolls";
import { noStoreHeaders } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ pollId: string }> }) {
  const user = await getSession();
  if (!user || !canViewRaidDirectory(user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }
  const { pollId } = await context.params;
  const poll = await getRaidPoll(pollId);
  if (!poll) return NextResponse.json({ ok: false, error: "Poll not found" }, { status: 404, headers: noStoreHeaders() });
  return NextResponse.json({ ok: true, poll }, { headers: noStoreHeaders() });
}
