import { NextRequest, NextResponse } from "next/server";
import { setSession, verifyToken } from "@/lib/auth";
import {
  assertRequestBodySize,
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
  noStoreHeaders,
  verifyTrustedOrigin,
} from "@/lib/security";

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) {
    return forbiddenResponse("Недовірене джерело входу.");
  }

  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const ip = getClientIp(request);
  const limit = checkRateLimit(`token-login:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return redirectTo(request, "/login?error=rate_limit");
  }

  const form = await request.formData();
  const token = String(form.get("token") || "");
  const session = await verifyToken(token);

  if (!session) {
    return redirectTo(request, "/login?error=token");
  }

  await setSession(session);
  return redirectTo(request, "/");
}
