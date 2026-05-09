import { FieldValue } from "firebase-admin/firestore";
import type { DashboardSession } from "@/lib/auth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { getMainCharacter, getProfileByDiscordUserId, getProfileById, getProfilePublicName, cleanProfileGrammaticalGender, profileGenderedText, refreshProfileCharactersForRaidSignup, type DashboardProfile, type ProfileCharacter, type ProfileGrammaticalGender } from "@/lib/profiles";
import { normalizeCharacterKey, pickWowAvatarImageUrl } from "@/lib/wowCharacters";
import { resolveWowCharacterRole } from "@/lib/wowRoles";
import {
  createDiscordRaidMessage,
  deleteDiscordRaidMessage,
  discordMessageUrl,
  editDiscordRaidMessage,
  getDiscordDefaultChannelId,
  normalizeDiscordEmbed,
  type DiscordMessageRef,
} from "@/lib/discordAdmin";

export type RaidDifficulty = "normal" | "heroic" | "mythic";
export type RaidConsumables = "own" | "guild";
export type RaidLootMode = "ms-os" | "free-roll" | "soft-reserve" | "loot-council";
export type RaidSignupStatus = "going" | "late" | "skipped";
export type RaidCharacterRole = "tank" | "healer" | "dps";

export type RaidComposition = {
  tanks: number;
  healers: number;
  dps: number;
};

export type RaidSignup = {
  discordId: string;
  discordName: string;
  profileId?: string | null;
  characterKey?: string | null;
  status: RaidSignupStatus;
  role: RaidCharacterRole;
  grammaticalGender?: ProfileGrammaticalGender | null;
  characterName?: string | null;
  realmName?: string | null;
  realmSlug?: string | null;
  region?: string | null;
  className?: string | null;
  activeSpecName?: string | null;
  activeSpecId?: number | null;
  level?: number | null;
  raceName?: string | null;
  faction?: string | null;
  avatarUrl?: string | null;
  renderUrl?: string | null;
  mediaUrl?: string | null;
  itemLevel?: number | null;
  profileUrl?: string | null;
  verifiedGuild?: boolean | null;
  guildName?: string | null;
  guildRealmSlug?: string | null;
  signedAt?: string | null;
  updatedAt?: string | null;
};

export type RaidItem = {
  id: string;
  title: string;
  difficulty: RaidDifficulty;
  date: string;
  time: string;
  description: string;
  minItemLevel?: number | null;
  minItemLevelRequired?: boolean | null;
  maxPlayers?: number | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  mentionRoleIds?: string[];
  createdByDiscordId: string;
  createdByName: string;
  createdByMain?: string | null;
  raidLeaderName?: string | null;
  consumables: RaidConsumables;
  lootMode: RaidLootMode;
  composition: RaidComposition;
  status: "draft" | "published" | "closed";
  channelId?: string | null;
  messageId?: string | null;
  messageUrl?: string | null;
  signups: RaidSignup[];
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
};

export type RaidParty = {
  index: number;
  tank?: RaidSignup | null;
  healer?: RaidSignup | null;
  dps: RaidSignup[];
  late: RaidSignup[];
  members: RaidSignup[];
};

const RAID_COLLECTION = "dashboardRaids";
const DEFAULT_RAID_IMAGE = "https://lihvodruida.pp.ua/assets/img-content/raid.webp";
const RAID_ACTION_PREFIX = "mbv1:raid";
const MAX_RAID_PLAYERS = 80;
const RAID_THUMBNAIL_ASSET_PATHS: Record<RaidDifficulty, string> = {
  normal: "/assets/raid-thumbnails/normal.png",
  heroic: "/assets/raid-thumbnails/heroic.png",
  mythic: "/assets/raid-thumbnails/mythic.png",
};

const DIFFICULTY_LABELS: Record<RaidDifficulty, string> = {
  normal: "Нормал",
  heroic: "Героїк",
  mythic: "Міфік",
};

const DIFFICULTY_COLORS: Record<RaidDifficulty, number> = {
  normal: 0x2f81f7,
  heroic: 0x9b4dff,
  mythic: 0xed4245,
};

const CONSUMABLE_LABELS: Record<RaidConsumables, string> = {
  own: "Власні",
  guild: "Гільдійні",
};

const LOOT_LABELS: Record<RaidLootMode, string> = {
  "ms-os": "MS > OS",
  "free-roll": "Вільний рол",
  "soft-reserve": "Soft Reserve",
  "loot-council": "Loot Council",
};

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") return maybeTimestamp.toDate().toISOString();
  return null;
}

function cleanString(value: unknown, max = 300) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function cleanUrl(value: unknown) {
  const text = cleanString(value, 2048);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function dashboardBaseUrl() {
  return String(process.env.ADMIN_DASHBOARD_URL || process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "https://admin.lihvodruida.pp.ua").replace(/\/$/, "");
}

function absoluteDashboardAssetUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  try {
    return new URL(safePath, `${dashboardBaseUrl()}/`).toString();
  } catch {
    return `${dashboardBaseUrl()}${safePath}`;
  }
}

export function dashboardProfileUrl() {
  return `${dashboardBaseUrl()}/profile`;
}

export function dashboardLoginUrl(nextPath = "/profile") {
  const url = new URL("/login", `${dashboardBaseUrl()}/`);
  if (nextPath) url.searchParams.set("next", nextPath.startsWith("/") ? nextPath : `/${nextPath}`);
  url.searchParams.set("error", "session_required");
  return url.toString();
}

export function dashboardRaidRulesUrl() {
  const value = String(
    process.env.RAID_RULES_URL ||
    process.env.NEXT_PUBLIC_RAID_RULES_URL ||
    process.env.DISCORD_RAID_RULES_URL ||
    "https://discord.com/channels/1449767281453301865/1498719949550784540/1498732894326227024"
  ).trim();
  return value || dashboardProfileUrl();
}

function discordLinkButton(label: string, url: string) {
  return { type: 2, style: 5, label: label.slice(0, 80), url };
}

export function raidActionHelpComponents(raidId?: string | null) {
  const buttons = [
    discordLinkButton("Відкрити профіль", dashboardProfileUrl()),
    discordLinkButton("Правила рейду", dashboardRaidRulesUrl()),
  ];
  if (raidId) buttons.push(discordLinkButton("Сторінка рейду", dashboardRaidUrl(raidId)));
  return [{ type: 1, components: buttons.slice(0, 5) }];
}

function raidActionHelpText(reason: "login" | "main") {
  const profile = dashboardProfileUrl();
  const rules = dashboardRaidRulesUrl();
  if (reason === "login") {
    return `❌ Запис не зараховано: спочатку увійди через Discord у панелі.
Профіль: ${profile}
Правила рейду: ${rules}`;
  }
  return `❌ Запис не зараховано: у профілі потрібно додати хоча б одного персонажа Battle.net.
Профіль: ${profile}
Правила рейду: ${rules}`;
}

export function defaultRaidThumbnailPath(difficulty: RaidDifficulty) {
  return RAID_THUMBNAIL_ASSET_PATHS[difficulty] || RAID_THUMBNAIL_ASSET_PATHS.heroic;
}

export function resolveRaidThumbnailUrl(input: { difficulty?: RaidDifficulty | string | null; thumbnailUrl?: string | null; imageUrl?: string | null }, options?: { absolute?: boolean }) {
  const explicitThumb = cleanUrl(input.thumbnailUrl);
  if (explicitThumb) return explicitThumb;
  const explicitImage = cleanUrl(input.imageUrl);
  if (explicitImage) return explicitImage;
  const difficulty = cleanDifficulty(input.difficulty);
  const assetPath = defaultRaidThumbnailPath(difficulty);
  return options?.absolute === false ? assetPath : absoluteDashboardAssetUrl(assetPath);
}

function cleanDifficulty(value: unknown): RaidDifficulty {
  const key = cleanString(value, 20).toLowerCase();
  return key === "mythic" || key === "міфік" ? "mythic" : key === "normal" || key === "нормал" ? "normal" : "heroic";
}

function cleanConsumables(value: unknown): RaidConsumables {
  return cleanString(value, 20).toLowerCase() === "guild" ? "guild" : "own";
}

function cleanLootMode(value: unknown): RaidLootMode {
  const key = cleanString(value, 30).toLowerCase();
  if (key === "free-roll") return "free-roll";
  if (key === "soft-reserve") return "soft-reserve";
  if (key === "loot-council") return "loot-council";
  return "ms-os";
}

function cleanSignupStatus(value: unknown): RaidSignupStatus {
  const key = cleanString(value, 20).toLowerCase();
  if (key === "late") return "late";
  if (key === "skipped" || key === "skip") return "skipped";
  return "going";
}

function cleanRole(value: unknown): RaidCharacterRole {
  const key = cleanString(value, 30).toLowerCase();
  if (["tank", "танк"].some((item) => key.includes(item))) return "tank";
  if (["heal", "healer", "healing", "хіл", "лікар"].some((item) => key.includes(item))) return "healer";
  return "dps";
}

function timezoneOffsetMs(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour === "24" ? "0" : values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return asUtc - date.getTime();
  } catch {
    return 0;
  }
}

function raidDateTimeToUtcMs(input: Pick<RaidItem, "date" | "time"> | Record<string, unknown>) {
  const date = cleanString((input as Record<string, unknown>).date, 20);
  const time = cleanString((input as Record<string, unknown>).time, 20) || "00:00";
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const y = Number(dateMatch[1]);
  const m = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const timeZone = String(process.env.RAID_TIME_ZONE || process.env.NEXT_PUBLIC_RAID_TIME_ZONE || "Europe/Kyiv");
  return guess.getTime() - timezoneOffsetMs(guess, timeZone);
}

