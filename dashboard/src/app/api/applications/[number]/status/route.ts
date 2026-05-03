import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveAuthorIdentity } from "@/lib/authorIdentity";
import { ApplicationStatus } from "@/lib/github";
import { moderateApplication } from "@/lib/moderation";
import { canManageApplications, hierarchyTitle } from "@/lib/permissions";
import {
  assertRequestBodySize,
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
  unauthorizedResponse,
  verifyTrustedOrigin,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ number: string }> }
) {
  if (!verifyTrustedOrigin(request)) {
    return forbiddenResponse("Недовірене джерело зміни статусу.");
  }

  logDashboardEvent("info", "applications.status.attempt", request);

  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session || !canManageApplications(session)) {
    logDashboardEvent("warn", "applications.status.unauthorized", request);
    return unauthorizedResponse();
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`moderation:${session.id}:${ip}`, 30, 60 * 1000);
  if (!limit.ok) {
    logDashboardEvent("warn", "applications.status.rate_limited", request, { userId: session.id, resetAt: limit.resetAt });
    return NextResponse.json(
      { error: "Забагато змін статусу. Зачекай хвилину." },
      { status: 429, headers: noStoreHeaders({ "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) }) }
    );
  }

  const { number } = await context.params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    logDashboardEvent("warn", "applications.status.invalid_issue", request, { issueNumber: number });
    return NextResponse.json({ error: "Невірний номер заявки." }, { status: 400, headers: noStoreHeaders() });
  }

  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "") as ApplicationStatus;

  if (status !== "accepted" && status !== "declined") {
    logDashboardEvent("warn", "applications.status.unsupported_status", request, { issueNumber, status });
    return NextResponse.json({ error: "Невідомий статус заявки" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const moderatorName = (await resolveAuthorIdentity(session)).primaryName;
    const result = await moderateApplication({
      issueNumber,
      status,
      moderator: `${moderatorName} (${hierarchyTitle(session.role)})`,
      source: "dashboard",
    });

    logDashboardEvent("info", "applications.status.success", request, { issueNumber, status, userId: session.id });
    return NextResponse.json(result, { headers: noStoreHeaders() });
  } catch (error) {
    logDashboardEvent("error", "applications.status.failed", request, { issueNumber, status, message: safeErrorMessage(error) });
    return NextResponse.json(
      { error: safeErrorMessage(error, "Не вдалося змінити статус заявки.") },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
