import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { closeRaid } from "@/lib/raids";
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ raidId: string }> }) {
  const user = await getSession();
  if (!user || !canManageRaids(user)) {
    return redirectWithToast("/raids", {
      tone: "error",
      title: "Доступ заборонено",
      message: "Твоя роль не має доступу до керування рейдами.",
      ttl: 7600,
    });
  }

  const { raidId } = await params;
  try {
    logDashboardEvent("info", "raids.close.start", request, { raidId, actorId: user.id, actorRole: user.role });
    const result = await closeRaid(raidId);
    logDashboardEvent("info", "raids.close.done", request, { raidId: result.id, actorId: user.id, actorRole: user.role });
    return redirectWithToast(`/raids/${encodeURIComponent(result.id)}`, {
      tone: "success",
      title: "Рейд закрито",
      message: "Запис вимкнено, Discord-кнопки стали неактивними.",
      ttl: 6200,
    });
  } catch (error) {
    logDashboardEvent("error", "raids.close.failed", request, { raidId, actorId: user.id, actorRole: user.role, message: safeErrorMessage(error) });
    return redirectWithToast("/raids", {
      tone: "error",
      title: "Дію з рейдом не виконано",
      message: safeErrorMessage(error),
      ttl: 8600,
    });
  }
}
