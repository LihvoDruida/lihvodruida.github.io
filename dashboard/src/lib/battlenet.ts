import { createHash } from "crypto";
import { getDashboardUrl } from "@/lib/oauth";
import { getAdaptiveConcurrency, mapConcurrent, readIntegerEnv } from "@/lib/concurrency";
import { buildBattleNetCharacterKey, normalizeBattleNetNameSlug, normalizeBattleNetRealmSlug } from "@/lib/wowCharacters";
import { resolveWowCharacterRole, type WowCharacterRole } from "@/lib/wowRoles";

export type BattleNetRegion = "us" | "eu" | "kr" | "tw";

const ALL_BATTLE_NET_REGIONS: BattleNetRegion[] = ["eu", "us", "kr", "tw"];
export const BATTLE_NET_REGIONS: BattleNetRegion[] = ALL_BATTLE_NET_REGIONS;

export function getEnabledBattleNetRegions(): BattleNetRegion[] {
  const raw = process.env.BATTLENET_ENABLED_REGIONS || process.env.BATTLENET_REGIONS || "eu";
  const values = String(raw)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const enabled = values.filter((item): item is BattleNetRegion => (ALL_BATTLE_NET_REGIONS as string[]).includes(item));
  return Array.from(new Set(enabled.length ? enabled : ["eu"]));
}

export function getPrimaryBattleNetRegion(): BattleNetRegion {
  return getEnabledBattleNetRegions()[0] || "eu";
}

export type BattleNetAccountInfo = {
  accountLabel: string | null;
  accountIdHash: string | null;
};

export type BattleNetCharacterCandidate = {
  key: string;
  source: "battlenet";
  region: BattleNetRegion;
  name: string;
  normalizedName: string;
  realmSlug: string;
  realmName: string;
  level: number | null;
  faction: string | null;
  className: string | null;
  activeSpecName: string | null;
  activeSpecId: number | null;
  activeSpecRole: WowCharacterRole;
  raceName: string | null;
  genderName: string | null;
  guildName: string | null;
  guildRealmSlug: string | null;
  profileUrl: string;
  avatarUrl: string | null;
  renderUrl: string | null;
  mediaUrl: string | null;
  verifiedGuild: boolean;
  itemLevel?: number | null;
  lastSeenAt: string;
};

export const BNET_OAUTH_STATE_COOKIE = "__Host-mistblossom_bnet_state";
const DEFAULT_GUILD_NAME = "Mistblossom Vanguard";
const DEFAULT_LOCALE_BY_REGION: Record<BattleNetRegion, string> = {
  us: "en_US",
  eu: "en_GB",
  kr: "ko_KR",
  tw: "zh_TW",
};

