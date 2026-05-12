import type { NextResponse } from "next/server";

export const BNET_CANDIDATES_COOKIE = "__Host-mistblossom_bnet_candidates";

export function battleNetCandidatesCookieOptions(maxAge = 0) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function clearBattleNetCandidatesCookie(response: NextResponse) {
  response.cookies.set(BNET_CANDIDATES_COOKIE, "", battleNetCandidatesCookieOptions(0));
}
