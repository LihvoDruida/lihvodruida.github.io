import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/auth";
import { assertCanModerate } from "@/src/lib/access";
import { updateIssueStatusDirect, ApplicationStatus } from "@/src/lib/github";
import { notifyDiscordStatusChange } from "@/src/lib/discord";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ number: string }> | { number: string } }
) {
  const session = await getSessionUser();

  try {
    assertCanModerate(session);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = await context.params;
  const issueNumber = Number(params.number);
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "") as ApplicationStatus;

  if (status !== "accepted" && status !== "declined") {
    return NextResponse.json({ error: "Unsupported status" }, { status: 400 });
  }

  const moderator = `${session?.name || session?.login || "Dashboard moderator"} (${session?.role || "moderator"})`;

  const result = await updateIssueStatusDirect({ issueNumber, status, moderator });
  const discord = await notifyDiscordStatusChange({ issueNumber, status, moderator });

  return NextResponse.json({ ...result, discord });
}
