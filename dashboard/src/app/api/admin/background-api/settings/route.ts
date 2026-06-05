import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/accessGroups";
import {
  dashboardApiSettingsSummary,
  setDashboardApiSettings,
} from "@/lib/dashboardApiSettings";
import { canManageGroups } from "@/lib/permissions";
import {
  assertRequestBodySize,
  checkRateLimit,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
  verifyTrustedOrigin,
} from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ResponseInput = {
  ok: boolean;
  tone?: "success" | "info" | "warning" | "error";
  title: string;
  message?: string;
  status?: number;
  data?: Record<string, unknown>;
};

function wantsJsonResponse(request: NextRequest) {
  const dashboardAction = String(
    request.headers.get("x-dashboard-action") || "",
  ).toLowerCase();
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  return dashboardAction === "live" || accept.includes("application/json");
}

function safeAdminRedirectUrl(request: NextRequest) {
  const fallback = new URL("/admin", request.url);
  const ref = request.headers.get("referer");
  if (!ref) return fallback;
  try {
    const url = new URL(ref);
    const current = new URL(request.url);
    if (url.origin !== current.origin) return fallback;
    if (!url.pathname.startsWith("/admin")) return fallback;
    url.hash = "background-api-settings";
    return url;
  } catch {
    return fallback;
  }
}


function formFlag(form: { getAll(name: string): unknown[] }, name: string) {
  return form.getAll(name).some((value: unknown) => String(value) === "1") ? "1" : "0";
}

