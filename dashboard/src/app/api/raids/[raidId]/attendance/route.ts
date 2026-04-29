import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { handleRaidSessionAction, type RaidSignupStatus } from "@/lib/raids";
import { noStoreHeaders, safeErrorMessage } from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function raidPath(raidId: string) {
  return `/raids/${encodeURIComponent(raidId)}`;
}

function redirectToRaid(raidId: string, toast?: { tone?: "info" | "success" | "warning" | "error"; title: string; message?: string; ttl?: number }) {
  const url = new URL(raidPath(raidId), appBaseUrl());
  const response = NextResponse.redirect(url, { headers: noStoreHeaders() });
  if (toast) response.headers.append("Set-Cookie", dashboardToastCookie(toast));
  return response;
}

function cleanAction(value: unknown): RaidSignupStatus {
  return value === "late" ? "late" : value === "skipped" || value === "skip" ? "skipped" : "going";
}

export async function POST(request: NextRequest, context: { params: Promise<{ raidId: string }> }) {
  const { raidId } = await context.params;
  const user = await getSession();

  if (!user) {
    const loginUrl = new URL("/login", appBaseUrl());
    loginUrl.searchParams.set("next", raidPath(raidId));
    return NextResponse.redirect(loginUrl, { headers: noStoreHeaders() });
  }

  try {
    const form = await request.formData();
    const action = cleanAction(form.get("action"));
    const result = await handleRaidSessionAction({ raidId, action, user });

    if (!result.ok) {
      return redirectToRaid(raidId, { tone: "error", title: "Запис не оновлено", message: result.content || "Дію не виконано.", ttl: 8200 });
    }

    const successMessage = action === "going"
      ? "Тебе записано на рейд. Склад оновлено."
      : action === "late"
        ? "Позначено, що ти затримаєшся. Склад оновлено."
        : "Позначено, що ти пропускаєш рейд.";

    return redirectToRaid(raidId, { tone: "success", title: "Запис оновлено", message: successMessage, ttl: 6200 });
  } catch (error) {
    return redirectToRaid(raidId, { tone: "error", title: "Запис не оновлено", message: safeErrorMessage(error), ttl: 8200 });
  }
}
