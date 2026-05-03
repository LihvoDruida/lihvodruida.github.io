import { NextRequest, NextResponse } from "next/server";
import { getProfileByDiscordUserId, getMainCharacter, getProfilePublicName } from "@/lib/profiles";
import { hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { logDashboardEvent, noStoreHeaders, safeErrorMessage } from "@/lib/security";

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

async function authorized(request: NextRequest) {
  const expected = String(process.env.INTERNAL_PROFILE_LOOKUP_TOKEN || "").trim();
  if (!expected || expected.length < 24) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!provided) return false;
  const [left, right] = await Promise.all([sha256Hex(provided), sha256Hex(expected)]);
  return constantTimeEqual(left, right);
}

export async function GET(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ found: false, error: "Forbidden", reason: "forbidden" }, { status: 403, headers: noStoreHeaders() });
  }

  if (!hasFirebaseProfileConfig()) {
    return NextResponse.json({ found: false, error: "Збереження профілів тимчасово недоступне.", reason: "profile-storage-unavailable" }, { status: 503, headers: noStoreHeaders() });
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
      displayName: getProfilePublicName(profile),
      discordName: profile.displayName,
      mainCharacter,
      hasMainCharacter: Boolean(mainCharacter?.name && (mainCharacter.realmName || mainCharacter.realmSlug)),
      characterCount: Array.isArray(profile.characters) ? profile.characters.length : 0,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = safeErrorMessage(error, "Profile lookup failed.");
    logDashboardEvent("error", "profile.discord_lookup.failed", request, { discordId: `[discord:${discordId.slice(-6)}]`, message });
    return NextResponse.json({ found: false, error: message, reason: "lookup-exception" }, { status: 500, headers: noStoreHeaders() });
  }
}
