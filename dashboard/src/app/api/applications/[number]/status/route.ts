import { NextRequest, NextResponse } from "next/server";
import { getSession, assertCanModerate } from "@/lib/auth";
import { ApplicationStatus, updateApplicationStatus } from "@/lib/github";

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

  const result = await updateApplicationStatus(
    issueNumber,
    status,
    `${session.name} (${session.role})`
  );

  return NextResponse.json(result);
}
