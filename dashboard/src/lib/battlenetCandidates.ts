import { createHmac, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";
import type { BattleNetCharacterCandidate, BattleNetRegion } from "@/lib/battlenet";

export const BNET_CANDIDATES_COOKIE = "__Host-mistblossom_bnet_candidates";
const MAX_COOKIE_AGE_SECONDS = 10 * 60;
const MAX_COOKIE_BYTES = 3600;

type CandidateCookiePayload = {
  v: 1;
  profileId: string;
  region: BattleNetRegion | string;
  expiresAt: number;
  characters: BattleNetCharacterCandidate[];
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getCandidateSecret() {
  return process.env.PROFILE_ID_SECRET || process.env.BATTLENET_CANDIDATE_SECRET || process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function signPayload(payload: string) {
  const secret = getCandidateSecret();
  if (!secret || secret.length < 16) {
    throw new Error("PROFILE_ID_SECRET або BATTLENET_CANDIDATE_SECRET не налаштований для Battle.net candidate cookie.");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function verifySignature(payload: string, signature: string) {
  try {
    const expected = signPayload(payload);
    const left = Buffer.from(signature, "base64url");
    const right = Buffer.from(expected, "base64url");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function compactCandidate(character: BattleNetCharacterCandidate): BattleNetCharacterCandidate {
  return {
    key: character.key,
    source: "battlenet",
    region: character.region,
    name: character.name,
    normalizedName: character.normalizedName,
    realmSlug: character.realmSlug,
    realmName: character.realmName,
    level: character.level,
    faction: character.faction,
    className: character.className,
    raceName: character.raceName,
    genderName: character.genderName,
    guildName: character.guildName,
    guildRealmSlug: character.guildRealmSlug,
    profileUrl: character.profileUrl,
    avatarUrl: character.avatarUrl,
    renderUrl: character.renderUrl,
    mediaUrl: character.mediaUrl,
    verifiedGuild: character.verifiedGuild,
    lastSeenAt: character.lastSeenAt,
  };
}

function buildCookieValue(payload: CandidateCookiePayload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

export function createBattleNetCandidatesCookieValue(input: {
  profileId: string;
  region: BattleNetRegion | string;
  characters: BattleNetCharacterCandidate[];
}) {
  const expiresAt = Date.now() + MAX_COOKIE_AGE_SECONDS * 1000;
  const unique = new Map<string, BattleNetCharacterCandidate>();
  for (const character of input.characters || []) {
    if (character?.key && character.verifiedGuild) unique.set(character.key, compactCandidate(character));
  }

  const characters = Array.from(unique.values());
  let payload: CandidateCookiePayload = {
    v: 1,
    profileId: input.profileId,
    region: input.region,
    expiresAt,
    characters,
  };

  while (payload.characters.length > 0 && Buffer.byteLength(buildCookieValue(payload), "utf8") > MAX_COOKIE_BYTES) {
    payload = { ...payload, characters: payload.characters.slice(0, -1) };
  }

  return payload.characters.length ? buildCookieValue(payload) : "";
}

export function parseBattleNetCandidatesCookieValue(value: string | undefined | null, profileId: string) {
  const text = String(value || "").trim();
  if (!text || !profileId) return null;

  const [payload, signature] = text.split(".");
  if (!payload || !signature || !verifySignature(payload, signature)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as CandidateCookiePayload;
    if (parsed.v !== 1 || parsed.profileId !== profileId || Date.now() > Number(parsed.expiresAt || 0)) return null;
    const characters = Array.isArray(parsed.characters) ? parsed.characters.filter((item) => item?.key && item.verifiedGuild).slice(0, 50) : [];
    return { ...parsed, characters };
  } catch {
    return null;
  }
}

export function battleNetCandidatesCookieOptions(maxAge = MAX_COOKIE_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setBattleNetCandidatesCookie(response: NextResponse, profileId: string, region: BattleNetRegion | string, characters: BattleNetCharacterCandidate[]) {
  const value = createBattleNetCandidatesCookieValue({ profileId, region, characters });
  if (!value) {
    response.cookies.set(BNET_CANDIDATES_COOKIE, "", battleNetCandidatesCookieOptions(0));
    return;
  }
  response.cookies.set(BNET_CANDIDATES_COOKIE, value, battleNetCandidatesCookieOptions());
}

export function clearBattleNetCandidatesCookie(response: NextResponse) {
  response.cookies.set(BNET_CANDIDATES_COOKIE, "", battleNetCandidatesCookieOptions(0));
}

export function findCandidateByKey(cookieValue: string | undefined | null, profileId: string, characterKey: string) {
  const session = parseBattleNetCandidatesCookieValue(cookieValue, profileId);
  return session?.characters.find((item) => item.key === characterKey) || null;
}

export function removeCandidateFromCookie(response: NextResponse, cookieValue: string | undefined | null, profileId: string, characterKey: string) {
  const session = parseBattleNetCandidatesCookieValue(cookieValue, profileId);
  if (!session) {
    clearBattleNetCandidatesCookie(response);
    return;
  }

  const remaining = session.characters.filter((item) => item.key !== characterKey);
  if (!remaining.length) {
    clearBattleNetCandidatesCookie(response);
    return;
  }

  setBattleNetCandidatesCookie(response, profileId, session.region, remaining);
}
