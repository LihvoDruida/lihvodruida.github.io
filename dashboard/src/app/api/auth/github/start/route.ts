import { NextResponse } from "next/server";
import { createOAuthStateCookie } from "@/lib/auth";
import { githubAuthorizeUrl } from "@/lib/oauth";

export async function GET(request: Request) {
  const state = await createOAuthStateCookie("github");
  return NextResponse.redirect(githubAuthorizeUrl(request.url, state));
}