function adminResponse(request: NextRequest, input: ResponseInput) {
  const payload = {
    ok: input.ok,
    ...(input.data || {}),
    toast: {
      tone: input.tone || (input.ok ? "success" : "error"),
      title: input.title,
      message: input.message,
      ttl: input.ok ? 5600 : 8600,
    },
  };

  if (wantsJsonResponse(request)) {
    return NextResponse.json(payload, {
      status: input.status || (input.ok ? 200 : 400),
      headers: noStoreHeaders(),
    });
  }

  const response = NextResponse.redirect(safeAdminRedirectUrl(request), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.append("Set-Cookie", dashboardToastCookie(payload.toast));
  return response;
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) {
    return adminResponse(request, {
      ok: false,
      tone: "error",
      title: "Дію заблоковано",
      message: "Недовірене джерело запиту.",
      status: 403,
    });
  }

  const tooLarge = assertRequestBodySize(request, 8 * 1024);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session) {
    return adminResponse(request, {
      ok: false,
      tone: "warning",
      title: "Потрібен вхід",
      message: "Сесія застаріла. Увійди в панель ще раз.",
      status: 401,
      data: { loginUrl: "/login" },
    });
  }

  if (!canManageGroups(session)) {
    return adminResponse(request, {
      ok: false,
      tone: "error",
      title: "Немає доступу",
      message:
        "Параметри фонового API може змінювати тільки адміністратор із правом керування групами.",
      status: 403,
    });
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(
    `admin-background-api-settings:${session.id}:${ip}`,
    12,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return adminResponse(request, {
      ok: false,
      tone: "warning",
      title: "Забагато дій",
      message: "Зачекай кілька хвилин і повтори зміну.",
      status: 429,
    });
  }

  try {
    const form = await request.formData();
    const settings = await setDashboardApiSettings(
      {
        backgroundRefreshMinSeconds: form.get("backgroundRefreshMinSeconds"),
        profileViewRefreshMinSeconds: form.get("profileViewRefreshMinSeconds"),
        profileExternalRefreshMinSeconds: form.get(
          "profileExternalRefreshMinSeconds",
        ),
        profileExternalRefreshBatchLimit: form.get(
          "profileExternalRefreshBatchLimit",
        ),
        profileCharacterRefreshConcurrency: form.get(
          "profileCharacterRefreshConcurrency",
        ),
        profileCharacterRefreshMaxConcurrency: form.get(
          "profileCharacterRefreshMaxConcurrency",
        ),
        profileExternalRefreshConcurrency: form.get(
          "profileExternalRefreshConcurrency",
        ),
        profileExternalRefreshMaxConcurrency: form.get(
          "profileExternalRefreshMaxConcurrency",
        ),
        dashboardApiDebugAuditLogs: formFlag(form, "dashboardApiDebugAuditLogs"),
        dashboardApiWarningAuditLogs: formFlag(form, "dashboardApiWarningAuditLogs"),
        guildRosterRegion: form.get("guildRosterRegion"),
        guildRosterRealm: form.get("guildRosterRealm"),
        guildRosterName: form.get("guildRosterName"),
        guildRosterCacheTtlSeconds: form.get("guildRosterCacheTtlSeconds"),
        guildRosterCacheReadTtlMs: form.get("guildRosterCacheReadTtlMs"),
        guildRosterCacheWriteBatchSize: form.get("guildRosterCacheWriteBatchSize"),
        guildRosterCacheDeleteStaleMembers: formFlag(form, "guildRosterCacheDeleteStaleMembers"),
        guildRosterRefreshConcurrency: form.get("guildRosterRefreshConcurrency"),
        guildRosterRefreshMaxConcurrency: form.get("guildRosterRefreshMaxConcurrency"),
        raiderIoRequestTimeoutMs: form.get("raiderIoRequestTimeoutMs"),
        raiderIoRequestRetries: form.get("raiderIoRequestRetries"),
        raiderIoRateLimitCooldownSeconds: form.get("raiderIoRateLimitCooldownSeconds"),
        raiderIoRequestMinDelayMs: form.get("raiderIoRequestMinDelayMs"),
        battleNetRequestTimeoutMs: form.get("battleNetRequestTimeoutMs"),
        battleNetRequestRetries: form.get("battleNetRequestRetries"),
        profileReadCacheTtlMs: form.get("profileReadCacheTtlMs"),
        profileListCacheTtlMs: form.get("profileListCacheTtlMs"),
        profileCharacterLinksCacheTtlMs: form.get("profileCharacterLinksCacheTtlMs"),
        raidListCacheTtlMs: form.get("raidListCacheTtlMs"),
        raidItemCacheTtlMs: form.get("raidItemCacheTtlMs"),
        raidDiscordDeleteAfterStartHours: form.get("raidDiscordDeleteAfterStartHours"),
        guildRosterRecordsChunkSize: form.get("guildRosterRecordsChunkSize"),
        guildRosterReadLegacyMemberDocs: formFlag(form, "guildRosterReadLegacyMemberDocs"),
        guildRosterWriteLegacyMemberDocs: formFlag(form, "guildRosterWriteLegacyMemberDocs"),
        auditLogReadCacheTtlMs: form.get("auditLogReadCacheTtlMs"),
        auditLogDedupeWindowMs: form.get("auditLogDedupeWindowMs"),
        auditLogMaxStored: form.get("auditLogMaxStored"),
        raiderIoCharacterCacheTtlMs: form.get("raiderIoCharacterCacheTtlMs"),
        guildRosterMemberLimit: form.get("guildRosterMemberLimit"),
        guildRosterRefreshStepBudgetMs: form.get(
          "guildRosterRefreshStepBudgetMs",
        ),
        guildRosterSyncJobTtlSeconds: form.get("guildRosterSyncJobTtlSeconds"),
        guildRosterShardedCacheEnabled: formFlag(form, "guildRosterShardedCacheEnabled"),
        guildRosterShardedCacheThreshold: form.get(
          "guildRosterShardedCacheThreshold",
        ),
        guildRosterBattleNetStepSize: form.get("guildRosterBattleNetStepSize"),
        guildRosterBattleNetTtlSeconds: form.get(
          "guildRosterBattleNetTtlSeconds",
        ),
        guildRosterRaiderIoStepSize: form.get("guildRosterRaiderIoStepSize"),
        guildRosterRaiderIoTtlSeconds: form.get(
          "guildRosterRaiderIoTtlSeconds",
        ),
        guildRosterClientDrivenSyncEnabled: formFlag(form, "guildRosterClientDrivenSyncEnabled"),
        guildRosterClientStepDelayMs: form.get("guildRosterClientStepDelayMs"),
        guildRosterClientRequestTimeoutMs: form.get(
          "guildRosterClientRequestTimeoutMs",
        ),
        guildRosterClientMaxSteps: form.get("guildRosterClientMaxSteps"),
      },
      session,
    );
    const summary = dashboardApiSettingsSummary(settings);

    await recordAdminAudit("admin.background_api.settings.update", session, {
      status: "success",
      summary,
      settings,
    }).catch((error) => {
      logDashboardEvent(
        "warn",
        "admin.background_api.settings_audit_failed",
        request,
        {
          message:
            error instanceof Error ? error.message : String(error || "unknown"),
        },
      );
    });

    return adminResponse(request, {
      ok: true,
      title: "Налаштування фонового API збережено",
      message: summary,
      data: { settings, refresh: true },
    });
  } catch (error) {
    const message = safeErrorMessage(
      error,
      "Не вдалося зберегти налаштування фонового API.",
    );
    logDashboardEvent("warn", "admin.background_api.settings_failed", request, {
      message,
    });
    await recordAdminAudit(
      "admin.background_api.settings.update_failed",
      session,
      {
        status: "error",
        summary: message,
        error: error instanceof Error ? error.message : String(error || ""),
      },
    ).catch(() => false);
    return adminResponse(request, {
      ok: false,
      title: "Дію не виконано",
      message,
      status: 400,
    });
  }
}
