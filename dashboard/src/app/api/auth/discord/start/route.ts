import { NextResponse } from "next/server";
import { createOAuthStateCookie } from "@/lib/auth";
import { discordAuthorizeUrl } from "@/lib/oauth";

export async function GET(request: Request) {
  const state = await createOAuthStateCookie("discord");
  return NextResponse.redirect(discordAuthorizeUrl(request.url, state));
}
