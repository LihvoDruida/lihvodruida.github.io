import { NextResponse } from "next/server";
import { createOAuthStateCookie } from "@/src/lib/auth";
import { githubAuthorizeUrl } from "@/src/lib/oauth";

export async function GET(request: Request) {
  const state = await createOAuthStateCookie("github");
  return NextResponse.redirect(githubAuthorizeUrl(request.url, state));
}
