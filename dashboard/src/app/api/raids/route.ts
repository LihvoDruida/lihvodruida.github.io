import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { getProfileById } from "@/lib/profiles";
import { closeRaid, deleteDraftRaid, saveAndMaybePublishRaid } from "@/lib/raids";
import { noStoreHeaders, safeErrorMessage } from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToastInput = { tone?: "info" | "success" | "warning" | "error"; title: string; message?: string; ttl?: number };

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectWithToast(path: string, toast?: ToastInput) {
  const url = new URL(path, appBaseUrl());
  const response = NextResponse.redirect(url, { headers: noStoreHeaders() });
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

  try {
    const form = await request.formData();
    const action = String(form.get("action") || "").trim();
    const raidId = String(form.get("raidId") || "").trim();

    if (action === "delete") {
      const deleted = await deleteDraftRaid(raidId);
      return redirectWithToast("/raids", {
        tone: "success",
        title: "Чернетку видалено",
        message: deleted.title,
        ttl: 5200,
      });
    }

    if (action === "close") {
      const closed = await closeRaid(raidId);
      return redirectWithToast(`/raids/${encodeURIComponent(closed.id)}`, {
        tone: "success",
        title: "Рейд закрито",
        message: "Запис вимкнено, кнопки Discord стали неактивними.",
        ttl: 6400,
      });
    }

    const profile = user.profileId ? await getProfileById(user.profileId) : null;
    const result = await saveAndMaybePublishRaid(form, user, profile);
    return redirectWithToast(`/raids/${encodeURIComponent(result.raid.id)}/edit`, {
      tone: "success",
      title: result.published ? "Discord-оголошення оновлено" : "Рейд збережено",
      message: result.published || "Зміни збережено без публікації.",
      ttl: result.published ? 7600 : 5600,
    });
  } catch (error) {
    return redirectWithToast("/raids", {
      tone: "error",
      title: "Дію з рейдом не виконано",
      message: safeErrorMessage(error),
      ttl: 8600,
    });
  }
}
