import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { getDashboardUrl } from "@/lib/oauth";
import { forbiddenResponse, noStoreHeaders, verifyTrustedOrigin } from "@/lib/security";

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) {
    return forbiddenResponse("Недовірене джерело виходу.");
  }

  await clearSession();
  const response = NextResponse.redirect(`${getDashboardUrl()}/login`, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function GET() {
  return NextResponse.json(
    { error: "Logout працює тільки через POST." },
    { status: 405, headers: noStoreHeaders({ Allow: "POST" }) }
  );
}
