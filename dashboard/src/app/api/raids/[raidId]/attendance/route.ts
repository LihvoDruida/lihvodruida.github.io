import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { handleRaidSessionAction, type RaidSignupStatus } from "@/lib/raids";
import { noStoreHeaders, safeErrorMessage } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToRaid(raidId: string, params: Record<string, string | undefined>) {
  const base = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.ADMIN_DASHBOARD_URL || "http://localhost:3000";
  const url = new URL("/raids", base);
  url.searchParams.set("raid", raidId);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { headers: noStoreHeaders() });
}

function cleanAction(value: unknown): RaidSignupStatus {
  return value === "late" ? "late" : value === "skipped" || value === "skip" ? "skipped" : "going";
}

export async function POST(request: NextRequest, context: { params: Promise<{ raidId: string }> }) {
  const { raidId } = await context.params;
  const user = await getSession();

  if (!user) {
    const base = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.ADMIN_DASHBOARD_URL || "http://localhost:3000";
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("next", `/raids?raid=${encodeURIComponent(raidId)}`);
    return NextResponse.redirect(loginUrl, { headers: noStoreHeaders() });
  }

  try {
    const form = await request.formData();
    const action = cleanAction(form.get("action"));
    const result = await handleRaidSessionAction({ raidId, action, user });

    if (!result.ok) {
      return redirectToRaid(raidId, { error: result.content || "Дію не виконано." });
    }

    return redirectToRaid(raidId, { attendance: action });
  } catch (error) {
    return redirectToRaid(raidId, { error: safeErrorMessage(error) });
  }
}
