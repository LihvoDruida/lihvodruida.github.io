import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/accessGroups";
import { canManageRaids } from "@/lib/permissions";
import { saveRaidBenchPrioritySettingsFromForm } from "@/lib/raids";
import {
  assertRequestBodySize,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ToastInput = {
  tone?: "info" | "success" | "warning" | "error";
  title: string;
  message?: string;
  ttl?: number;
};

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL ||
    process.env.ADMIN_DASHBOARD_URL ||
    process.env.DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  );
}

function redirectWithToast(path: string, toast?: ToastInput) {
  const url = new URL(path, appBaseUrl());
  const response = NextResponse.redirect(url, {
    status: 303,
    headers: noStoreHeaders(),
  });
  if (toast) response.headers.append("Set-Cookie", dashboardToastCookie(toast));
  return response;
}

export async function POST(request: NextRequest) {
  const tooLarge = assertRequestBodySize(request, 128 * 1024);
  if (tooLarge) return tooLarge;

  const user = await getSession();
  if (!user || !canManageRaids(user)) {
    return redirectWithToast("/raids", {
      tone: "error",
      title: "Доступ заборонено",
      message: "Твоя роль не має доступу до налаштувань рейдів.",
      ttl: 7600,
    });
  }

  try {
    const form = await request.formData();
    const settings = await saveRaidBenchPrioritySettingsFromForm(form, user);
    logDashboardEvent("info", "raids.bench_priority.saved", request, {
      actorId: user.id,
      actorRole: user.role,
      enabled: settings.enabled,
      characterKeys: settings.characterKeys.length,
      manualNames: settings.manualNames.length,
    });
    await recordAdminAudit("raids.bench_priority.save", user, {
      status: "success",
      summary: `Сірий список рейдів оновлено: ${settings.characterKeys.length} зі складу, ${settings.manualNames.length} вручну.`,
      enabled: settings.enabled,
      characterKeys: settings.characterKeys.length,
      manualNames: settings.manualNames.length,
    }).catch(() => false);
    return redirectWithToast("/raids/bench-priority", {
      tone: "success",
      title: "Сірий список збережено",
      message:
        "Нові правила одразу застосовуються до всіх рейдів і Discord-складу.",
      ttl: 6200,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    logDashboardEvent("error", "raids.bench_priority.save_failed", request, {
      actorId: user.id,
      actorRole: user.role,
      message,
    });
    await recordAdminAudit("raids.bench_priority.save_failed", user, {
      status: "error",
      summary: `Сірий список рейдів не збережено: ${message}`,
      error: error instanceof Error ? error.message : String(error || ""),
    }).catch(() => false);
    return redirectWithToast("/raids/bench-priority", {
      tone: "error",
      title: "Сірий список не збережено",
      message,
      ttl: 8600,
    });
  }
}
