import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCanModerate } from "@/lib/access";
import { moderateApplication } from "@/lib/moderation";
import { ApplicationStatus } from "@/lib/github";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ number: string }> }
) {
  const session = await getSession();
  assertCanModerate(session);

  const { number } = await context.params;
  const issueNumber = Number(number);
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "") as ApplicationStatus;

  if (status !== "accepted" && status !== "declined") {
    return NextResponse.json({ error: "Unsupported status" }, { status: 400 });
  }

  const moderator = `${session.name} (${session.role})`;

  const result = await moderateApplication({
    issueNumber,
    status,
    moderator,
    source: "dashboard",
  });

  return NextResponse.json(result);
}
