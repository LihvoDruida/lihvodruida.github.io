import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/accessGroups";
import { canManageRaids, canViewRaidDirectory } from "@/lib/permissions";
import { listRaidPolls, saveRaidPollFromForm } from "@/lib/raidPolls";
import { assertRequestBodySize, logDashboardEvent, noStoreHeaders, safeErrorMessage } from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ToastInput = { tone?: "info" | "success" | "warning" | "error"; title: string; message?: string; ttl?: number };

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectWithToast(path: string, toast?: ToastInput) {
  const url = new URL(path, appBaseUrl());
  const response = NextResponse.redirect(url, { status: 303, headers: noStoreHeaders() });
  if (toast) response.headers.append("Set-Cookie", dashboardToastCookie(toast));
  return response;
}

export async function GET() {
  const user = await getSession();
  if (!user || !canViewRaidDirectory(user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }
  const polls = await listRaidPolls(120);
  return NextResponse.json({ ok: true, polls }, { headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  const tooLarge = assertRequestBodySize(request, 32 * 1024);
  if (tooLarge) return tooLarge;

  const user = await getSession();
  if (!user || !canManageRaids(user)) {
    return redirectWithToast("/polls", {
      tone: "error",
      title: "Доступ заборонено",
      message: "Твоя роль не має доступу до створення рейд-пулів.",
      ttl: 7600,
    });
  }

  try {
    const form = await request.formData();
    const poll = await saveRaidPollFromForm(form, user);
    logDashboardEvent("info", "raid_polls.created", request, {
      pollId: poll.id,
      actorId: user.id,
      channelId: poll.channelId || "",
      messageId: poll.messageId || "",
    });
    await recordAdminAudit("raid_polls.create", user, {
      status: "success",
      summary: `Рейд-пул створено: ${poll.title}.`,
      pollId: poll.id,
      title: poll.title,
      channelId: poll.channelId || null,
      messageId: poll.messageId || null,
    }).catch(() => false);
    return redirectWithToast(`/polls/${encodeURIComponent(poll.id)}`, {
      tone: "success",
      title: "Рейд-пул створено",
      message: "Повідомлення опубліковано в Discord, голосування відкрите.",
      ttl: 6200,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("error", "raid_polls.create_failed", request, { actorId: user.id, message });
    await recordAdminAudit("raid_polls.create_failed", user, {
      status: "error",
      summary: `Рейд-пул не створено: ${message}`,
      error: error instanceof Error ? error.message : String(error || ""),
    }).catch(() => false);
    return redirectWithToast("/polls/new", {
      tone: "error",
      title: "Рейд-пул не створено",
      message,
      ttl: 8600,
    });
  }
}
