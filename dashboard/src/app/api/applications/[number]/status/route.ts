import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ApplicationStatus } from "@/lib/github";
import { moderateApplication } from "@/lib/moderation";
import {
  assertRequestBodySize,
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
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

  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "moderator")) {
    return unauthorizedResponse();
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`moderation:${session.id}:${ip}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Забагато змін статусу. Зачекай хвилину." },
      { status: 429, headers: noStoreHeaders({ "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) }) }
    );
  }

  const { number } = await context.params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "Невірний номер заявки." }, { status: 400, headers: noStoreHeaders() });
  }

  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "") as ApplicationStatus;

  if (status !== "accepted" && status !== "declined") {
    return NextResponse.json({ error: "Unsupported status" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const result = await moderateApplication({
      issueNumber,
      status,
      moderator: `${session.name} (${session.role})`,
      source: "dashboard",
    });

    return NextResponse.json(result, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Не вдалося змінити статус заявки.") },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
