import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { getRaid, isRaidClosed, raidDisplayCapacity, raidLiveRevision, raidRosterCounts, raidTitle } from "@/lib/raids";
import { noStoreHeaders } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ raidId: string }> }) {
  const { raidId } = await context.params;
  const user = await getSession();
  const raid = await getRaid(raidId);
  const canManage = canManageRaids(user);

  if (!raid || (raid.status !== "published" && raid.status !== "closed" && !canManage)) {
    return NextResponse.json({ ok: false, message: "Рейд недоступний." }, { status: 404, headers: noStoreHeaders() });
  }

  const counts = raidRosterCounts(raid);
  return NextResponse.json({
    ok: true,
    id: raid.id,
    title: raidTitle(raid),
    status: raid.status,
    closed: isRaidClosed(raid),
    revision: raidLiveRevision(raid),
    updatedAt: raid.updatedAt || null,
    roster: counts.roster,
    capacity: raidDisplayCapacity(raid),
    late: counts.late,
    skipped: counts.skipped,
  }, { headers: noStoreHeaders() });
}
