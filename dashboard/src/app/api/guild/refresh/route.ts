import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadGuildRosterData } from "@/lib/guildRoster";
import { canViewGuildRoster } from "@/lib/permissions";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, unauthorizedResponse, verifyTrustedOrigin } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse();

  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!canViewGuildRoster(session)) return unauthorizedResponse();

  const ip = getClientIp(request);
  const limit = checkRateLimit(`guild-roster-refresh:${session?.profileId || session?.id || ip}`, 4, 15 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  const globalLimit = checkRateLimit("guild-roster-refresh:global", 8, 15 * 60 * 1000);
  if (!globalLimit.ok) return rateLimitResponse(globalLimit.resetAt);

  try {
    const body = await request.json().catch(() => null) as { force?: unknown } | null;
    const forceRefresh = body?.force !== false;
    const roster = await loadGuildRosterData({ forceRefresh });
    logDashboardEvent("info", "guild.roster.refreshed", request, {
      profileId: session?.profileId || null,
      memberCount: roster.members.length,
      source: roster.source,
    });

    return NextResponse.json({
      ok: true,
      memberCount: roster.members.length,
      updatedAt: roster.stats.updatedAt,
      source: roster.source,
      members: roster.members,
      stats: roster.stats,
      error: roster.error || null,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    logDashboardEvent("warn", "guild.roster.refresh_failed", request, {
      profileId: session?.profileId || null,
      message: safeErrorMessage(error),
    });

    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Не вдалося оновити склад гільдії.",
    }, { status: 500, headers: noStoreHeaders() });
  }
}
