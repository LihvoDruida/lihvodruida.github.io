import { NextRequest, NextResponse } from "next/server";
import { handleRaidDiscordAction, type RaidSignupStatus } from "@/lib/raids";
import { noStoreHeaders, safeErrorMessage } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get("x-worker-stats-token") || "";
}

function isAllowed(request: NextRequest) {
  const expected = String(process.env.INTERNAL_PROFILE_LOOKUP_TOKEN || process.env.DISCORD_RULES_STATS_TOKEN || process.env.WORKER_STATS_TOKEN || "").trim();
  const provided = bearerToken(request);
  return Boolean(expected && provided && expected === provided);
}

function cleanAction(value: unknown): RaidSignupStatus {
  return value === "late" ? "late" : value === "skipped" || value === "skip" ? "skipped" : "going";
}

export async function POST(request: NextRequest, context: { params: Promise<{ raidId: string }> }) {
  if (!isAllowed(request)) {
    return NextResponse.json({ ok: false, content: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }

  const { raidId } = await context.params;
  try {
    const body = await request.json();
    const result = await handleRaidDiscordAction({
      raidId,
      action: cleanAction(body?.action),
      userId: String(body?.userId || body?.user_id || ""),
      userName: String(body?.userName || body?.user_name || "Discord user"),
      characterKey: String(body?.characterKey || body?.character_key || "").trim() || null,
      messageRef: {
        channelId: String(body?.channelId || body?.channel_id || ""),
        messageId: String(body?.messageId || body?.message_id || ""),
      },
    });
    return NextResponse.json(result, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, content: safeErrorMessage(error) }, { status: 500, headers: noStoreHeaders() });
  }
}
