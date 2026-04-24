import { NextResponse } from "next/server";
import { createSessionCookie, isAllowedAdmin, verifyOAuthState } from "@/src/lib/auth";
import { exchangeDiscordCode } from "@/src/lib/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  if (!code || !(await verifyOAuthState("discord", state))) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", request.url));
  }

  try {
    const user = await exchangeDiscordCode(request.url, code);
    if (!isAllowedAdmin(user)) {
      return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
    }
    await createSessionCookie(user);
    return NextResponse.redirect(new URL("/", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=discord", request.url));
  }
}
