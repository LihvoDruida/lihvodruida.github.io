import { createHmac, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";
import type { BattleNetCharacterCandidate, BattleNetRegion } from "@/lib/battlenet";
import { buildBattleNetCharacterKey, normalizeBattleNetNameSlug, normalizeCharacterKey } from "@/lib/wowCharacters";

export const BNET_CANDIDATES_COOKIE = "__Host-mistblossom_bnet_candidates";
const MAX_COOKIE_AGE_SECONDS = 10 * 60;
const MAX_COOKIE_BYTES = 3900;

type CandidateCookiePayloadV1 = {
  v: 1;
  profileId: string;
  region: BattleNetRegion | string;
  expiresAt: number;
  characters: BattleNetCharacterCandidate[];
};

type CandidateCookieTuple = [
  key: string,
  name: string,
  normalizedName: string,
  realmSlug: string,
  realmName: string,
  level: number | null,
  faction: string | null,
  className: string | null,
  raceName: string | null,
  genderName: string | null,
  guildName: string | null,
  guildRealmSlug: string | null,
  guildRank: number | null,
  guildStatus: string | null,
  guildStatusLabel: string | null,
  avatarUrl: string | null,
  renderUrl: string | null,
  lastSeenAt: string | null,
  itemLevel?: number | null,
  activeSpecName?: string | null,
  activeSpecId?: number | null,
  activeSpecRole?: string | null,
  verifiedGuild?: boolean | null
];

type CandidateCookiePayloadV2 = {
  v: 2;
  p: string;
  r: BattleNetRegion | string;
  e: number;
  c: CandidateCookieTuple[];
};

type CandidateCookiePayload = CandidateCookiePayloadV1 | CandidateCookiePayloadV2;

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

function compactCandidate(character: BattleNetCharacterCandidate): BattleNetCharacterCandidate | null {
  const key = normalizeCharacterKey(character.key) || buildBattleNetCharacterKey(character.region, character.realmSlug, character.normalizedName || character.name);
  if (!key) return null;
  return {
    key,
    source: "battlenet" as const,
    region: character.region,
    name: character.name,
    normalizedName: normalizeBattleNetNameSlug(character.normalizedName || character.name),
    realmSlug: character.realmSlug,
    realmName: character.realmName,
    level: character.level,
    faction: character.faction,
    className: character.className,
    activeSpecName: character.activeSpecName || null,
    activeSpecId: Number.isFinite(Number(character.activeSpecId)) ? Number(character.activeSpecId) : null,
    activeSpecRole: character.activeSpecRole || "dps",
    raceName: character.raceName,
    genderName: character.genderName,
    guildName: character.guildName,
    guildRealmSlug: character.guildRealmSlug,
    guildRank: Number.isFinite(Number(character.guildRank)) ? Number(character.guildRank) : null,
    guildStatus: character.guildStatus || null,
    guildStatusLabel: character.guildStatusLabel || null,
    profileUrl: character.profileUrl,
    avatarUrl: character.avatarUrl,
    renderUrl: character.renderUrl,
    mediaUrl: null,
    verifiedGuild: character.verifiedGuild,
    itemLevel: Number.isFinite(Number(character.itemLevel)) ? Number(character.itemLevel) : null,
    lastSeenAt: character.lastSeenAt,
  };
}

function emptyToNull(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toCandidateTuple(character: BattleNetCharacterCandidate): CandidateCookieTuple {
  return [
    character.key,
    character.name,
    character.normalizedName,
    character.realmSlug,
    character.realmName,
    Number.isFinite(Number(character.level)) ? Number(character.level) : null,
    optionalText(character.faction),
    optionalText(character.className),
    optionalText(character.raceName),
    optionalText(character.genderName),
    optionalText(character.guildName),
    optionalText(character.guildRealmSlug),
    Number.isFinite(Number(character.guildRank)) ? Number(character.guildRank) : null,
    optionalText(character.guildStatus),
    optionalText(character.guildStatusLabel),
    optionalText(character.avatarUrl),
    optionalText(character.renderUrl),
    optionalText(character.lastSeenAt),
    Number.isFinite(Number(character.itemLevel)) ? Number(character.itemLevel) : null,
    optionalText(character.activeSpecName),
    Number.isFinite(Number(character.activeSpecId)) ? Number(character.activeSpecId) : null,
    optionalText(character.activeSpecRole),
    Boolean(character.verifiedGuild),
  ];
}

function tupleToCandidate(tuple: CandidateCookieTuple, region: BattleNetRegion | string): BattleNetCharacterCandidate | null {
  const raw = tuple as unknown[];
  const legacy = raw.length <= 20;
  const [
    key,
    name,
    normalizedName,
    realmSlug,
    realmName,
    level,
    faction,
    className,
    raceName,
    genderName,
    guildName,
    guildRealmSlug,
    maybeGuildRankOrAvatar,
    maybeGuildStatusOrRender,
    maybeGuildStatusLabelOrLastSeen,
    maybeAvatarOrItemLevel,
    maybeRenderOrActiveSpecName,
    maybeLastSeenOrActiveSpecId,
    maybeItemLevelOrActiveSpecRole,
    maybeActiveSpecNameOrVerifiedGuild,
    maybeActiveSpecId,
    maybeActiveSpecRole,
    maybeVerifiedGuild,
  ] = raw;

  const guildRank = legacy ? null : maybeGuildRankOrAvatar;
  const guildStatus = legacy ? null : maybeGuildStatusOrRender;
  const guildStatusLabel = legacy ? null : maybeGuildStatusLabelOrLastSeen;
  const avatarUrl = legacy ? maybeGuildRankOrAvatar : maybeAvatarOrItemLevel;
  const renderUrl = legacy ? maybeGuildStatusOrRender : maybeRenderOrActiveSpecName;
  const lastSeenAt = legacy ? maybeGuildStatusLabelOrLastSeen : maybeLastSeenOrActiveSpecId;
  const itemLevel = legacy ? maybeAvatarOrItemLevel : maybeItemLevelOrActiveSpecRole;
  const activeSpecName = legacy ? maybeRenderOrActiveSpecName : maybeActiveSpecNameOrVerifiedGuild;
  const activeSpecId = legacy ? maybeLastSeenOrActiveSpecId : maybeActiveSpecId;
  const activeSpecRole = legacy ? maybeItemLevelOrActiveSpecRole : maybeActiveSpecRole;
  const verifiedGuild = legacy ? maybeActiveSpecNameOrVerifiedGuild : maybeVerifiedGuild;

  const safeKey = normalizeCharacterKey(key) || buildBattleNetCharacterKey(region, realmSlug, normalizedName || name);
  if (!safeKey || !name || !realmSlug) return null;

  return {
    key: safeKey,
    source: "battlenet",
    region: String(region || "eu").toLowerCase() as BattleNetRegion,
    name: String(name),
    normalizedName: normalizeBattleNetNameSlug(normalizedName || name),
    realmSlug: String(realmSlug),
    realmName: String(realmName || realmSlug),
    level: Number.isFinite(Number(level)) ? Number(level) : null,
    faction: emptyToNull(faction),
    className: emptyToNull(className),
    activeSpecName: emptyToNull(activeSpecName),
    activeSpecId: Number.isFinite(Number(activeSpecId)) ? Number(activeSpecId) : null,
    activeSpecRole: (emptyToNull(activeSpecRole) || "dps") as any,
    raceName: emptyToNull(raceName),
    genderName: emptyToNull(genderName),
    guildName: emptyToNull(guildName),
    guildRealmSlug: emptyToNull(guildRealmSlug),
    guildRank: Number.isFinite(Number(guildRank)) ? Number(guildRank) : null,
    guildStatus: ["guild_master", "officer", "member"].includes(String(guildStatus || "")) ? guildStatus as any : null,
    guildStatusLabel: emptyToNull(guildStatusLabel),
    profileUrl: "#",
    avatarUrl: emptyToNull(avatarUrl),
    renderUrl: emptyToNull(renderUrl),
    mediaUrl: null,
    verifiedGuild: typeof verifiedGuild === "boolean" ? verifiedGuild : Boolean(guildName),
    itemLevel: Number.isFinite(Number(itemLevel)) ? Number(itemLevel) : null,
    lastSeenAt: optionalText(lastSeenAt) || new Date(0).toISOString(),
  };
}

function buildCookieValue(payload: CandidateCookiePayload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

function makePayload(profileId: string, region: BattleNetRegion | string, expiresAt: number, characters: BattleNetCharacterCandidate[]): CandidateCookiePayloadV2 {
  return {
    v: 2,
    p: profileId,
    r: region,
    e: expiresAt,
    c: characters.map(toCandidateTuple),
  };
}

function stripHeavyMedia(characters: BattleNetCharacterCandidate[], mode: "render" | "all") {
  return characters.map((character) => ({
    ...character,
    renderUrl: mode === "render" || mode === "all" ? null : character.renderUrl,
    avatarUrl: mode === "all" ? null : character.avatarUrl,
    mediaUrl: null,
    profileUrl: "#",
  }));
}

export function createBattleNetCandidatesCookieValue(input: {
  profileId: string;
  region: BattleNetRegion | string;
  characters: BattleNetCharacterCandidate[];
}) {
  const expiresAt = Date.now() + MAX_COOKIE_AGE_SECONDS * 1000;
  const unique = new Map<string, BattleNetCharacterCandidate>();
  for (const character of input.characters || []) {
    const compact = character ? compactCandidate(character) : null;
    if (compact?.key) unique.set(compact.key, compact);
  }

  let characters = Array.from(unique.values());
  if (!characters.length) return "";

  let payload = makePayload(input.profileId, input.region, expiresAt, characters);
  if (Buffer.byteLength(buildCookieValue(payload), "utf8") > MAX_COOKIE_BYTES) {
    characters = stripHeavyMedia(characters, "render");
    payload = makePayload(input.profileId, input.region, expiresAt, characters);
  }

  if (Buffer.byteLength(buildCookieValue(payload), "utf8") > MAX_COOKIE_BYTES) {
    characters = stripHeavyMedia(characters, "all");
    payload = makePayload(input.profileId, input.region, expiresAt, characters);
  }

  while (payload.c.length > 0 && Buffer.byteLength(buildCookieValue(payload), "utf8") > MAX_COOKIE_BYTES) {
    payload = { ...payload, c: payload.c.slice(0, -1) };
  }

  return payload.c.length ? buildCookieValue(payload) : "";
}

export function parseBattleNetCandidatesCookieValue(value: string | undefined | null, profileId: string) {
  const text = String(value || "").trim();
  if (!text || !profileId) return null;

  const [payload, signature] = text.split(".");
  if (!payload || !signature || !verifySignature(payload, signature)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as CandidateCookiePayload;

    if (parsed.v === 2) {
      if (parsed.p !== profileId || Date.now() > Number(parsed.e || 0)) return null;
      const characters = Array.isArray(parsed.c)
        ? parsed.c.map((item) => tupleToCandidate(item, parsed.r)).filter(Boolean).slice(0, 50) as BattleNetCharacterCandidate[]
        : [];
      return { profileId: parsed.p, region: parsed.r, expiresAt: parsed.e, characters };
    }

    if (parsed.v !== 1 || parsed.profileId !== profileId || Date.now() > Number(parsed.expiresAt || 0)) return null;
    const characters = Array.isArray(parsed.characters)
      ? parsed.characters.map((item) => compactCandidate(item)).filter(Boolean).slice(0, 50) as BattleNetCharacterCandidate[]
      : [];
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
  const cleanKey = normalizeCharacterKey(characterKey);
  return session?.characters.find((item) => normalizeCharacterKey(item.key) === cleanKey) || null;
}

export function removeCandidatesFromCookie(response: NextResponse, cookieValue: string | undefined | null, profileId: string, characterKeys: string[]) {
  const session = parseBattleNetCandidatesCookieValue(cookieValue, profileId);
  if (!session) {
    clearBattleNetCandidatesCookie(response);
    return;
  }

  const removeKeys = new Set((characterKeys || []).map((key) => normalizeCharacterKey(key)).filter(Boolean));
  if (!removeKeys.size) return;

  const remaining = session.characters.filter((item) => !removeKeys.has(normalizeCharacterKey(item.key)));
  if (!remaining.length) {
    clearBattleNetCandidatesCookie(response);
    return;
  }

  setBattleNetCandidatesCookie(response, profileId, session.region, remaining);
}

export function removeCandidateFromCookie(response: NextResponse, cookieValue: string | undefined | null, profileId: string, characterKey: string) {
  const session = parseBattleNetCandidatesCookieValue(cookieValue, profileId);
  if (!session) {
    clearBattleNetCandidatesCookie(response);
    return;
  }

  const cleanKey = normalizeCharacterKey(characterKey);
  const remaining = session.characters.filter((item) => normalizeCharacterKey(item.key) !== cleanKey);
  if (!remaining.length) {
    clearBattleNetCandidatesCookie(response);
    return;
  }

  setBattleNetCandidatesCookie(response, profileId, session.region, remaining);
}