function cleanText(value: unknown, maxLength = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function envFlag(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function getBattleNetRequestTimeoutMs() {
  return readIntegerEnv("BATTLENET_REQUEST_TIMEOUT_MS", 10_000, 2_500, 30_000);
}

function getBattleNetScanConcurrency(total: number) {
  return getAdaptiveConcurrency(total, {
    profile: "external-api",
    envKey: "BATTLENET_SCAN_CONCURRENCY",
    maxEnvKey: "BATTLENET_SCAN_MAX_CONCURRENCY",
    min: 2,
    max: 24,
  });
}

export function normalizeBattleNetRegion(value?: string | null): BattleNetRegion {
  const clean = String(value || "").trim().toLowerCase();
  return (ALL_BATTLE_NET_REGIONS as string[]).includes(clean) ? clean as BattleNetRegion : "eu";
}

export function getDefaultBattleNetRegion(): BattleNetRegion {
  return normalizeBattleNetRegion(process.env.BATTLENET_DEFAULT_REGION || process.env.BATTLE_NET_DEFAULT_REGION || process.env.WOW_REGION || getPrimaryBattleNetRegion());
}

export function getBattleNetLocale(region: BattleNetRegion = getDefaultBattleNetRegion()) {
  return process.env.BATTLENET_LOCALE || process.env.BATTLE_NET_LOCALE || process.env.BLIZZARD_LOCALE || DEFAULT_LOCALE_BY_REGION[region];
}

export function battleNetRedirectUri() {
  return `${getDashboardUrl()}/api/auth/battlenet/callback`;
}

function battleNetOAuthBase(region: BattleNetRegion = getDefaultBattleNetRegion()) {
  return `https://${region}.battle.net/oauth`;
}

function battleNetApiBase(region: BattleNetRegion = getDefaultBattleNetRegion()) {
  return `https://${region}.api.blizzard.com`;
}

function profileNamespace(region: BattleNetRegion = getDefaultBattleNetRegion()) {
  return `profile-${region}`;
}

function getBattleNetClient() {
  const clientId = process.env.BATTLENET_CLIENT_ID || process.env.BATTLE_NET_CLIENT_ID || process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BATTLENET_CLIENT_SECRET || process.env.BATTLE_NET_CLIENT_SECRET || process.env.BLIZZARD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Battle.net OAuth env is not configured.");
  }

  return { clientId, clientSecret };
}

function basicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

export function buildBattleNetOAuthUrl(state: string, regionInput?: string | null) {
  const region = normalizeBattleNetRegion(regionInput || getDefaultBattleNetRegion());
  const { clientId } = getBattleNetClient();
  const url = new URL(`${battleNetOAuthBase(region)}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", battleNetRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid wow.profile");
  url.searchParams.set("state", state);
  return url.toString();
}

function hashBattleNetAccountId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export async function fetchBattleNetUserInfo(accessToken: string, regionInput?: string | null): Promise<BattleNetAccountInfo | null> {
  const region = normalizeBattleNetRegion(regionInput || getDefaultBattleNetRegion());
  const response = await fetch(`${battleNetOAuthBase(region)}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok || !data) return null;

  const label = cleanText(data?.battletag || data?.battle_tag || data?.preferred_username || "", 120) || null;
  const rawId = cleanText(data?.id || data?.sub || "", 200) || null;

  return {
    accountLabel: label,
    accountIdHash: rawId ? hashBattleNetAccountId(rawId) : null,
  };
}

export async function exchangeBattleNetCode(code: string, regionInput?: string | null) {
  const region = normalizeBattleNetRegion(regionInput || getDefaultBattleNetRegion());
  const { clientId, clientSecret } = getBattleNetClient();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: battleNetRedirectUri(),
  });

  const response = await fetch(`${battleNetOAuthBase(region)}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error_description || data?.error || raw || `Battle.net OAuth error ${response.status}`);
  }

  if (!data?.access_token) {
    throw new Error("Battle.net OAuth response does not contain access_token.");
  }

  return data as { access_token: string; token_type?: string; expires_in?: number; scope?: string };
}

async function bnetFetch(accessToken: string, path: string, params?: Record<string, string>, regionInput?: string | null) {
  const region = normalizeBattleNetRegion(regionInput || getDefaultBattleNetRegion());
  const locale = getBattleNetLocale(region);
  const url = new URL(`${battleNetApiBase(region)}${path}`);
  url.searchParams.set("namespace", profileNamespace(region));
  url.searchParams.set("locale", locale);
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getBattleNetRequestTimeoutMs());

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Battle.net API timeout after ${getBattleNetRequestTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || raw || `Battle.net API error ${response.status}`);
  }

  return data;
}

function pickLocalizedName(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return cleanText(value, 120) || null;
  if (typeof value.name === "string") return cleanText(value.name, 120) || null;
  if (typeof value.name?.en_GB === "string") return cleanText(value.name.en_GB, 120) || null;
  const localized = Object.values(value.name || {}).find((item) => typeof item === "string" && item.trim());
  return localized ? cleanText(localized, 120) || null : null;
}

function pickActiveSpecId(value: any): number | null {
  const id = Number(value?.id || value?.key?.href?.match?.(/specialization\/(\d+)/)?.[1]);
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : null;
}

function normalizeGuildName(value: unknown) {
  return cleanText(value, 120).normalize("NFC").toLocaleLowerCase();
}

function isMistblossomGuild(characterProfile: any) {
  const configuredGuildName = process.env.WOW_GUILD_NAME || process.env.BATTLENET_ALLOWED_GUILD_NAME || DEFAULT_GUILD_NAME;
  const configuredRealm = cleanText(process.env.WOW_GUILD_REALM || process.env.BATTLENET_ALLOWED_GUILD_REALM || "", 120).toLowerCase();
  const guild = characterProfile?.guild || null;
  const guildName = normalizeGuildName(guild?.name || guild?.guild?.name);
  const targetName = normalizeGuildName(configuredGuildName);
  if (!guildName || guildName !== targetName) return false;

  if (!configuredRealm) return true;
  const guildRealmSlug = normalizeBattleNetRealmSlug(guild?.realm?.slug || guild?.realm?.name || "");
  const targetRealm = normalizeBattleNetRealmSlug(configuredRealm);
  return guildRealmSlug === targetRealm;
}

function mediaAssetUrl(media: any, preferredKeys: string[]) {
  const assets = Array.isArray(media?.assets) ? media.assets : [];
  for (const key of preferredKeys) {
    const asset = assets.find((item: any) => String(item?.key || "").toLowerCase() === key.toLowerCase());
    if (asset?.value) return cleanText(asset.value, 500);
  }
  const fallback = assets.find((item: any) => item?.value);
  return fallback?.value ? cleanText(fallback.value, 500) : null;
}

function characterProfileUrl(region: string, realmSlug: string, name: string) {
  return `https://worldofwarcraft.blizzard.com/${region}/character/${region}/${encodeURIComponent(realmSlug)}/${encodeURIComponent(normalizeBattleNetNameSlug(name))}`;
}

