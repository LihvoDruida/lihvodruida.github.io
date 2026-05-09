import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/accessGroups";
import { canManageDiscordMembers } from "@/lib/permissions";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, unauthorizedResponse, verifyTrustedOrigin } from "@/lib/security";

export async function requireDiscordAdmin(request: NextRequest, action: string, bodyLimit = 16 * 1024) {
  if (!verifyTrustedOrigin(request)) return { error: forbiddenResponse() };
  const tooLarge = assertRequestBodySize(request, bodyLimit);
  if (tooLarge) return { error: tooLarge };

  const session = await getSession();
  if (!session) return { error: unauthorizedResponse("Потрібен вхід у панель.") };
  if (!canManageDiscordMembers(session)) return { error: forbiddenResponse("Немає права керувати Discord-учасниками.") };

  const ip = getClientIp(request);
  const limit = checkRateLimit(`admin-discord:${action}:${session.id}:${ip}`, action.includes("cleanup") ? 8 : 30, 10 * 60 * 1000);
  if (!limit.ok) return { error: rateLimitResponse(limit.resetAt) };

  return { session };
}

export function adminDiscordJson(input: { ok: boolean; tone?: "success" | "info" | "warning" | "error"; title: string; message?: string; status?: number; data?: Record<string, unknown> }) {
  return NextResponse.json({
    ok: input.ok,
    ...(input.data || {}),
    toast: {
      tone: input.tone || (input.ok ? "success" : "error"),
      title: input.title,
      message: input.message,
      ttl: input.ok ? 5200 : 8200,
    },
  }, { status: input.status || (input.ok ? 200 : 400), headers: noStoreHeaders() });
}

export async function auditDiscordAdmin(action: string, session: NonNullable<Awaited<ReturnType<typeof getSession>>>, details: Record<string, unknown>) {
  await recordAdminAudit(action, session, details).catch(() => null);
}

export function discordAdminError(request: NextRequest, event: string, error: unknown, fallback: string) {
  const message = safeErrorMessage(error, fallback);
  logDashboardEvent("warn", event, request, { message });
  return adminDiscordJson({ ok: false, tone: "error", title: "Дію не виконано", message, status: 400 });
}