function isRaidDateTimeExpired(input: Pick<RaidItem, "date" | "time"> | Record<string, unknown>) {
  const startsAt = raidDateTimeToUtcMs(input);
  return startsAt !== null && Date.now() >= startsAt;
}

export function isRaidClosed(raid: Pick<RaidItem, "status" | "date" | "time">) {
  return raid.status === "closed" || (raid.status === "published" && isRaidDateTimeExpired(raid));
}

function profileMainLabel(profile?: DashboardProfile | null) {
  const main = profile ? getMainCharacter(profile) : null;
  if (!main) return null;
  return `${main.name}${main.realmName || main.realmSlug ? ` • ${main.realmName || main.realmSlug}` : ""}`;
}

function normalizeComposition(value: unknown): RaidComposition {
  const fallback = { tanks: 2, healers: 2, dps: 6 };
  if (!value || typeof value !== "object") return fallback;
  const item = value as Record<string, unknown>;
  return {
    tanks: clampInt(item.tanks, 1, 8, fallback.tanks),
    healers: clampInt(item.healers, 1, 16, fallback.healers),
    dps: clampInt(item.dps, 1, 24, fallback.dps),
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function cleanOptionalItemLevel(value: unknown) {
  const raw = cleanString(value, 12).replace(",", ".");
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.max(1, Math.min(9999, Math.floor(num)));
}

function cleanOptionalMaxPlayers(value: unknown) {
  const raw = cleanString(value, 12).replace(",", ".");
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.max(1, Math.min(MAX_RAID_PLAYERS, Math.floor(num)));
}

function cleanSnowflakeIds(values: unknown, max = 20) {
  const rawValues = Array.isArray(values) ? values : values ? [values] : [];
  return Array.from(new Set(rawValues
    .map((value) => cleanString(value, 32))
    .filter((value) => /^\d{16,25}$/.test(value))))
    .slice(0, max);
}

function cleanBoolean(value: unknown) {
  if (value === true) return true;
  const key = cleanString(value, 20).toLowerCase();
  return key === "1" || key === "true" || key === "on" || key === "yes" || key === "required" || key === "block";
}

function normalizeSignup(value: unknown): RaidSignup | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const discordId = cleanString(item.discordId, 32);
  if (!/^\d{16,25}$/.test(discordId)) return null;

  const ilvl = Number(item.itemLevel);
  const activeSpecId = Number(item.activeSpecId || item.active_spec_id);
  const activeSpecName = cleanString(item.activeSpecName || item.active_spec_name || item.specName || item.spec_name, 80) || null;
  const className = cleanString(item.className, 80) || null;
  const resolvedRole = resolveWowCharacterRole({
    className,
    activeSpecName,
    activeSpecId: Number.isFinite(activeSpecId) ? activeSpecId : null,
    activeSpecRole: item.activeSpecRole || item.active_spec_role || item.role,
  });
  const grammaticalGender = cleanProfileGrammaticalGender(item.grammaticalGender || item.grammatical_gender || item.gender);
  const rawVerifiedGuild = item.verifiedGuild ?? item.verified_guild;
  const verifiedGuild = typeof rawVerifiedGuild === "boolean"
    ? rawVerifiedGuild
    : String(rawVerifiedGuild || "").toLowerCase() === "false"
      ? false
      : true;
  const level = Number(item.level);
  return {
    discordId,
    discordName: cleanString(item.discordName, 100) || "Discord user",
    profileId: cleanString(item.profileId, 80) || null,
    characterKey: normalizeCharacterKey(item.characterKey || item.character_key) || null,
    status: cleanSignupStatus(item.status),
    role: resolvedRole,
    grammaticalGender,
    characterName: cleanString(item.characterName, 80) || null,
    realmName: cleanString(item.realmName, 120) || null,
    realmSlug: cleanString(item.realmSlug, 120) || null,
    region: cleanString(item.region, 12) || null,
    className,
    activeSpecName,
    activeSpecId: Number.isFinite(activeSpecId) ? Math.floor(activeSpecId) : null,
    level: Number.isFinite(level) && level > 0 ? Math.floor(level) : null,
    raceName: cleanString(item.raceName, 80) || null,
    faction: cleanString(item.faction, 80) || null,
    avatarUrl: pickWowAvatarImageUrl(item.avatarUrl, item.renderUrl),
    renderUrl: cleanUrl(item.renderUrl),
    mediaUrl: cleanUrl(item.mediaUrl),
    itemLevel: Number.isFinite(ilvl) && ilvl > 0 ? Math.floor(ilvl) : null,
    profileUrl: cleanUrl(item.profileUrl),
    verifiedGuild,
    guildName: cleanString(item.guildName || item.guild_name, 120) || null,
    guildRealmSlug: cleanString(item.guildRealmSlug || item.guild_realm_slug, 120) || null,
    signedAt: timestampToIso(item.signedAt) || null,
    updatedAt: timestampToIso(item.updatedAt) || null,
  };
}

function normalizeRaid(id: string, data: Record<string, unknown>): RaidItem {
  const rawStatus = data.status === "published" ? "published" : data.status === "closed" ? "closed" : "draft";
  const status = rawStatus === "published" && isRaidDateTimeExpired(data) ? "closed" : rawStatus;
  const signups = Array.isArray(data.signups)
    ? data.signups.map(normalizeSignup).filter(Boolean) as RaidSignup[]
    : [];

  const difficulty = cleanDifficulty(data.difficulty);
  const imageUrl = cleanUrl(data.imageUrl);

  return {
    id,
    title: cleanString(data.title, 120) || "Рейд",
    difficulty,
    date: cleanString(data.date, 20),
    time: cleanString(data.time, 20),
    description: cleanString(data.description, 4096) || "Будьте готові до рейду та перевірте спорядження заздалегідь.",
    minItemLevel: cleanOptionalItemLevel(data.minItemLevel || data.min_item_level),
    minItemLevelRequired: cleanBoolean(data.minItemLevelRequired ?? data.min_item_level_required ?? data.blockBelowMinItemLevel),
    maxPlayers: cleanOptionalMaxPlayers(data.maxPlayers ?? data.max_players ?? data.registrationLimit),
    imageUrl,
    thumbnailUrl: resolveRaidThumbnailUrl({ difficulty, thumbnailUrl: data.thumbnailUrl as string | null, imageUrl }),
    mentionRoleIds: cleanSnowflakeIds(data.mentionRoleIds ?? data.mention_role_ids),
    createdByDiscordId: cleanString(data.createdByDiscordId, 32),
    createdByName: cleanString(data.createdByName, 120) || "@Raid Lead",
    createdByMain: cleanString(data.createdByMain, 160) || null,
    raidLeaderName: cleanString(data.raidLeaderName || data.raid_leader_name || data.raidLeadName || data.raid_lead_name, 120) || null,
    consumables: cleanConsumables(data.consumables),
    lootMode: cleanLootMode(data.lootMode),
    composition: normalizeComposition(data.composition),
    status,
    channelId: cleanString(data.channelId, 32) || null,
    messageId: cleanString(data.messageId, 32) || null,
    messageUrl: cleanUrl(data.messageUrl),
    signups,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    publishedAt: timestampToIso(data.publishedAt),
  };
}

export function raidTitle(raid: Pick<RaidItem, "title" | "difficulty">) {
  return `${raid.title} — ${DIFFICULTY_LABELS[raid.difficulty]}`;
}

export function raidDifficultyLabel(value: RaidDifficulty) {
  return DIFFICULTY_LABELS[value];
}

export function raidConsumablesLabel(value: RaidConsumables) {
  return CONSUMABLE_LABELS[value];
}

export function raidLootLabel(value: RaidLootMode) {
  return LOOT_LABELS[value];
}

export function raidCapacity(raid: Pick<RaidItem, "composition">) {
  return raid.composition.tanks + raid.composition.healers + raid.composition.dps;
}

export function raidCompositionLabel(raid: Pick<RaidItem, "composition">) {
  return `${raid.composition.tanks} / ${raid.composition.healers} / ${raid.composition.dps}`;
}

type RaidAutoInput = Pick<RaidItem, "difficulty" | "composition" | "signups">;

export function raidActiveRosterSize(raid: Pick<RaidItem, "signups">) {
  return raid.signups.filter((item) => item.status === "going" || item.status === "late").length;
}

const BASE_RAID_COMPOSITION_TIERS: RaidComposition[] = [
  { tanks: 2, healers: 2, dps: 6 },
  { tanks: 2, healers: 4, dps: 14 },
  { tanks: 2, healers: 6, dps: 22 },
];

const MYTHIC_RAID_COMPOSITION_TIERS: RaidComposition[] = [
  { tanks: 2, healers: 2, dps: 6 },
  { tanks: 2, healers: 4, dps: 14 },
];

function compositionCapacity(composition: RaidComposition) {
  return composition.tanks + composition.healers + composition.dps;
}

function normalizeRoleDemand(value?: Partial<RaidComposition> | null): RaidComposition | null {
  if (!value) return null;
  return {
    tanks: Math.max(0, Math.floor(Number(value.tanks) || 0)),
    healers: Math.max(0, Math.floor(Number(value.healers) || 0)),
    dps: Math.max(0, Math.floor(Number(value.dps) || 0)),
  };
}

function compositionWithTankOverflow(composition: RaidComposition, roleDemand?: RaidComposition | null): RaidComposition {
  if (!roleDemand || roleDemand.tanks <= composition.tanks) return composition;
  return { ...composition, tanks: roleDemand.tanks };
}

function compositionFitsRoster(composition: RaidComposition, activeSize: number, roleDemand?: RaidComposition | null) {
  const target = compositionWithTankOverflow(composition, roleDemand);
  if (activeSize > compositionCapacity(target)) return false;
  if (!roleDemand) return true;
  return roleDemand.healers <= target.healers
    && roleDemand.dps <= target.dps;
}

function activeRoleDemand(signups: RaidSignup[]): RaidComposition {
  const active = signups.filter((item) => item.status === "going" || item.status === "late");
  return {
    tanks: active.filter((item) => item.role === "tank").length,
    healers: active.filter((item) => item.role === "healer").length,
    dps: active.filter((item) => item.role === "dps").length,
  };
}

export function autoRaidCompositionForSize(size: number, difficulty: RaidDifficulty, roleDemand?: Partial<RaidComposition> | null): RaidComposition {
  const activeSize = Math.max(0, Math.floor(Number.isFinite(size) ? size : 0));
  const demand = normalizeRoleDemand(roleDemand);
  const baseTiers = difficulty === "mythic"
    ? MYTHIC_RAID_COMPOSITION_TIERS
    : BASE_RAID_COMPOSITION_TIERS;

  for (const tier of baseTiers) {
    if (compositionFitsRoster(tier, activeSize, demand)) return compositionWithTankOverflow(tier, demand);
  }

  if (difficulty === "mythic") {
    let mythicOverflow = compositionWithTankOverflow({ ...baseTiers[baseTiers.length - 1] }, demand);
    if (demand) {
      mythicOverflow = {
        tanks: Math.max(mythicOverflow.tanks, demand.tanks),
        healers: Math.max(mythicOverflow.healers, demand.healers),
        dps: Math.max(mythicOverflow.dps, demand.dps),
      };
    }
    const missingCapacity = activeSize - compositionCapacity(mythicOverflow);
    return missingCapacity > 0
      ? { ...mythicOverflow, dps: mythicOverflow.dps + missingCapacity }
      : mythicOverflow;
  }

  let dynamicTier = compositionWithTankOverflow({ ...BASE_RAID_COMPOSITION_TIERS[BASE_RAID_COMPOSITION_TIERS.length - 1] }, demand);
  let guard = 0;
  while (!compositionFitsRoster(dynamicTier, activeSize, demand) && guard < 20) {
    dynamicTier = compositionWithTankOverflow({
      tanks: dynamicTier.tanks,
      healers: dynamicTier.healers + 2,
      dps: dynamicTier.dps + 8,
    }, demand);
    guard += 1;
  }
  return dynamicTier;
}

export function raidAutoComposition(raid: RaidAutoInput): RaidComposition {
  const activeSize = raidActiveRosterSize(raid);
  return autoRaidCompositionForSize(activeSize, raid.difficulty, activeRoleDemand(raid.signups));
}

export function raidAutoCapacity(raid: RaidAutoInput) {
  const composition = raidAutoComposition(raid);
  return composition.tanks + composition.healers + composition.dps;
}

export function raidRegistrationLimit(raid: Pick<RaidItem, "maxPlayers">) {
  const limit = Number(raid.maxPlayers || 0);
  return Number.isFinite(limit) && limit > 0 ? Math.max(1, Math.min(MAX_RAID_PLAYERS, Math.floor(limit))) : null;
}

export function raidDisplayCapacity(raid: RaidAutoInput & Pick<RaidItem, "maxPlayers">) {
  return raidRegistrationLimit(raid) ?? raidAutoCapacity(raid);
}

export function isRaidRegistrationFull(raid: Pick<RaidItem, "maxPlayers" | "signups">) {
  const limit = raidRegistrationLimit(raid);
  return limit !== null && raidActiveRosterSize(raid) >= limit;
}

function isActiveSignupStatus(status?: RaidSignupStatus | string | null) {
  return status === "going" || status === "late";
}

function hasActiveSignupForDiscord(raid: Pick<RaidItem, "signups">, discordId: string) {
  return raid.signups.some((item) => item.discordId === discordId && isActiveSignupStatus(item.status));
}

function raidRegistrationFullMessage(raid: Pick<RaidItem, "maxPlayers" | "signups" | "title" | "difficulty">, discordId: string, action: RaidSignupStatus) {
  if (action === "skipped") return null;
  const limit = raidRegistrationLimit(raid);
  if (limit === null) return null;
  if (raidActiveRosterSize(raid) < limit) return null;
  if (discordId && hasActiveSignupForDiscord(raid, discordId)) return null;
  return `🔒 Ліміт запису на ${raidTitle(raid)} досягнуто (${limit}/${limit}). Нові записи вже недоступні.`;
}

export function raidAutoCompositionLabel(raid: RaidAutoInput) {
  const composition = raidAutoComposition(raid);
  return `${composition.tanks} / ${composition.healers} / ${composition.dps}`;
}

export function raidRosterCounts(raid: Pick<RaidItem, "signups">) {
  const going = raid.signups.filter((item) => item.status === "going");
  const late = raid.signups.filter((item) => item.status === "late");
  const skipped = raid.signups.filter((item) => item.status === "skipped");
  return {
    going: going.length,
    late: late.length,
    skipped: skipped.length,
    roster: going.length + late.length,
    tanks: [...going, ...late].filter((item) => item.role === "tank").length,
    healers: [...going, ...late].filter((item) => item.role === "healer").length,
    dps: [...going, ...late].filter((item) => item.role === "dps").length,
  };
}

export function raidAverageItemLevel(raid: Pick<RaidItem, "signups">) {
  const values = raid.signups
    .filter((item) => item.status === "going" || item.status === "late")
    .map((item) => Number(item.itemLevel || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

type RaidMinimumPolicy = Pick<RaidItem, "minItemLevel" | "minItemLevelRequired">;
type RaidItemLevelSubject = Pick<RaidSignup, "itemLevel" | "status"> | Pick<ProfileCharacter, "itemLevel"> | null | undefined;

function raidMinimumItemLevel(raid: Pick<RaidItem, "minItemLevel">) {
  const minimum = Number(raid.minItemLevel || 0);
  return Number.isFinite(minimum) && minimum > 0 ? Math.floor(minimum) : 0;
}

function raidSubjectItemLevel(subject: RaidItemLevelSubject) {
  const current = Number(subject?.itemLevel || 0);
  return Number.isFinite(current) && current > 0 ? Math.floor(current) : null;
}

function isSkippedItemLevelSubject(subject: RaidItemLevelSubject) {
  return Boolean(subject && "status" in subject && subject.status === "skipped");
}

export function isRaidSubjectBelowMinItemLevel(raid: Pick<RaidItem, "minItemLevel">, subject: RaidItemLevelSubject) {
  const required = raidMinimumItemLevel(raid);
  const current = raidSubjectItemLevel(subject);
  return Boolean(required && current !== null && current < required);
}

export function isRaidSubjectBlockedByMinItemLevel(raid: RaidMinimumPolicy, subject: RaidItemLevelSubject) {
  const required = raidMinimumItemLevel(raid);
  if (!raid.minItemLevelRequired || !required || isSkippedItemLevelSubject(subject)) return false;
  const current = raidSubjectItemLevel(subject);
  return current === null || current < required;
}

export function isRaidSubjectWarnedByMinItemLevel(raid: RaidMinimumPolicy, subject: RaidItemLevelSubject) {
  const required = raidMinimumItemLevel(raid);
  if (raid.minItemLevelRequired || !required || isSkippedItemLevelSubject(subject)) return false;
  return isRaidSubjectBelowMinItemLevel(raid, subject);
}

export function raidEligibleSignupCharacters(raid: RaidMinimumPolicy, profile?: Pick<DashboardProfile, "characters"> | null) {
  const characters = profile?.characters || [];
  return characters.filter((character) => !isRaidSubjectBlockedByMinItemLevel(raid, character));
}

export function raidSignupCharacterMinimumNote(raid: RaidMinimumPolicy, character: Pick<ProfileCharacter, "itemLevel">) {
  const required = raidMinimumItemLevel(raid);
  const current = raidSubjectItemLevel(character);
  if (!required) return null;
  if (isRaidSubjectBlockedByMinItemLevel(raid, character)) {
    return current === null
      ? `⛔ ilvl не визначено, мінімум ${required}`
      : `⛔ ${current} ilvl нижче мінімуму ${required}`;
  }
  if (isRaidSubjectWarnedByMinItemLevel(raid, character)) {
    return `⚠️ ${current} ilvl нижче мінімуму ${required}`;
  }
  return null;
}

export function hasRaidStorage() {
  return hasFirebaseProfileConfig();
}

export async function listRaids(limit = 60): Promise<RaidItem[]> {
  if (!hasRaidStorage()) return [];
  const snapshot = await getFirebaseAdminDb().collection(RAID_COLLECTION).limit(Math.max(1, Math.min(100, limit))).get();
  const raids = snapshot.docs.map((doc) => normalizeRaid(doc.id, doc.data() || {}));
  await Promise.all(snapshot.docs
    .map((doc, index) => ({ rawStatus: doc.get("status"), raid: raids[index] }))
    .filter((item): item is { rawStatus: unknown; raid: RaidItem } => item.rawStatus === "published" && Boolean(item.raid) && item.raid.status === "closed")
    .slice(0, 8)
    .map((item) => syncAutoClosedRaid(item.raid).catch(() => null)));
  return raids
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) || (Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || "")));
}

export async function getRaid(raidId: string): Promise<RaidItem | null> {
  const id = cleanRaidId(raidId);
  if (!id || !hasRaidStorage()) return null;
  const snapshot = await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(id).get();
  if (!snapshot.exists) return null;
  const rawStatus = snapshot.get("status");
  const raid = normalizeRaid(snapshot.id, snapshot.data() || {});
  if (rawStatus === "published" && raid.status === "closed") await syncAutoClosedRaid(raid).catch(() => null);
  return raid;
}

async function syncAutoClosedRaid(raid: RaidItem) {
  if (raid.status !== "closed" || !hasRaidStorage()) return;
  const ref = getFirebaseAdminDb().collection(RAID_COLLECTION).doc(raid.id);
  await ref.set({ status: "closed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (raid.channelId && raid.messageId) {
    await publishOrUpdateRaid({ ...raid, status: "closed" }, raid.channelId).catch(() => null);
  }
}

export async function closeRaid(raidId: string) {
  const raid = await getRaid(raidId);
  if (!raid) throw new Error("Рейд не знайдено.");
  if (raid.status === "draft") throw new Error("Чернетку не можна закрити. Її можна видалити або опублікувати.");
  const closed: RaidItem = { ...raid, status: "closed" };
  await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(raid.id).set({ status: "closed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  let discordSynced = true;
  if (closed.channelId && closed.messageId) {
    try {
      await publishOrUpdateRaid(closed, closed.channelId);
    } catch (error) {
      discordSynced = false;
      console.warn("[raids] Failed to disable Discord buttons while closing raid", { raidId: raid.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return { ...closed, discordSynced };
}

export async function deleteRaid(raidId: string) {
  const raid = await getRaid(raidId);
  if (!raid) throw new Error("Рейд не знайдено.");

  let discordDeleted = false;
  let discordDeleteFailed = false;
  if (raid.channelId && raid.messageId) {
    try {
      await deleteDiscordRaidMessage({
        ref: { channelId: raid.channelId, messageId: raid.messageId },
        auditReason: `Raid manually deleted from dashboard: ${raid.id}`,
      });
      discordDeleted = true;
    } catch (error) {
      if (isMissingDiscordMessageError(error)) {
        discordDeleted = true;
      } else {
        discordDeleteFailed = true;
        console.warn("[raids] Failed to delete Discord raid message during manual raid deletion", {
          raidId: raid.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(raid.id).delete();
  return { ...raid, discordDeleted, discordDeleteFailed };
}

export const deleteDraftRaid = deleteRaid;

export type ProfileRaidSignup = {
  raid: RaidItem;
  signup: RaidSignup;
};

function signupMatchesProfile(signup: RaidSignup, profile: Pick<DashboardProfile, "profileId" | "provider" | "providerUserId">) {
  if (signup.profileId && signup.profileId === profile.profileId) return true;
  if (profile.provider === "discord" && /^\d{16,25}$/.test(profile.providerUserId || "")) {
    return signup.discordId === profile.providerUserId;
  }
  return false;
}

export async function listProfileRaidSignups(profile: Pick<DashboardProfile, "profileId" | "provider" | "providerUserId" | "grammaticalGender">, limit = 80): Promise<ProfileRaidSignup[]> {
  if (!profile?.profileId || !hasRaidStorage()) return [];

  const raids = await listRaids(Math.max(20, Math.min(120, limit)));
  const items: ProfileRaidSignup[] = [];
  for (const raid of raids) {
    if (raid.status !== "published" || isRaidClosed(raid)) continue;
    const signup = raid.signups.find((item) => signupMatchesProfile(item, profile));
    if (!signup) continue;
    items.push({ raid, signup: { ...signup, grammaticalGender: profile.grammaticalGender } });
  }
  return items.sort((a, b) => `${b.raid.date} ${b.raid.time}`.localeCompare(`${a.raid.date} ${a.raid.time}`));
}

export async function syncRaidSignupGenderForProfile(profile: Pick<DashboardProfile, "profileId" | "provider" | "providerUserId" | "grammaticalGender">, limit = 120) {
  if (!profile?.profileId || !hasRaidStorage()) return { updatedRaids: 0, updatedSignups: 0 };

  const raids = await listRaids(Math.max(20, Math.min(120, limit)));
  let updatedRaids = 0;
  let updatedSignups = 0;
  const discordId = profile.provider === "discord" && /^\d{16,25}$/.test(profile.providerUserId || "") ? profile.providerUserId : "";

  for (const raid of raids) {
    if (raid.status !== "published" || isRaidClosed(raid) || !raid.signups.length) continue;
    let changed = false;
    const nextSignups = raid.signups.map((signup) => {
      const matches = signup.profileId === profile.profileId || Boolean(discordId && signup.discordId === discordId);
      if (!matches || signup.grammaticalGender === profile.grammaticalGender) return signup;
      changed = true;
      updatedSignups += 1;
      return { ...signup, profileId: signup.profileId || profile.profileId, grammaticalGender: profile.grammaticalGender, updatedAt: new Date().toISOString() };
    });

    if (!changed) continue;
    await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(raid.id).set({
      signups: nextSignups,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    updatedRaids += 1;
  }

  return { updatedRaids, updatedSignups };
}

function cleanRaidId(value: unknown) {
  const text = cleanString(value, 80);
  return /^[A-Za-z0-9_-]{8,80}$/.test(text) ? text : "";
}

export function formRaidPayload(form: FormData, user: DashboardSession, profile?: DashboardProfile | null) {
  const compositionText = cleanString(form.get("composition"), 40);
  const compositionParts = compositionText.match(/(\d+)\s*[\/\\|:-]\s*(\d+)\s*[\/\\|:-]\s*(\d+)/);
  const composition = compositionParts
    ? { tanks: Number(compositionParts[1]), healers: Number(compositionParts[2]), dps: Number(compositionParts[3]) }
    : {
        tanks: Number(form.get("tanks") || 2),
        healers: Number(form.get("healers") || 2),
        dps: Number(form.get("dps") || 6),
      };

  const difficulty = cleanDifficulty(form.get("difficulty"));
  const imageUrl = cleanUrl(form.get("imageUrl"));
  const thumbnailUrl = cleanUrl(form.get("thumbnailUrl"));

  return {
    title: cleanString(form.get("title"), 120) || "Рейд",
    difficulty,
    date: cleanString(form.get("date"), 20),
    time: cleanString(form.get("time"), 20),
    description: cleanString(form.get("description"), 4096) || "Будьте готові до рейду та перевірте спорядження заздалегідь.",
    minItemLevel: cleanOptionalItemLevel(form.get("minItemLevel")),
    minItemLevelRequired: cleanBoolean(form.get("minItemLevelRequired")),
    maxPlayers: cleanOptionalMaxPlayers(form.get("maxPlayers")),
    imageUrl,
    thumbnailUrl: thumbnailUrl || resolveRaidThumbnailUrl({ difficulty, imageUrl }),
    mentionRoleIds: cleanSnowflakeIds(form.getAll("mentionRoleIds")),
    createdByDiscordId: user.provider === "discord" ? user.id : "",
    createdByName: profile ? getProfilePublicName(profile) : user.name || user.login || "Raid Lead",
    createdByMain: profileMainLabel(profile),
    raidLeaderName: cleanString(form.get("raidLeaderName"), 120) || null,
    consumables: cleanConsumables(form.get("consumables")),
    lootMode: cleanLootMode(form.get("lootMode")),
    composition: normalizeComposition(composition),
    channelId: cleanString(form.get("channelId"), 32),
  };
}

function isValidRaidDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidRaidTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validateRaidPayload(payload: ReturnType<typeof formRaidPayload>, existingRaid?: RaidItem | null) {
  if (payload.title.length < 2) throw new Error("Вкажи назву рейду.");
  if (!isValidRaidDate(payload.date)) throw new Error("Вкажи коректну дату рейду.");
  if (!isValidRaidTime(payload.time)) throw new Error("Вкажи коректний час рейду.");
  if (!payload.description.trim()) throw new Error("Додай короткий опис рейду.");

  const limit = raidRegistrationLimit({ maxPlayers: payload.maxPlayers });
  const activeCount = existingRaid ? raidActiveRosterSize(existingRaid) : 0;
  if (limit !== null && activeCount > limit) {
    throw new Error(`Ліміт гравців не може бути меншим за поточний активний запис (${activeCount}). Спочатку закрий зайві записи або збільш ліміт.`);
  }
}

export async function saveRaidFromForm(form: FormData, user: DashboardSession, profile?: DashboardProfile | null) {
  if (!hasRaidStorage()) throw new Error("Збереження рейдів тимчасово недоступне.");

  const db = getFirebaseAdminDb();
  const raidId = cleanRaidId(form.get("raidId"));
  const payload = formRaidPayload(form, user, profile);
  const ref = raidId ? db.collection(RAID_COLLECTION).doc(raidId) : db.collection(RAID_COLLECTION).doc();
  const snapshot = await ref.get();
  const existingRaid = snapshot.exists ? normalizeRaid(snapshot.id, snapshot.data() || {}) : null;
  validateRaidPayload(payload, existingRaid);

  await ref.set({
    ...payload,
    status: snapshot.exists ? snapshot.get("status") || "draft" : "draft",
    updatedAt: FieldValue.serverTimestamp(),
    ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp(), signups: [] }),
  }, { merge: true });

  const saved = await ref.get();
  return normalizeRaid(ref.id, saved.data() || {});
}

function dateTimeLabel(raid: Pick<RaidItem, "date" | "time">) {
  if (!raid.date && !raid.time) return "Дата уточнюється";
  return [raid.date || "Дата уточнюється", raid.time || ""].filter(Boolean).join(" ");
}

function discordTimestamp(raid: Pick<RaidItem, "date" | "time">, style: "t" | "T" | "d" | "D" | "f" | "F" | "R" = "F") {
  const startsAt = raidDateTimeToUtcMs(raid);
  if (startsAt === null) return null;
  return `<t:${Math.floor(startsAt / 1000)}:${style}>`;
}

function discordDateTimeLabel(raid: Pick<RaidItem, "date" | "time">) {
  const full = discordTimestamp(raid, "F");
  const relative = discordTimestamp(raid, "R");
  if (!full || !relative) return dateTimeLabel(raid);
  return `${full}
${relative}`;
}

function compositionLongLabel(raid: RaidAutoInput) {
  const composition = raidAutoComposition(raid);
  return `${composition.tanks} танки / ${composition.healers} хіли / ${composition.dps} дд`;
}

function signupName(item?: RaidSignup | null) {
  if (!item) return "—";
  const name = item.characterName || item.discordName || "Гравець";
  const spec = item.activeSpecName ? ` • ${item.activeSpecName}` : "";
  const ilvl = item.itemLevel ? ` • ${item.itemLevel} ilvl` : "";
  const late = item.status === "late" ? " 🕒" : "";
  return `${name}${spec}${ilvl}${late}`;
}

function truncateDiscordField(value: string, max = 1024) {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 20)).trimEnd()}\n…`;
}

function roleSortWeight(item: RaidSignup) {
  if (item.role === "tank") return 0;
  if (item.role === "healer") return 1;
  return 2;
}

function signupSort(a: RaidSignup, b: RaidSignup) {
  return roleSortWeight(a) - roleSortWeight(b)
    || String(a.characterName || a.discordName).localeCompare(String(b.characterName || b.discordName), "uk");
}

function rosterForGroups(raid: Pick<RaidItem, "signups">) {
  const active = raid.signups.filter((item) => item.status === "going" || item.status === "late").sort(signupSort);
  return {
    tanks: active.filter((item) => item.role === "tank"),
    healers: active.filter((item) => item.role === "healer"),
    dps: active.filter((item) => item.role === "dps"),
    late: active.filter((item) => item.status === "late"),
    active,
  };
}

const RAID_PARTY_SIZE = 5;
const MAX_RAID_PARTIES = 40;

function partyMembersCount(party: RaidParty) {
  return (party.tank ? 1 : 0) + (party.healer ? 1 : 0) + party.dps.length;
}

function partyCapacity(party: RaidParty) {
  return RAID_PARTY_SIZE - partyMembersCount(party);
}

function partyFlexRoleCount(party: RaidParty, role: RaidCharacterRole) {
  return party.dps.filter((item) => item.role === role).length;
}

function pickParty(parties: RaidParty[], predicate: (party: RaidParty) => boolean) {
  const candidates = parties.filter((party) => partyCapacity(party) > 0 && predicate(party));
  return candidates.sort((a, b) => partyMembersCount(a) - partyMembersCount(b) || a.index - b.index)[0] || null;
}

function placeFlexMember(parties: RaidParty[], member: RaidSignup) {
  const preferences: Array<(party: RaidParty) => boolean> = member.role === "dps"
    ? [
        (party) => Boolean(party.tank && party.healer) && partyFlexRoleCount(party, "dps") < 3,
        (party) => Boolean(party.tank || party.healer) && partyFlexRoleCount(party, "dps") < 4,
        () => true,
      ]
    : [
        (party) => Boolean(party.tank && party.healer) && partyMembersCount(party) < RAID_PARTY_SIZE,
        (party) => Boolean(party.tank || party.healer) && partyMembersCount(party) < RAID_PARTY_SIZE,
        () => true,
      ];

  for (const predicate of preferences) {
    const party = pickParty(parties, predicate);
    if (party) {
      party.dps.push(member);
      return true;
    }
  }
  return false;
}

export function buildRaidParties(raid: Pick<RaidItem, "difficulty" | "composition" | "signups">): RaidParty[] {
  const roster = rosterForGroups(raid);
  const visibleRosterSize = roster.active.length;
  const groupCount = Math.max(1, Math.min(MAX_RAID_PARTIES, Math.ceil(Math.max(1, visibleRosterSize) / RAID_PARTY_SIZE)));
  const parties: RaidParty[] = Array.from({ length: groupCount }, (_, index) => ({ index: index + 1, dps: [], late: [], members: [] }));

  const tanks = [...roster.tanks];
  for (const party of parties) {
    party.tank = tanks.shift() || null;
  }

  const healers = [...roster.healers];
  for (const party of parties) {
    party.healer = healers.shift() || null;
  }

  const flexPool = [...roster.dps, ...healers, ...tanks];
  for (const member of flexPool) {
    placeFlexMember(parties, member);
  }

  for (const party of parties) {
    party.members = [party.tank, party.healer, ...party.dps].filter(Boolean) as RaidSignup[];
    party.late = party.members.filter((item) => item.status === "late");
  }

  return parties.sort((a, b) => a.index - b.index);
}

function compactSignupName(item?: RaidSignup | null, max = 42) {
  if (!item) return "—";
  const base = item.characterName || item.discordName || "Гравець";
  const spec = item.activeSpecName ? ` ${item.activeSpecName}` : "";
  const markers = [item.status === "late" ? "🕒" : null, item.verifiedGuild === false ? "🤝" : null].filter(Boolean);
  const prefix = markers.length ? `${markers.join(" ")} ` : "";
  const text = `${prefix}${base}${spec}`.trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function isSignupBelowRaidMinimum(item?: RaidSignup | null, raid?: Pick<RaidItem, "minItemLevel"> | null) {
  const minimum = Number(raid?.minItemLevel || 0);
  const current = Number(item?.itemLevel || 0);
  return Boolean(item && item.status !== "skipped" && Number.isFinite(minimum) && minimum > 0 && Number.isFinite(current) && current > 0 && current < minimum);
}

function isSignupNonGuildCharacter(item?: Pick<RaidSignup, "verifiedGuild"> | null) {
  return Boolean(item && item.verifiedGuild === false);
}

function discordSignupMarkers(item?: RaidSignup | null, raid?: Pick<RaidItem, "minItemLevel"> | null) {
  if (!item) return "";
  const markers = [
    isSignupBelowRaidMinimum(item, raid) ? "⚠️" : null,
    item.status === "late" ? "🕒" : null,
    isSignupNonGuildCharacter(item) ? "🤝" : null,
  ].filter(Boolean);
  return markers.length ? `${markers.join(" ")} ` : "";
}

function compactSignupDiscordLine(item?: RaidSignup | null, raid?: Pick<RaidItem, "minItemLevel"> | null, max = 48) {
  if (!item) return "—";
  const base = item.characterName || item.discordName || "Гравець";
  const ilvl = item.itemLevel ? ` • ${item.itemLevel}` : "";
  const value = `${discordSignupMarkers(item, raid)}${base}${ilvl}`.trim();
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function compactSignupDiscordLines(items: RaidSignup[], raid?: Pick<RaidItem, "minItemLevel"> | null, max = 44) {
  return items.length
    ? items.map((item) => `• ${compactSignupDiscordLine(item, raid, max)}`).join("\n")
    : "—";
}

function partyDiscordText(party: RaidParty, raid?: Pick<RaidItem, "minItemLevel"> | null) {
  const tanks = [party.tank, ...party.dps.filter((item) => item.role === "tank")].filter(Boolean) as RaidSignup[];
  const healers = [party.healer, ...party.dps.filter((item) => item.role === "healer")].filter(Boolean) as RaidSignup[];
  const dps = party.dps.filter((item) => item.role === "dps");
  const sections = [
    tanks.length ? `**Танк**\n${compactSignupDiscordLines(tanks, raid, 42)}` : null,
    healers.length ? `**Хіл**\n${compactSignupDiscordLines(healers, raid, 42)}` : null,
    dps.length ? `**ДД**\n${compactSignupDiscordLines(dps, raid, 40)}` : null,
  ].filter(Boolean) as string[];

  return truncateDiscordField(sections.length ? sections.join("\n\n") : "—", 700);
}

function compactDiscordFields(fields: Array<{ name: string; value: string; inline?: boolean }>, maxTotal = 5600) {
  const result: Array<{ name: string; value: string; inline?: boolean }> = [];
  let total = 0;
  for (const field of fields.slice(0, 25)) {
    const name = truncateDiscordField(field.name, 256);
    const value = truncateDiscordField(field.value, 1024);
    const nextTotal = total + name.length + value.length;
    if (nextTotal > maxTotal) break;
    result.push({ name, value, inline: field.inline });
    total = nextTotal;
  }
  return result;
}

export function buildRaidDiscordPayload(raid: RaidItem) {
  const counts = raidRosterCounts(raid);
  const averageItemLevel = raidAverageItemLevel(raid);
  const composition = raidAutoComposition(raid);
  const allParties = buildRaidParties(raid);
  const parties = allParties.slice(0, 8);
  const imageUrl = raid.imageUrl || undefined;
  const thumbUrl = resolveRaidThumbnailUrl(raid, { absolute: true }) || DEFAULT_RAID_IMAGE;
  const closed = isRaidClosed(raid);
  const omittedParties = allParties.length - parties.length;
  const registrationLimit = raidRegistrationLimit(raid);
  const displayCapacity = registrationLimit ?? raidAutoCapacity(raid);
  const registrationFull = isRaidRegistrationFull(raid);
  const rosterValue = [
    `${counts.roster} / ${displayCapacity}`,
    compositionLongLabel(raid),
    registrationLimit ? (registrationFull ? "🔒 Ліміт запису досягнуто" : `Вільно місць: ${Math.max(0, registrationLimit - counts.roster)}`) : null,
  ].filter(Boolean).join("\n");
  const minItemLevelPolicyText = raid.minItemLevelRequired
    ? "⛔ Запис блокується, якщо персонаж нижче порогу"
    : "⚠️ Лише попередження, запис не блокується";
  const minItemLevelValue = raid.minItemLevel ? `${raid.minItemLevel}\n${minItemLevelPolicyText}` : null;
  const description = truncateDiscordField(raid.description, 4096);
  const rawFields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "📌 Статус",
      value: closed ? "Закрито — запис вимкнено" : raid.status === "draft" ? "Чернетка" : "Запис відкрито",
      inline: true,
    },
    {
      name: "📅 Дата",
      value: discordDateTimeLabel(raid),
      inline: true,
    },
    {
      name: "👤 Створив",
      value: raid.createdByName,
      inline: true,
    },
    ...(raid.raidLeaderName ? [{ name: "🧭 РЛ", value: raid.raidLeaderName, inline: true }] : []),
    {
      name: "🧪 Розхідники",
      value: raidConsumablesLabel(raid.consumables),
      inline: true,
    },
    {
      name: "🎁 Лут",
      value: raidLootLabel(raid.lootMode),
      inline: true,
    },
    {
      name: "👥 Склад рейду",
      value: rosterValue,
      inline: true,
    },
    ...(minItemLevelValue ? [{ name: "👙 Мін. ilvl", value: minItemLevelValue, inline: true }] : []),
    ...(averageItemLevel ? [{ name: "📊 Середній ilvl", value: `${averageItemLevel}`, inline: true }] : []),
    {
      name: "⚔️ Ролі",
      value: `${counts.tanks}/${composition.tanks} танки • ${counts.healers}/${composition.healers} хіли • ${counts.dps}/${composition.dps} дд`,
      inline: false,
    },
    ...parties.map((party) => ({
      name: `Паті ${party.index}`,
      value: partyDiscordText(party, raid),
      inline: true,
    })),
    ...(omittedParties > 0
      ? [{ name: "Ще групи", value: `Ще ${omittedParties} паті доступно на сторінці рейду:\n${dashboardRaidUrl(raid.id)}`, inline: false }]
      : []),
  ];
  const fieldsBudget = Math.max(1200, 5800 - description.length - raidTitle(raid).length);
  const fields = compactDiscordFields(rawFields, fieldsBudget);

  const embed = normalizeDiscordEmbed({
    title: closed ? `${raidTitle(raid)} • Закрито` : raidTitle(raid),
    url: dashboardRaidUrl(raid.id),
    description,
    color: DIFFICULTY_COLORS[raid.difficulty],
    thumbnail: thumbUrl ? { url: thumbUrl } : undefined,
    image: imageUrl ? { url: imageUrl } : undefined,
    fields,
    footer: { text: "Склад рейду оновлюється автоматично після кожної заявки." },
    timestamp: new Date().toISOString(),
  });

  return {
    content: "",
    embed,
    mentionRoleIds: raid.mentionRoleIds || [],
  };
}

export function buildRaidAttendanceCustomId(raidId: string, action: RaidSignupStatus) {
  const id = cleanRaidId(raidId);
  const safeAction = cleanSignupStatus(action);
  const customId = `${RAID_ACTION_PREFIX}:${id}:${safeAction}`;
  if (!id || customId.length > 100) throw new Error("Некоректний ID рейду для Discord-кнопки.");
  return customId;
}

export function decodeRaidAttendanceCustomId(customId: string) {
  const value = cleanString(customId, 120);
  const match = value.match(/^mbv1:raid:([A-Za-z0-9_-]{8,80}):(going|late|skipped)$/);
  if (!match) return null;
  return { raidId: match[1], action: cleanSignupStatus(match[2]) };
}

export function decodeRaidCharacterSelectCustomId(customId: string, values?: unknown) {
  const value = cleanString(customId, 120);
  const match = value.match(/^mbv1:rc:([A-Za-z0-9_-]{8,80}):(going|late|skipped)$/);
  if (!match) return null;
  const selectedValues = Array.isArray(values) ? values : [];
  const characterKey = cleanString(selectedValues[0], 260);
  if (!characterKey) return null;
  return { raidId: match[1], action: cleanSignupStatus(match[2]), characterKey };
}

export function buildRaidAttendanceComponents(raidId: string, options: boolean | { disabled?: boolean; full?: boolean } = false) {
  const disabled = typeof options === "boolean" ? options : Boolean(options.disabled);
  const full = typeof options === "object" && Boolean(options.full);
  const activeJoinDisabled = disabled || full;
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: full && !disabled ? "Заповнено" : "Підписатися", emoji: { name: "✅" }, custom_id: buildRaidAttendanceCustomId(raidId, "going"), disabled: activeJoinDisabled },
        { type: 2, style: 2, label: "Пропустити", emoji: { name: "↩️" }, custom_id: buildRaidAttendanceCustomId(raidId, "skipped"), disabled },
        { type: 2, style: 4, label: full && !disabled ? "Ліміт досягнуто" : "Затримаюсь", emoji: { name: "🕒" }, custom_id: buildRaidAttendanceCustomId(raidId, "late"), disabled: activeJoinDisabled },
      ],
    },
  ];
}


export function buildRaidCharacterSelectCustomId(raidId: string, action: RaidSignupStatus) {
  const id = cleanRaidId(raidId);
  const safeAction = cleanSignupStatus(action);
  const customId = `mbv1:rc:${id}:${safeAction}`;
  if (!id || customId.length > 100) throw new Error("Некоректний ID рейду для Discord-вибору персонажа.");
  return customId;
}

function raidCharacterOptionLabel(character: ProfileCharacter) {
  const realm = character.realmName || character.realmSlug || "realm";
  const prefix = character.verifiedGuild ? "" : "🤝 ";
  return `${prefix}${character.name} • ${realm}`.slice(0, 100);
}

function raidCharacterOptionDescription(character: ProfileCharacter, raid?: RaidMinimumPolicy | null) {
  const minimumNote = raid ? raidSignupCharacterMinimumNote(raid, character) : null;
  return [
    minimumNote || null,
    character.verifiedGuild ? "Гільдійний" : "Інший персонаж",
    character.activeSpecName || null,
    character.className || null,
    character.itemLevel ? `${character.itemLevel} ilvl` : null,
  ].filter(Boolean).join(" • ").slice(0, 100) || "Персонаж Battle.net";
}

export function buildRaidCharacterSelectComponents(raidId: string, action: RaidSignupStatus, profile: DashboardProfile, selectedCharacterKey?: string | null, raid?: RaidMinimumPolicy | null) {
  const selectedKey = normalizeCharacterKey(selectedCharacterKey);
  const options = profile.characters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => !raid || !isRaidSubjectBlockedByMinItemLevel(raid, character))
    .slice(0, 25)
    .map(({ character, index }) => ({
      label: `${raid && isRaidSubjectWarnedByMinItemLevel(raid, character) ? "⚠️ " : ""}${raidCharacterOptionLabel(character)}`.slice(0, 100),
      description: raidCharacterOptionDescription(character, raid),
      value: `c${index}`,
      default: Boolean(selectedKey && normalizeCharacterKey(character.key) === selectedKey),
    }));

  if (!options.length) return [];

  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: buildRaidCharacterSelectCustomId(raidId, action),
          placeholder: action === "late" ? "Ким позначити запізнення?" : "Ким підписатися на рейд?",
          min_values: 1,
          max_values: 1,
          options,
        },
      ],
    },
  ];
}

function resolveProfileCharacterSelection(profile: DashboardProfile | null | undefined, characterKey?: unknown): ProfileCharacter | null {
  if (!profile?.characters?.length) return null;
  const raw = cleanString(characterKey, 260);
  if (!raw) return null;
  const indexMatch = raw.match(/^c(\d{1,2})$/i);
  if (indexMatch) {
    const byIndex = profile.characters[Number(indexMatch[1])];
    if (byIndex) return byIndex;
  }
  const cleanKey = normalizeCharacterKey(raw);
  return cleanKey ? profile.characters.find((item) => normalizeCharacterKey(item.key) === cleanKey) || null : null;
}

function isMissingDiscordMessageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /404|unknown message|10008/i.test(message);
}

export async function publishOrUpdateRaid(raid: RaidItem, channelId?: string | null) {
  const payload = buildRaidDiscordPayload(raid);
  const closed = isRaidClosed(raid);
  const components = buildRaidAttendanceComponents(raid.id, { disabled: closed, full: !closed && isRaidRegistrationFull(raid) });
  const targetChannelId = cleanString(channelId || raid.channelId || getDiscordDefaultChannelId(), 32);
  if (!targetChannelId) throw new Error("Канал Discord для рейду не вибрано. Вибери канал у формі рейду.");

  let message: any;
  const hasExistingMessage = Boolean(raid.channelId && raid.messageId);
  const canEditExisting = Boolean(hasExistingMessage && targetChannelId === raid.channelId);

  if (canEditExisting && raid.channelId && raid.messageId) {
    const existingRef: DiscordMessageRef = { channelId: raid.channelId, messageId: raid.messageId };
    try {
      message = await editDiscordRaidMessage({
        ref: existingRef,
        content: payload.content,
        embed: payload.embed,
        components,
        mentionRoleIds: payload.mentionRoleIds,
        auditReason: `Raid updated: ${raid.id}`,
      });
    } catch (error) {
      if (!isMissingDiscordMessageError(error)) throw error;
      message = await createDiscordRaidMessage({
        channelId: targetChannelId,
        content: payload.content,
        embed: payload.embed,
        components,
        mentionRoleIds: payload.mentionRoleIds,
        auditReason: `Raid republished after missing message: ${raid.id}`,
      });
    }
  } else {
    message = await createDiscordRaidMessage({
      channelId: targetChannelId,
      content: payload.content,
      embed: payload.embed,
      components,
      mentionRoleIds: payload.mentionRoleIds,
      auditReason: `Raid published: ${raid.id}`,
    });

    if (hasExistingMessage && raid.channelId && raid.messageId && raid.channelId !== targetChannelId) {
      await deleteDiscordRaidMessage({
        ref: { channelId: raid.channelId, messageId: raid.messageId },
        auditReason: `Raid moved to another channel: ${raid.id}`,
      }).catch((error) => console.warn("[raids] Failed to delete old Discord raid message", { raidId: raid.id, message: error instanceof Error ? error.message : String(error) }));
    }
  }

  const nextChannelId = String(message?.channel_id || targetChannelId);
  const nextMessageId = String(message?.id || "");
  if (!nextChannelId || !nextMessageId) throw new Error("Discord не підтвердив повідомлення. Перевір канал і повтори дію.");
  const messageUrl = discordMessageUrl(nextChannelId, nextMessageId);

  await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(raid.id).set({
    status: closed ? "closed" : "published",
    channelId: nextChannelId,
    messageId: nextMessageId,
    messageUrl,
    publishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { channelId: nextChannelId, messageId: nextMessageId, messageUrl };
}

export async function saveAndMaybePublishRaid(form: FormData, user: DashboardSession, profile?: DashboardProfile | null) {
  const raid = await saveRaidFromForm(form, user, profile);
  const action = cleanString(form.get("action"), 40);
  if (action === "publish") {
    const wasDiscordPublished = Boolean(raid.channelId && raid.messageId && raid.status !== "draft");
    const result = await publishOrUpdateRaid(raid, form.get("channelId") ? cleanString(form.get("channelId"), 32) : raid.channelId);
    const nextStatus = isRaidClosed({ ...raid, ...result, status: "published" }) ? "closed" as const : "published" as const;
    return { raid: { ...raid, status: nextStatus, ...result }, published: result.messageUrl, discordAction: wasDiscordPublished ? "updated" as const : "created" as const };
  }
  return { raid, published: null, discordAction: null };
}

async function refreshProfileBeforeRaidSignup(profile: DashboardProfile | null, context: { raidId: string; userId: string }) {
  if (!profile?.characters?.length) return profile;
  try {
    return await refreshProfileCharactersForRaidSignup(profile);
  } catch (error) {
    console.warn("[raids] Battle.net character refresh before signup failed", {
      raidId: context.raidId,
      userId: context.userId,
      profileId: profile.profileId,
      message: error instanceof Error ? error.message : String(error),
    });
    return profile;
  }
}

function resolveRaidSignupCharacter(profile?: DashboardProfile | null, characterKey?: unknown): ProfileCharacter | null {
  if (!profile?.characters?.length) return null;
  const cleanKey = normalizeCharacterKey(characterKey);
  if (cleanKey) {
    const selected = profile.characters.find((item) => normalizeCharacterKey(item.key) === cleanKey);
    if (selected) return selected;
  }
  return getMainCharacter(profile);
}

function resolveRaidSignupRole(profile: DashboardProfile | null | undefined, character: ProfileCharacter | null): RaidCharacterRole {
  if (!character) return "dps";
  const manualRole = profile?.raidRolePreference?.characterKey === character.key ? profile?.raidRolePreference?.role : null;
  return manualRole || resolveWowCharacterRole({
    className: character.className,
    activeSpecName: character.activeSpecName,
    activeSpecId: character.activeSpecId,
    activeSpecRole: character.activeSpecRole,
  });
}

function signupFromProfile(status: RaidSignupStatus, userId: string, userName: string, profile?: DashboardProfile | null, characterKey?: unknown): RaidSignup {
  const character = resolveRaidSignupCharacter(profile, characterKey);
  const role = resolveRaidSignupRole(profile, character);
  const now = new Date().toISOString();

  return {
    discordId: userId,
    discordName: profile ? getProfilePublicName(profile) : userName || "Discord user",
    profileId: profile?.profileId || null,
    characterKey: character?.key || null,
    status,
    role,
    grammaticalGender: cleanProfileGrammaticalGender(profile?.grammaticalGender),
    characterName: character?.name || null,
    realmName: character?.realmName || character?.realmSlug || null,
    realmSlug: character?.realmSlug || null,
    region: character?.region || "eu",
    className: character?.className || null,
    activeSpecName: character?.activeSpecName || null,
    activeSpecId: Number.isFinite(Number(character?.activeSpecId)) ? Number(character?.activeSpecId) : null,
    level: Number.isFinite(Number(character?.level)) ? Number(character?.level) : null,
    raceName: character?.raceName || null,
    faction: character?.faction || null,
    avatarUrl: pickWowAvatarImageUrl(character?.avatarUrl, character?.renderUrl),
    renderUrl: character?.renderUrl || null,
    mediaUrl: character?.mediaUrl || null,
    itemLevel: Number.isFinite(Number(character?.itemLevel)) ? Number(character?.itemLevel) : null,
    profileUrl: character?.profileUrl || null,
    verifiedGuild: character ? Boolean(character.verifiedGuild) : null,
    guildName: character?.guildName || null,
    guildRealmSlug: character?.guildRealmSlug || null,
    signedAt: now,
    updatedAt: now,
  };
}

export async function recordRaidSignup(raidId: string, signup: RaidSignup) {
  const id = cleanRaidId(raidId);
  if (!id || !hasRaidStorage()) throw new Error("Рейд не знайдено або збереження тимчасово недоступне.");

  const ref = getFirebaseAdminDb().collection(RAID_COLLECTION).doc(id);
  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Рейд не знайдено.");
    const raid = normalizeRaid(snapshot.id, snapshot.data() || {});
    if (isRaidClosed(raid)) throw new Error("Рейд уже закритий, запис вимкнено.");
    if (raid.status !== "published") throw new Error("Запис доступний тільки для опублікованого рейду.");
    const block = raidMinItemLevelBlockMessage(raid, signup);
    if (block) throw new Error(block);
    const fullBlock = raidRegistrationFullMessage(raid, signup.discordId, signup.status);
    if (fullBlock) throw new Error(fullBlock);
    const nextSignups = raid.signups.filter((item) => item.discordId !== signup.discordId);
    nextSignups.push({ ...signup, updatedAt: new Date().toISOString(), signedAt: signup.signedAt || new Date().toISOString() });
    transaction.set(ref, { signups: nextSignups, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  const updated = await getRaid(id);
  if (!updated) throw new Error("Рейд не знайдено після оновлення.");
  return updated;
}

type DiscordMessageRefInput = {
  channelId?: string | null;
  messageId?: string | null;
  channel_id?: string | null;
  message_id?: string | null;
};

function cleanDiscordMessageRef(input?: DiscordMessageRefInput | null): DiscordMessageRef | null {
  const channelId = cleanString(input?.channelId || input?.channel_id, 32);
  const messageId = cleanString(input?.messageId || input?.message_id, 32);
  return channelId && messageId ? { channelId, messageId } : null;
}

async function editCurrentRaidDiscordMessage(raid: RaidItem, messageRef?: DiscordMessageRefInput | null) {
  if (raid.status !== "published") return false;

  // Важливо: під час вибору персонажа Discord надсилає ref на приватне ephemeral-повідомлення
  // з select-menu, а не на основний публічний embed рейду. Якщо редагувати цей ref першим,
  // синхронізація падає і користувач бачить "Discord-повідомлення не оновилося автоматично".
  // Тому основне джерело істини — messageId/channelId, збережені в документі рейду.
  const storedRef = cleanDiscordMessageRef({ channelId: raid.channelId, messageId: raid.messageId });
  const fallbackRef = cleanDiscordMessageRef(messageRef);
  const ref = storedRef || fallbackRef;
  if (!ref) {
    console.warn("[raids] Discord message sync skipped: raid has no stored message ref", { raidId: raid.id });
    return false;
  }

  const payload = buildRaidDiscordPayload(raid);
  const components = buildRaidAttendanceComponents(raid.id, {
    disabled: false,
    full: isRaidRegistrationFull(raid),
  });

  await editDiscordRaidMessage({
    ref,
    content: payload.content,
    embed: payload.embed,
    components,
    mentionRoleIds: payload.mentionRoleIds,
    auditReason: `Raid signup changed: ${raid.id}`,
  });

  return true;
}

async function syncRaidDiscordAfterSignup(raid: RaidItem, messageRef?: DiscordMessageRefInput | null) {
  try {
    return await editCurrentRaidDiscordMessage(raid, messageRef);
  } catch (error) {
    console.warn("[raids] Discord message sync after signup failed", { raidId: raid.id, message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export function raidMinItemLevelBlockMessage(
  raid: Pick<RaidItem, "minItemLevel" | "minItemLevelRequired">,
  signup?: Pick<RaidSignup, "itemLevel" | "characterName" | "discordName" | "status" | "grammaticalGender"> | null,
) {
  if (!isRaidSubjectBlockedByMinItemLevel(raid, signup)) return null;

  const required = raidMinimumItemLevel(raid);
  const current = raidSubjectItemLevel(signup);
  const name = signup?.characterName || signup?.discordName || "Персонаж";
  if (current === null) {
    return `⛔ ${name}: item level не визначено. Для цього рейду потрібен мінімум ${required}. Запис заблоковано.`;
  }
  return `⛔ ${name}: item level ${current} нижче мінімального порогу ${required}. Запис заблоковано для цього рейду.`;
}

export function raidMinItemLevelWarning(
  raid: Pick<RaidItem, "minItemLevel" | "minItemLevelRequired">,
  signup?: Pick<RaidSignup, "itemLevel" | "characterName" | "discordName" | "status" | "grammaticalGender"> | null,
) {
  if (!isRaidSubjectWarnedByMinItemLevel(raid, signup)) return null;
  const required = raidMinimumItemLevel(raid);
  const current = raidSubjectItemLevel(signup);
  const name = signup?.characterName || signup?.discordName || "Персонаж";
  const signedText = profileGenderedText(signup?.grammaticalGender, "Ти записаний", "Ти записана", "Тебе записали");
  return `⚠️ ${name}: item level ${current} нижче мінімального порогу ${required}. ${signedText}, але краще підняти спорядження перед рейдом.`;
}

function attendanceSuccessText(action: RaidSignupStatus, raid: RaidItem, signup?: RaidSignup | null, discordSynced = true) {
  const syncText = discordSynced
    ? "Склад Discord оновлено."
    : "Запис збережено, але Discord-повідомлення не оновилося автоматично. Офіцер може натиснути “Оновити Discord”.";
  if (action === "skipped") return `👌 Позначено, що ти пропускаєш: ${raidTitle(raid)}. ${syncText}`;
  const warning = raidMinItemLevelWarning(raid, signup);
  const characterText = signup?.characterName ? ` як ${signup.characterName}` : "";
  const signedText = profileGenderedText(signup?.grammaticalGender, "Ти записаний", "Ти записана", "Тебе записали");
  const base = action === "late"
    ? `🕒 Записано: ти затримаєшся на ${raidTitle(raid)}${characterText}. ${syncText}`
    : `✅ ${signedText} на ${raidTitle(raid)}${characterText}. ${syncText}`;
  return warning ? `${base}\n\n${warning}` : base;
}

export async function handleRaidDiscordAction(params: {
  raidId: string;
  action: RaidSignupStatus;
  userId: string;
  userName: string;
  characterKey?: string | null;
  messageRef?: DiscordMessageRefInput | null;
}) {
  const raid = await getRaid(params.raidId);
  if (!raid) return { ok: false, content: "❌ Рейд не знайдено або він уже видалений." };
  if (isRaidClosed(raid)) return { ok: false, content: "🔒 Рейд уже закритий, запис вимкнено." };
  if (raid.status !== "published") return { ok: false, content: "❌ Запис доступний тільки для опублікованого рейду." };
  const fullBlock = raidRegistrationFullMessage(raid, params.userId, params.action);
  if (fullBlock) return { ok: false, content: fullBlock, warning: null, blockedByMaxPlayers: true };

  let profile: DashboardProfile | null = null;
  let selectedCharacter: ProfileCharacter | null = null;
  if (params.action !== "skipped") {
    profile = await getProfileByDiscordUserId(params.userId);
    profile = await refreshProfileBeforeRaidSignup(profile, { raidId: raid.id, userId: params.userId });
    if (!profile || !profile.characters.length) {
      return {
        ok: false,
        content: raidActionHelpText(!profile ? "login" : "main"),
        components: raidActionHelpComponents(raid.id),
        blockedByProfile: true,
      };
    }

    const requestedCharacter = resolveProfileCharacterSelection(profile, params.characterKey);
    const eligibleCharacters = raidEligibleSignupCharacters(raid, profile);
    if (requestedCharacter && isRaidSubjectBlockedByMinItemLevel(raid, requestedCharacter)) {
      const blockedSignup = signupFromProfile(params.action, params.userId, params.userName, profile, requestedCharacter.key);
      return { ok: false, content: raidMinItemLevelBlockMessage(raid, blockedSignup) || "⛔ Цей персонаж не проходить мінімальний item level для рейду.", warning: null, blockedByMinItemLevel: true };
    }
    selectedCharacter = requestedCharacter || (eligibleCharacters.length === 1 ? eligibleCharacters[0] : null);

    if (!selectedCharacter && eligibleCharacters.length > 1) {
      const currentSignup = raid.signups.find((item) => item.discordId === params.userId);
      const hiddenCount = profile.characters.length - eligibleCharacters.length;
      return {
        ok: true,
        content: `🎯 Обери персонажа, яким хочеш записатися на рейд. ${hiddenCount > 0 ? `Персонажі нижче мінімального ilvl (${raid.minItemLevel}) приховані.` : "Це приватний вибір — інші його не бачать."}`,
        components: buildRaidCharacterSelectComponents(raid.id, params.action, profile, currentSignup?.characterKey || null, raid),
        requiresCharacterSelection: true,
      };
    }
    if (!selectedCharacter) {
      const minimum = raidMinimumItemLevel(raid);
      const content = profile.characters.length && raid.minItemLevelRequired && minimum
        ? `⛔ Немає доступних персонажів для запису: потрібен мінімум ${minimum} ilvl. Персонажі нижче порогу не показуються і не можуть бути записані.`
        : raidActionHelpText("main");
      const allBlocked = Boolean(profile.characters.length && raid.minItemLevelRequired && minimum);
      return {
        ok: false,
        content,
        components: allBlocked ? [] : raidActionHelpComponents(raid.id),
        blockedByProfile: !allBlocked,
        blockedByMinItemLevel: allBlocked,
      };
    }
  } else {
    profile = await getProfileByDiscordUserId(params.userId).catch(() => null);
  }

  const signup = signupFromProfile(params.action, params.userId, params.userName, profile, selectedCharacter?.key || params.characterKey);
  const block = raidMinItemLevelBlockMessage(raid, signup);
  if (block) return { ok: false, content: block, warning: null, blockedByMinItemLevel: true };
  const updated = await recordRaidSignup(raid.id, signup);
  const discordSynced = await syncRaidDiscordAfterSignup(updated, params.messageRef);
  const warning = params.action === "skipped" ? null : raidMinItemLevelWarning(updated, signup);
  return { ok: true, content: attendanceSuccessText(params.action, updated, signup, discordSynced), warning, raid: updated, discordSynced };
}

export async function handleRaidSessionAction(params: {
  raidId: string;
  action: RaidSignupStatus;
  user: DashboardSession;
  characterKey?: string | null;
}) {
  const raid = await getRaid(params.raidId);
  if (!raid) return { ok: false, content: "❌ Рейд не знайдено або він уже видалений." };
  if (isRaidClosed(raid)) return { ok: false, content: "🔒 Рейд уже закритий, запис вимкнено." };
  if (raid.status !== "published") return { ok: false, content: "❌ Запис доступний тільки для опублікованого рейду." };

  const discordId = params.user.provider === "discord" && /^\d{16,25}$/.test(params.user.id) ? params.user.id : "";
  if (!discordId) {
    return {
      ok: false,
      content: raidActionHelpText("login"),
      components: raidActionHelpComponents(raid.id),
      blockedByProfile: true,
    };
  }
  const fullBlock = raidRegistrationFullMessage(raid, discordId, params.action);
  if (fullBlock) return { ok: false, content: fullBlock, warning: null, blockedByMaxPlayers: true };

  let profile: DashboardProfile | null = null;
  if (params.user.profileId) {
    profile = await getProfileById(params.user.profileId).catch(() => null);
  }
  if (!profile) {
    profile = await getProfileByDiscordUserId(discordId).catch(() => null);
  }

  let selectedCharacter: ProfileCharacter | null = null;
  if (params.action !== "skipped") {
    profile = await refreshProfileBeforeRaidSignup(profile, { raidId: raid.id, userId: discordId });
    const requestedCharacter = resolveProfileCharacterSelection(profile, params.characterKey);
    const eligibleCharacters = raidEligibleSignupCharacters(raid, profile);
    if (requestedCharacter && isRaidSubjectBlockedByMinItemLevel(raid, requestedCharacter)) {
      const blockedSignup = signupFromProfile(params.action, discordId, params.user.name || params.user.login || "Discord user", profile, requestedCharacter.key);
      return { ok: false, content: raidMinItemLevelBlockMessage(raid, blockedSignup) || "⛔ Цей персонаж не проходить мінімальний item level для рейду.", warning: null, blockedByMinItemLevel: true };
    }
    selectedCharacter = requestedCharacter || (eligibleCharacters.length === 1 ? eligibleCharacters[0] : null);
    if (!profile || !profile.characters.length || !selectedCharacter) {
      const minimum = raidMinimumItemLevel(raid);
      const allBlocked = Boolean(profile?.characters.length && raid.minItemLevelRequired && minimum && eligibleCharacters.length === 0);
      return {
        ok: false,
        content: !profile
          ? raidActionHelpText("login")
          : allBlocked
            ? `⛔ Немає доступних персонажів для запису: потрібен мінімум ${minimum} ilvl. Персонажі нижче порогу не показуються і не можуть бути записані.`
            : params.characterKey
              ? "❌ Обраного персонажа не знайдено у твоєму профілі або він недоступний для цього рейду. Онови персонажів у профілі й повтори запис."
              : raidActionHelpText("main"),
        components: raidActionHelpComponents(raid.id),
        blockedByProfile: !allBlocked,
        blockedByMinItemLevel: allBlocked,
      };
    }
  }

  const signup = signupFromProfile(params.action, discordId, params.user.name || params.user.login || "Discord user", profile, selectedCharacter?.key || params.characterKey);
  const block = raidMinItemLevelBlockMessage(raid, signup);
  if (block) return { ok: false, content: block, warning: null, blockedByMinItemLevel: true };
  const updated = await recordRaidSignup(raid.id, signup);
  const discordSynced = await syncRaidDiscordAfterSignup(updated);
  const warning = params.action === "skipped" ? null : raidMinItemLevelWarning(updated, signup);
  return { ok: true, content: attendanceSuccessText(params.action, updated, signup, discordSynced), warning, raid: updated, discordSynced };
}

export function raidLiveRevision(raid: RaidItem) {
  const signupsSignature = [...(raid.signups || [])]
    .sort((a, b) => `${a.discordId}:${a.characterName || ""}`.localeCompare(`${b.discordId}:${b.characterName || ""}`))
    .map((item) => [
      item.discordId,
      item.characterKey || "",
      item.status,
      item.role,
      item.characterName || "",
      item.realmSlug || item.realmName || "",
      item.itemLevel ?? "",
      item.grammaticalGender || "unspecified",
      item.verifiedGuild === false ? "other" : "guild",
      item.updatedAt || item.signedAt || "",
    ].join("~"))
    .join("|");

  return [
    raid.id,
    raid.status,
    raid.updatedAt || "",
    raid.channelId || "",
    raid.messageId || "",
    raid.raidLeaderName || "",
    raid.signups?.length || 0,
    signupsSignature,
  ].join("::");
}

export function dashboardRaidUrl(raidId: string) {
  const base = dashboardBaseUrl();
  return `${base}/raids/${encodeURIComponent(raidId)}`;
}
