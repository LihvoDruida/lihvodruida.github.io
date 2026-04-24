import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildDiscordOAuthUrl, randomState } from "@/lib/oauth";

export async function GET() {
  const state = randomState();
  const store = await cookies();
  store.set("mistblossom_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(buildDiscordOAuthUrl(state));
}
