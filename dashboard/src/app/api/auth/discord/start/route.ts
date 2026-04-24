import { NextResponse } from "next/server";
import { createOAuthStateCookie } from "@/src/lib/auth";
import { discordAuthorizeUrl } from "@/src/lib/oauth";

export async function GET(request: Request) {
  const state = await createOAuthStateCookie("discord");
  return NextResponse.redirect(discordAuthorizeUrl(request.url, state));
}