function flattenUserCharacters(profile: any) {
  const accounts = Array.isArray(profile?.wow_accounts) ? profile.wow_accounts : [];
  const characters: any[] = [];
  for (const account of accounts) {
    const accountCharacters = Array.isArray(account?.characters) ? account.characters : [];
    for (const character of accountCharacters) characters.push(character);
  }
  return characters;
}

export async function fetchBattleNetGuildCharacters(accessToken: string, regionInput?: string | null) {
  const startedAt = Date.now();
  const region = normalizeBattleNetRegion(regionInput || getDefaultBattleNetRegion());
  const profile = await bnetFetch(accessToken, "/profile/user/wow", undefined, region);
  const allCharacters = flattenUserCharacters(profile)
    .map((character) => {
      const name = cleanText(character?.name, 80);
      const realmSlug = normalizeBattleNetRealmSlug(character?.realm?.slug || character?.realm?.id || "");
      if (!name || !realmSlug) return null;
      return { ...character, name, realmSlug };
    })
    .filter(Boolean) as any[];

  const maxCharacters = Math.max(1, Math.min(Number(process.env.BATTLENET_SCAN_MAX_CHARACTERS || 80) || 80, 120));
  const limitedCharacters = allCharacters.slice(0, maxCharacters);
  const concurrency = getBattleNetScanConcurrency(limitedCharacters.length);

  const { results: candidates, meta } = await mapConcurrent(limitedCharacters, async (character) => {
    const nameSlug = normalizeBattleNetNameSlug(character.name);
    const realmSlug = character.realmSlug;

    try {
      const [details, media] = await Promise.all([
        bnetFetch(accessToken, `/profile/wow/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(nameSlug)}`, undefined, region),
        bnetFetch(accessToken, `/profile/wow/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(nameSlug)}/character-media`, undefined, region).catch(() => null),
      ]);

      if (!isMistblossomGuild(details) && !envFlag("BATTLENET_ALLOW_NON_GUILD_CHARACTERS", false)) return null;

      const avatarUrl = mediaAssetUrl(media, ["avatar", "inset"]);
      const renderUrl = mediaAssetUrl(media, ["main-raw", "main"]);
      const guildName = cleanText(details?.guild?.name || "", 120) || null;
      const guildRealmSlug = cleanText(details?.guild?.realm?.slug || details?.guild?.realm?.name || "", 120).toLowerCase() || null;
      const normalizedName = normalizeBattleNetNameSlug(details?.name || character.name);
      const cleanRealmSlug = normalizeBattleNetRealmSlug(details?.realm?.slug || realmSlug);
      const activeSpecName = pickLocalizedName(details?.active_spec || details?.active_specialization || character?.active_spec);
      const activeSpecId = pickActiveSpecId(details?.active_spec || details?.active_specialization || character?.active_spec);
      const className = pickLocalizedName(details?.character_class || details?.playable_class || character?.playable_class);
      const characterKey = buildBattleNetCharacterKey(region, cleanRealmSlug, normalizedName);
      if (!characterKey) return null;

      return {
        key: characterKey,
        source: "battlenet" as const,
        region,
        name: cleanText(details?.name || character.name, 80),
        normalizedName,
        realmSlug: cleanRealmSlug,
        realmName: cleanText(details?.realm?.name || character?.realm?.name || realmSlug, 120),
        level: Number.isFinite(Number(details?.level || character?.level)) ? Number(details?.level || character?.level) : null,
        faction: pickLocalizedName(details?.faction || character?.faction),
        className,
        activeSpecName,
        activeSpecId,
        activeSpecRole: resolveWowCharacterRole({ activeSpecName, activeSpecId, className }),
        raceName: pickLocalizedName(details?.race || details?.playable_race || character?.playable_race),
        genderName: pickLocalizedName(details?.gender || character?.gender),
        guildName,
        guildRealmSlug,
        profileUrl: characterProfileUrl(region, cleanRealmSlug, normalizedName),
        avatarUrl,
        renderUrl,
        mediaUrl: media?._links?.self?.href || null,
        verifiedGuild: Boolean(guildName),
        itemLevel: Number.isFinite(Number(details?.equipped_item_level || details?.average_item_level)) ? Number(details?.equipped_item_level || details?.average_item_level) : null,
        lastSeenAt: new Date().toISOString(),
      } satisfies BattleNetCharacterCandidate;
    } catch {
      return null;
    }
  }, {
    profile: "external-api",
    concurrency,
    failFast: false,
  });

  const filtered = candidates.filter(Boolean) as BattleNetCharacterCandidate[];
  return {
    region,
    totalCharacters: allCharacters.length,
    scannedCharacters: limitedCharacters.length,
    eligibleCharacters: filtered.length,
    concurrency: meta.concurrency,
    failedCharacters: meta.failed,
    durationMs: Date.now() - startedAt,
    characters: filtered.sort((a, b) => a.name.localeCompare(b.name, "uk")),
  };
}
