import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCanModerate } from "@/lib/access";
import { updateIssueStatusDirect, ApplicationStatus } from "@/lib/github";
import { notifyDiscordStatusChange } from "@/lib/discord";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ number: string }> | { number: string } }
) {
  const session = await getSession();
  assertCanModerate(session);

  const params = await context.params;
  const issueNumber = Number(params.number);
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "") as ApplicationStatus;

  if (status !== "accepted" && status !== "declined") {
    return NextResponse.json({ error: "Unsupported status" }, { status: 400 });
  }

  const moderator = `${session.name} (${session.role})`;

  const result = await updateIssueStatusDirect({
    issueNumber,
    status,
    moderator,
  });

  const discord = await notifyDiscordStatusChange({
    issueNumber,
    status,
    moderator,
  });

  return NextResponse.json({ ...result, discord });
}
