import { NextRequest, NextResponse } from "next/server";
import { getSession, assertCanModerate } from "@/lib/auth";
import { ApplicationStatus } from "@/lib/github";
import { moderateApplication } from "@/lib/moderation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const result = await moderateApplication({
    issueNumber,
    status,
    moderator: `${session.name} (${session.role})`,
    source: "dashboard",
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
