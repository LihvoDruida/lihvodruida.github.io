import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/accessGroups";
import { canManageDiscordMembers } from "@/lib/permissions";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, unauthorizedResponse, verifyTrustedOrigin } from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

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

type AdminDiscordResultInput = {
  ok: boolean;
  tone?: "success" | "info" | "warning" | "error";
  title: string;
  message?: string;
  status?: number;
  data?: Record<string, unknown>;
  ttl?: number;
};

function adminDiscordPayload(input: AdminDiscordResultInput) {
  return {
    ok: input.ok,
    ...(input.data || {}),
    toast: {
      tone: input.tone || (input.ok ? "success" : "error"),
      title: input.title,
      message: input.message,
      ttl: input.ttl || (input.ok ? 5200 : 8200),
    },
  };
}

function wantsJsonResponse(request: NextRequest) {
  // Admin forms should never dump raw JSON into the browser on normal navigation.
  // JSON is returned only for DashboardFormEnhancer live-submit requests.
  return String(request.headers.get("x-dashboard-action") || "").toLowerCase() === "live";
}

function safeAdminRedirectUrl(request: NextRequest) {
  const fallback = new URL("/admin/discord", request.url);
  const ref = request.headers.get("referer");
  if (!ref) return fallback;

  try {
    const url = new URL(ref);
    const current = new URL(request.url);
    if (url.origin !== current.origin) return fallback;
    if (!url.pathname.startsWith("/admin")) return fallback;
    return url;
  } catch {
    return fallback;
  }
}

export function adminDiscordJson(input: AdminDiscordResultInput) {
  return NextResponse.json(adminDiscordPayload(input), { status: input.status || (input.ok ? 200 : 400), headers: noStoreHeaders() });
}

export function adminDiscordResponse(request: NextRequest, input: AdminDiscordResultInput) {
  if (wantsJsonResponse(request)) return adminDiscordJson(input);

  const payload = adminDiscordPayload(input);
  const response = NextResponse.redirect(safeAdminRedirectUrl(request), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.append("Set-Cookie", dashboardToastCookie({
    tone: payload.toast.tone,
    title: payload.toast.title,
    message: payload.toast.message,
    ttl: payload.toast.ttl,
  }));
  return response;
}

export async function auditDiscordAdmin(action: string, session: NonNullable<Awaited<ReturnType<typeof getSession>>>, details: Record<string, unknown>) {
  await recordAdminAudit(action, session, details).catch(() => null);
}

export function discordAdminError(request: NextRequest, event: string, error: unknown, fallback: string, session?: NonNullable<Awaited<ReturnType<typeof getSession>>> | null, details: Record<string, unknown> = {}) {
  const message = safeErrorMessage(error, fallback);
  logDashboardEvent("warn", event, request, { message, ...details });
  if (session) {
    void recordAdminAudit(event, session, {
      ...details,
      status: "error",
      message,
      error: error instanceof Error ? error.message : String(error || ""),
    }).catch(() => null);
  }
  return adminDiscordResponse(request, { ok: false, tone: "error", title: "Дію не виконано", message, status: 400, data: { error: message } });
}
