import { NextResponse } from "next/server";
import { getSessionUser, isAuthenticated } from "@/src/lib/auth";
import { updateApplicationStatus } from "@/src/lib/github";
import { normalizeStatus } from "@/src/lib/status";

const rateMap = new Map<string, number>();

function rateLimited(key: string) {
  const now = Date.now();
  const last = rateMap.get(key) || 0;
  if (now - last < 1200) return true;
  rateMap.set(key, now);
  if (rateMap.size > 1000) {
    for (const [k, value] of rateMap) if (now - value > 60_000) rateMap.delete(k);
  }
  return false;
}

export async function POST(request: Request, context: { params: Promise<{ number: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await context.params;
  const issueNumber = Number(params.number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
  }
  if (rateLimited(String(issueNumber))) {
    return NextResponse.json({ error: "Too many actions. Try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const status = normalizeStatus(body.status);
  if (status === "review") {
    return NextResponse.json({ error: "Only accepted/declined can close applications from dashboard." }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    await updateApplicationStatus(issueNumber, status, user?.name || user?.login || "Dashboard");
    return NextResponse.json({ ok: true, issue_number: issueNumber, status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
