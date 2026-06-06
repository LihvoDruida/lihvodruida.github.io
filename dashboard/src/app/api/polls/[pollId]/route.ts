import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/accessGroups";
import { canManageRaids, canViewRaidDirectory } from "@/lib/permissions";
import { deleteRaidPoll, getRaidPoll } from "@/lib/raidPolls";
import { logDashboardEvent, noStoreHeaders, safeErrorMessage } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ pollId: string }> }) {
  const user = await getSession();
  if (!user || !canViewRaidDirectory(user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }
  const { pollId } = await context.params;
  const poll = await getRaidPoll(pollId, { bypassCache: true });
  if (!poll) return NextResponse.json({ ok: false, error: "Poll not found" }, { status: 404, headers: noStoreHeaders() });
  return NextResponse.json({ ok: true, poll }, { headers: noStoreHeaders() });
}

export async function DELETE(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const user = await getSession();
  const { pollId } = await context.params;
  if (!user || !canManageRaids(user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }

  try {
    const result = await deleteRaidPoll(pollId);
    logDashboardEvent("info", "raid_polls.deleted", request, {
      pollId: result.poll.id,
      actorId: user.id,
      discordDeleted: result.discordDeleted,
      discordDeleteFailed: result.discordDeleteFailed,
    });
    await recordAdminAudit("raid_polls.delete", user, {
      status: result.discordDeleteFailed ? "warning" : "success",
      summary: result.discordDeleteFailed
        ? `Рейд-пул видалено із сайту, але Discord-повідомлення не вдалося видалити: ${result.poll.title}.`
        : `Рейд-пул видалено: ${result.poll.title}.`,
      pollId: result.poll.id,
      title: result.poll.title,
      channelId: result.poll.channelId || null,
      messageId: result.poll.messageId || null,
    }).catch(() => false);

    return NextResponse.json({
      ok: true,
      pollId: result.poll.id,
      redirectTo: "/polls",
      discordDeleted: result.discordDeleted,
      discordDeleteFailed: result.discordDeleteFailed,
      warning: result.discordDeleteFailed ? "Пул видалено із сайту, але Discord-повідомлення не вдалося видалити автоматично." : null,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("error", "raid_polls.delete_failed", request, { pollId, actorId: user.id, message });
    await recordAdminAudit("raid_polls.delete_failed", user, {
      status: "error",
      summary: `Рейд-пул не видалено: ${message}`,
      pollId,
      error: error instanceof Error ? error.message : String(error || ""),
    }).catch(() => false);
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: noStoreHeaders() });
  }
}
