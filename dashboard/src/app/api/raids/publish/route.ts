import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { getProfileById } from "@/lib/profiles";
import { saveAndMaybePublishRaid } from "@/lib/raids";
import { logDashboardEvent, noStoreHeaders, safeErrorMessage } from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user || !canManageRaids(user)) {
    return redirectWithToast("/raids", {
      tone: "error",
      title: "Доступ заборонено",
      message: "Твоя роль не має доступу до керування рейдами.",
      ttl: 7600,
    });
  }

  let failurePath = "/raids";

  try {
    const form = await request.formData();
    form.set("action", "publish");
    const raidId = String(form.get("raidId") || "").trim();
    failurePath = raidId ? `/raids/${encodeURIComponent(raidId)}/edit` : "/raids/new";

    const profile = user.profileId ? await getProfileById(user.profileId) : null;
    logDashboardEvent("info", "raids.discord.publish.start", request, {
      raidId,
      actorId: user.id,
      actorRole: user.role,
      channelId: String(form.get("channelId") || ""),
    });

    const result = await saveAndMaybePublishRaid(form, user, profile);
    const discordEvent = result.discordAction === "updated" ? "raids.discord.updated" : "raids.discord.created";
    const toastTitle = result.discordAction === "updated" ? "Discord-оголошення оновлено" : "Discord-оголошення опубліковано";

    logDashboardEvent("info", discordEvent, request, {
      raidId: result.raid.id,
      actorId: user.id,
      actorRole: user.role,
      messageUrl: result.published || "",
      channelId: result.raid.channelId || "",
      messageId: result.raid.messageId || "",
    });

    return redirectWithToast(`/raids/${encodeURIComponent(result.raid.id)}/edit`, {
      tone: "success",
      title: toastTitle,
      message: result.published || "Discord-повідомлення оброблено.",
      ttl: 7600,
    });
  } catch (error) {
    logDashboardEvent("error", "raids.discord.publish.failed", request, { actorId: user.id, actorRole: user.role, message: safeErrorMessage(error) });
    return redirectWithToast(failurePath, {
      tone: "error",
      title: "Discord-публікацію не виконано",
      message: safeErrorMessage(error),
      ttl: 9200,
    });
  }
}
