import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { refreshGuildRosterApiBatch } from "@/lib/guildRoster";
import { canViewGuildRoster } from "@/lib/permissions";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, unauthorizedResponse, verifyTrustedOrigin } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

type GuildRefreshBody = {
  force?: unknown;
  wcl?: unknown;
  forceWcl?: unknown;
};

function truthy(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse();

  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!canViewGuildRoster(session)) return unauthorizedResponse();

  const ip = getClientIp(request);
  const actor = session?.profileId || session?.id || ip;
  const limit = checkRateLimit(`guild-roster-refresh:${actor}`, 30, 15 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

  const globalLimit = checkRateLimit("guild-roster-refresh:global", 120, 15 * 60 * 1000);
  if (!globalLimit.ok) return rateLimitResponse(globalLimit.resetAt);

  try {
    const body = (await request.json().catch(() => null)) as GuildRefreshBody | null;
    const forceRefresh = truthy(body?.force);
    const includeWarcraftLogs = body?.wcl === undefined ? true : truthy(body.wcl);
    const forceWarcraftLogs = truthy(body?.forceWcl);
    const roster = await refreshGuildRosterApiBatch({
      forceRoster: forceRefresh,
      includeWarcraftLogs,
      forceWarcraftLogs,
    });

    logDashboardEvent("info", "guild.roster.refreshed", request, {
      profileId: session?.profileId || null,
      memberCount: roster.members.length,
      source: roster.source,
      refresh: roster.refresh,
    });

    return NextResponse.json({
      ok: true,
      memberCount: roster.members.length,
      updatedAt: roster.stats.updatedAt,
      source: roster.source,
      members: roster.members,
      stats: roster.stats,
      error: roster.error || null,
      refresh: roster.refresh,
      hasMore:
        roster.refresh.raiderIo.remaining > 0 ||
        roster.refresh.warcraftLogs.remaining > 0,
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
