import { NextRequest, NextResponse } from "next/server";
import { getProfileByDiscordUserId, getMainCharacter } from "@/lib/profiles";
import { hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { logDashboardEvent, noStoreHeaders } from "@/lib/security";

function authorized(request: NextRequest) {
  const expected = String(process.env.INTERNAL_PROFILE_LOOKUP_TOKEN || "").trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ found: false, error: "Forbidden", reason: "forbidden" }, { status: 403, headers: noStoreHeaders() });
  }

  if (!hasFirebaseProfileConfig()) {
    return NextResponse.json({ found: false, error: "Firebase profile storage is not configured.", reason: "firebase-not-configured" }, { status: 503, headers: noStoreHeaders() });
  }

  const url = new URL(request.url);
  const discordId = String(url.searchParams.get("discord_id") || "").trim();
  if (!/^\d{16,25}$/.test(discordId)) {
    return NextResponse.json({ found: false, error: "Invalid Discord user id.", reason: "invalid-discord-id" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const profile = await getProfileByDiscordUserId(discordId);

    logDashboardEvent("info", "profile.discord_lookup", request, { found: Boolean(profile), discordId: discordId ? `[discord:${discordId.slice(-6)}]` : null });

    if (!profile) {
      return NextResponse.json({ found: false, reason: "profile-not-found" }, { status: 404, headers: noStoreHeaders() });
    }

    const mainCharacter = getMainCharacter(profile);
    return NextResponse.json({
      found: true,
      profileId: profile.profileId,
      displayName: profile.displayName,
      mainCharacter,
      hasMainCharacter: Boolean(mainCharacter?.name && (mainCharacter.realmName || mainCharacter.realmSlug)),
      characters: profile.characters,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDashboardEvent("error", "profile.discord_lookup.failed", request, { discordId: `[discord:${discordId.slice(-6)}]`, message });
    return NextResponse.json({ found: false, error: message, reason: "lookup-exception" }, { status: 500, headers: noStoreHeaders() });
  }
}
