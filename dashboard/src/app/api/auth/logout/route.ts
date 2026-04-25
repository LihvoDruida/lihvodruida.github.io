import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { getDashboardUrl } from "@/lib/oauth";
import { forbiddenResponse, logDashboardEvent, noStoreHeaders, verifyTrustedOrigin } from "@/lib/security";

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) {
    return forbiddenResponse("Недовірене джерело виходу.");
  }

  logDashboardEvent("info", "auth.logout.post", request);
  await clearSession();
  const response = NextResponse.redirect(`${getDashboardUrl()}/login`, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function GET(request: NextRequest) {
  // UX fallback: if an old build or browser extension opens /api/auth/logout as a page,
  // still finish logout and return the user to the login screen instead of showing JSON.
  logDashboardEvent("warn", "auth.logout.get_fallback", request);
  await clearSession();
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}
