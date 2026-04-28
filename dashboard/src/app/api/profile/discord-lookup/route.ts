import { NextRequest, NextResponse } from "next/server";
import { getProfileByDiscordUserId, getMainCharacter } from "@/lib/profiles";
import { logDashboardEvent, noStoreHeaders } from "@/lib/security";

function authorized(request: NextRequest) {
  const expected = String(process.env.INTERNAL_PROFILE_LOOKUP_TOKEN || "").trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStoreHeaders() });
  }

  const url = new URL(request.url);
  const discordId = String(url.searchParams.get("discord_id") || "").trim();
  const profile = await getProfileByDiscordUserId(discordId);

  logDashboardEvent("info", "profile.discord_lookup", request, { found: Boolean(profile), discordId: discordId ? `[discord:${discordId.slice(-6)}]` : null });

  if (!profile) {
    return NextResponse.json({ found: false }, { status: 404, headers: noStoreHeaders() });
  }

  const mainCharacter = getMainCharacter(profile);
  return NextResponse.json({
    found: true,
    profileId: profile.profileId,
    displayName: profile.displayName,
    mainCharacter,
    characters: profile.characters,
  }, { headers: noStoreHeaders() });
}
