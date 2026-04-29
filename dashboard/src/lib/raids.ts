import { FieldValue } from "firebase-admin/firestore";
import type { DashboardSession } from "@/lib/auth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { getMainCharacter, getProfileByDiscordUserId, getProfileById, type DashboardProfile, type ProfileCharacter } from "@/lib/profiles";
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
  status: RaidSignupStatus;
  role: RaidCharacterRole;
  characterName?: string | null;
  realmName?: string | null;
  realmSlug?: string | null;
  region?: string | null;
  className?: string | null;
  activeSpecName?: string | null;
  activeSpecId?: number | null;
  avatarUrl?: string | null;
  itemLevel?: number | null;
  profileUrl?: string | null;
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
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  createdByDiscordId: string;
  createdByName: string;
  createdByMain?: string | null;
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
const RAID_THUMBNAIL_ASSET_PATHS: Record<RaidDifficulty, string> = {
  normal: "/assets/raid-thumbnails/raid-normal.png",
  heroic: "/assets/raid-thumbnails/raid-heroic.png",
  mythic: "/assets/raid-thumbnails/raid-mythic.png",
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
  return options?.absolute ? absoluteDashboardAssetUrl(assetPath) : assetPath;
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

function characterRole(character?: ProfileCharacter | null): RaidCharacterRole {
  if (!character) return "dps";
  return resolveWowCharacterRole({
    className: character.className,
    activeSpecName: character.activeSpecName,
    activeSpecId: character.activeSpecId,
    activeSpecRole: character.activeSpecRole,
  });
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
  return {
    discordId,
    discordName: cleanString(item.discordName, 100) || "Discord user",
    profileId: cleanString(item.profileId, 80) || null,
    status: cleanSignupStatus(item.status),
    role: resolvedRole,
    characterName: cleanString(item.characterName, 80) || null,
    realmName: cleanString(item.realmName, 120) || null,
    realmSlug: cleanString(item.realmSlug, 120) || null,
    region: cleanString(item.region, 12) || null,
    className,
    activeSpecName,
    activeSpecId: Number.isFinite(activeSpecId) ? Math.floor(activeSpecId) : null,
    avatarUrl: cleanUrl(item.avatarUrl),
    itemLevel: Number.isFinite(ilvl) && ilvl > 0 ? Math.floor(ilvl) : null,
    profileUrl: cleanUrl(item.profileUrl),
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
    description: cleanString(data.description, 1200) || "Будьте готові до рейду та перевірте спорядження заздалегідь.",
    minItemLevel: cleanOptionalItemLevel(data.minItemLevel || data.min_item_level),
    minItemLevelRequired: cleanBoolean(data.minItemLevelRequired ?? data.min_item_level_required ?? data.blockBelowMinItemLevel),
    imageUrl,
    thumbnailUrl: resolveRaidThumbnailUrl({ difficulty, thumbnailUrl: data.thumbnailUrl as string | null, imageUrl }),
    createdByDiscordId: cleanString(data.createdByDiscordId, 32),
    createdByName: cleanString(data.createdByName, 120) || "@Raid Lead",
    createdByMain: cleanString(data.createdByMain, 160) || null,
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
  { tanks: 2, healers: 4, dps: 16 },
  { tanks: 2, healers: 6, dps: 22 },
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

function compositionFitsRoster(composition: RaidComposition, activeSize: number, roleDemand?: RaidComposition | null) {
  if (activeSize > compositionCapacity(composition)) return false;
  if (!roleDemand) return true;
  return roleDemand.healers <= composition.healers
    && roleDemand.dps <= composition.dps;
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
    ? BASE_RAID_COMPOSITION_TIERS.slice(0, 2)
    : BASE_RAID_COMPOSITION_TIERS;

  for (const tier of baseTiers) {
    if (compositionFitsRoster(tier, activeSize, demand)) return tier;
  }

  if (difficulty === "mythic") {
    return baseTiers[baseTiers.length - 1];
  }

  let dynamicTier = { ...BASE_RAID_COMPOSITION_TIERS[BASE_RAID_COMPOSITION_TIERS.length - 1] };
  let guard = 0;
  while (!compositionFitsRoster(dynamicTier, activeSize, demand) && guard < 20) {
    dynamicTier = {
      tanks: 2,
      healers: dynamicTier.healers + 2,
      dps: dynamicTier.dps + 8,
    };
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
  if (raid.channelId && raid.messageId) {
    try {
      await deleteDiscordRaidMessage({
        ref: { channelId: raid.channelId, messageId: raid.messageId },
        auditReason: `Raid deleted: ${raid.id}`,
      });
      discordDeleted = true;
    } catch (error) {
      console.warn("[raids] Failed to delete Discord raid message", { raidId: raid.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(raid.id).delete();
  return { ...raid, discordDeleted };
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

export async function listProfileRaidSignups(profile: Pick<DashboardProfile, "profileId" | "provider" | "providerUserId">, limit = 80): Promise<ProfileRaidSignup[]> {
  if (!profile?.profileId || !hasRaidStorage()) return [];

  const raids = await listRaids(Math.max(20, Math.min(120, limit)));
  return raids
    .map((raid) => {
      const signup = raid.signups.find((item) => signupMatchesProfile(item, profile));
      return signup ? { raid, signup } : null;
    })
    .filter((item): item is ProfileRaidSignup => Boolean(item))
    .sort((a, b) => `${b.raid.date} ${b.raid.time}`.localeCompare(`${a.raid.date} ${a.raid.time}`));
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
    description: cleanString(form.get("description"), 1200) || "Будьте готові до рейду та перевірте спорядження заздалегідь.",
    minItemLevel: cleanOptionalItemLevel(form.get("minItemLevel")),
    minItemLevelRequired: cleanBoolean(form.get("minItemLevelRequired")),
    imageUrl,
    thumbnailUrl: thumbnailUrl || resolveRaidThumbnailUrl({ difficulty, imageUrl }),
    createdByDiscordId: user.provider === "discord" ? user.id : "",
    createdByName: user.name || user.login || "Raid Lead",
    createdByMain: profileMainLabel(profile),
    consumables: cleanConsumables(form.get("consumables")),
    lootMode: cleanLootMode(form.get("lootMode")),
    composition: normalizeComposition(composition),
    channelId: cleanString(form.get("channelId"), 32),
  };
}

export async function saveRaidFromForm(form: FormData, user: DashboardSession, profile?: DashboardProfile | null) {
  if (!hasRaidStorage()) throw new Error("Firebase для рейдів не налаштований.");

  const db = getFirebaseAdminDb();
  const raidId = cleanRaidId(form.get("raidId"));
  const payload = formRaidPayload(form, user, profile);
  const ref = raidId ? db.collection(RAID_COLLECTION).doc(raidId) : db.collection(RAID_COLLECTION).doc();
  const snapshot = await ref.get();

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
  const late = item.status === "late" ? " ⏱" : "";
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
const MAX_RAID_PARTIES = 16;

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
  const groupCount = Math.max(2, Math.min(MAX_RAID_PARTIES, Math.ceil(Math.max(1, visibleRosterSize) / RAID_PARTY_SIZE)));
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
  const late = item.status === "late" ? " ⏱" : "";
  const text = `${base}${spec}${late}`.trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function compactSignupDiscordLine(item?: RaidSignup | null, max = 48) {
  if (!item) return "—";
  const base = item.characterName || item.discordName || "Гравець";
  const ilvl = item.itemLevel ? ` • ${item.itemLevel}` : "";
  const late = item.status === "late" ? " ⏱" : "";
  const value = `${base}${ilvl}${late}`.trim();
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function compactSignupDiscordLines(items: RaidSignup[], max = 44) {
  return items.length
    ? items.map((item) => `• ${compactSignupDiscordLine(item, max)}`).join("\n")
    : "—";
}

function partyDiscordText(party: RaidParty) {
  const tanks = [party.tank, ...party.dps.filter((item) => item.role === "tank")].filter(Boolean) as RaidSignup[];
  const healers = [party.healer, ...party.dps.filter((item) => item.role === "healer")].filter(Boolean) as RaidSignup[];
  const dps = party.dps.filter((item) => item.role === "dps");

  return truncateDiscordField([
    `**Танк**\n${compactSignupDiscordLines(tanks, 42)}`,
    `**Хіл**\n${compactSignupDiscordLines(healers, 42)}`,
    `**ДД**\n${compactSignupDiscordLines(dps, 40)}`,
  ].join("\n\n"), 700);
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
  const composition = raidAutoComposition(raid);
  const allParties = buildRaidParties(raid);
  const parties = allParties.slice(0, 8);
  const imageUrl = raid.imageUrl || undefined;
  const thumbUrl = resolveRaidThumbnailUrl(raid, { absolute: true }) || DEFAULT_RAID_IMAGE;
  const closed = isRaidClosed(raid);
  const omittedParties = allParties.length - parties.length;
  const rosterValue = [
    `${counts.roster} / ${raidAutoCapacity(raid)}`,
    compositionLongLabel(raid),
  ].filter(Boolean).join("\n");
  const minItemLevelValue = raid.minItemLevel
    ? [
        `**Мінімум:** ${raid.minItemLevel}`,
        raid.minItemLevelRequired
          ? "⛔ Запис блокується, якщо персонаж нижче порогу"
          : "⚠️ Лише попередження, запис не блокується",
      ].join("\n")
    : null;
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
    ...(minItemLevelValue ? [{ name: "⭐ Item level", value: minItemLevelValue, inline: true }] : []),
    {
      name: "⚔️ Ролі",
      value: `${counts.tanks}/${composition.tanks} танки • ${counts.healers}/${composition.healers} хіли • ${counts.dps}/${composition.dps} дд`,
      inline: false,
    },
    ...parties.map((party) => ({
      name: `Паті ${party.index}`,
      value: partyDiscordText(party),
      inline: true,
    })),
    ...(omittedParties > 0
      ? [{ name: "Ще групи", value: `Ще ${omittedParties} паті доступно на сторінці рейду:\n${dashboardRaidUrl(raid.id)}`, inline: false }]
      : []),
  ];
  const fields = compactDiscordFields(rawFields);

  const embed = normalizeDiscordEmbed({
    title: closed ? `${raidTitle(raid)} • Закрито` : raidTitle(raid),
    url: dashboardRaidUrl(raid.id),
    description: raid.description,
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

export function buildRaidAttendanceComponents(raidId: string, disabled = false) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "Підписатися", custom_id: buildRaidAttendanceCustomId(raidId, "going"), disabled },
        { type: 2, style: 2, label: "Пропустити", custom_id: buildRaidAttendanceCustomId(raidId, "skipped"), disabled },
        { type: 2, style: 4, label: "Затримаюсь", custom_id: buildRaidAttendanceCustomId(raidId, "late"), disabled },
      ],
    },
  ];
}

function isMissingDiscordMessageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /404|unknown message|10008/i.test(message);
}

export async function publishOrUpdateRaid(raid: RaidItem, channelId?: string | null) {
  const payload = buildRaidDiscordPayload(raid);
  const closed = isRaidClosed(raid);
  const components = buildRaidAttendanceComponents(raid.id, closed);
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
        auditReason: `Raid updated: ${raid.id}`,
      });
    } catch (error) {
      if (!isMissingDiscordMessageError(error)) throw error;
      message = await createDiscordRaidMessage({
        channelId: targetChannelId,
        content: payload.content,
        embed: payload.embed,
        components,
        auditReason: `Raid republished after missing message: ${raid.id}`,
      });
    }
  } else {
    message = await createDiscordRaidMessage({
      channelId: targetChannelId,
      content: payload.content,
      embed: payload.embed,
      components,
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
  if (!nextChannelId || !nextMessageId) throw new Error("Discord повернув некоректну відповідь без channel_id/message id.");
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

function signupFromProfile(status: RaidSignupStatus, userId: string, userName: string, profile?: DashboardProfile | null): RaidSignup {
  const main = profile ? getMainCharacter(profile) : null;
  const role = main ? characterRole(main) : "dps";
  const now = new Date().toISOString();

  return {
    discordId: userId,
    discordName: userName || profile?.displayName || "Discord user",
    profileId: profile?.profileId || null,
    status,
    role,
    characterName: main?.name || null,
    realmName: main?.realmName || main?.realmSlug || null,
    realmSlug: main?.realmSlug || null,
    region: main?.region || "eu",
    className: main?.className || null,
    activeSpecName: main?.activeSpecName || null,
    activeSpecId: Number.isFinite(Number(main?.activeSpecId)) ? Number(main?.activeSpecId) : null,
    avatarUrl: main?.avatarUrl || main?.renderUrl || main?.mediaUrl || null,
    itemLevel: Number.isFinite(Number(main?.itemLevel)) ? Number(main?.itemLevel) : null,
    profileUrl: main?.profileUrl || null,
    signedAt: now,
    updatedAt: now,
  };
}

export async function recordRaidSignup(raidId: string, signup: RaidSignup) {
  const id = cleanRaidId(raidId);
  if (!id || !hasRaidStorage()) throw new Error("Рейд не знайдено або Firebase не налаштований.");

  const ref = getFirebaseAdminDb().collection(RAID_COLLECTION).doc(id);
  await getFirebaseAdminDb().runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Рейд не знайдено.");
    const raid = normalizeRaid(snapshot.id, snapshot.data() || {});
    if (isRaidClosed(raid)) throw new Error("Рейд уже закритий, запис вимкнено.");
    if (raid.status !== "published") throw new Error("Запис доступний тільки для опублікованого рейду.");
    const block = raidMinItemLevelBlockMessage(raid, signup);
    if (block) throw new Error(block);
    const nextSignups = raid.signups.filter((item) => item.discordId !== signup.discordId);
    nextSignups.push({ ...signup, updatedAt: new Date().toISOString(), signedAt: signup.signedAt || new Date().toISOString() });
    transaction.set(ref, { signups: nextSignups, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  const updated = await getRaid(id);
  if (!updated) throw new Error("Рейд не знайдено після оновлення.");
  return updated;
}

async function syncRaidDiscordAfterSignup(raid: RaidItem) {
  if (raid.status !== "published" || !raid.channelId || !raid.messageId) return false;
  try {
    await publishOrUpdateRaid(raid, raid.channelId);
    return true;
  } catch (error) {
    console.warn("[raids] Discord message sync after signup failed", { raidId: raid.id, message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export function raidMinItemLevelBlockMessage(
  raid: Pick<RaidItem, "minItemLevel" | "minItemLevelRequired">,
  signup?: Pick<RaidSignup, "itemLevel" | "characterName" | "discordName" | "status"> | null,
) {
  const required = Number(raid.minItemLevel || 0);
  if (!raid.minItemLevelRequired || !required || !Number.isFinite(required) || signup?.status === "skipped") return null;

  const current = Number(signup?.itemLevel || 0);
  const name = signup?.characterName || signup?.discordName || "Персонаж";
  if (!current || !Number.isFinite(current)) {
    return `⛔ ${name}: item level не визначено. Для цього рейду потрібен мінімум ${Math.floor(required)}. Запис заблоковано.`;
  }
  if (current < required) {
    return `⛔ ${name}: item level ${Math.floor(current)} нижче мінімального порогу ${Math.floor(required)}. Запис заблоковано для цього рейду.`;
  }
  return null;
}

export function raidMinItemLevelWarning(
  raid: Pick<RaidItem, "minItemLevel" | "minItemLevelRequired">,
  signup?: Pick<RaidSignup, "itemLevel" | "characterName" | "discordName" | "status"> | null,
) {
  const required = Number(raid.minItemLevel || 0);
  const current = Number(signup?.itemLevel || 0);
  if (raid.minItemLevelRequired || signup?.status === "skipped" || !required || !Number.isFinite(required) || !current || !Number.isFinite(current) || current >= required) return null;
  const name = signup?.characterName || signup?.discordName || "Персонаж";
  return `⚠️ ${name}: item level ${Math.floor(current)} нижче мінімального порогу ${Math.floor(required)}. Ти записаний, але краще підняти спорядження перед рейдом.`;
}

function attendanceSuccessText(action: RaidSignupStatus, raid: RaidItem, signup?: RaidSignup | null, discordSynced = true) {
  const syncText = discordSynced
    ? "Склад Discord оновлено."
    : "Запис збережено, але Discord-повідомлення не оновилося автоматично. Офіцер може натиснути “Оновити Discord”.";
  if (action === "skipped") return `👌 Позначено, що ти пропускаєш: ${raidTitle(raid)}. ${syncText}`;
  const warning = raidMinItemLevelWarning(raid, signup);
  const base = action === "late"
    ? `⏱ Записано: ти затримаєшся на ${raidTitle(raid)}. ${syncText}`
    : `✅ Ти записаний на ${raidTitle(raid)}${signup?.characterName ? ` як ${signup.characterName}` : ""}. ${syncText}`;
  return warning ? `${base}\n\n${warning}` : base;
}

export async function handleRaidDiscordAction(params: {
  raidId: string;
  action: RaidSignupStatus;
  userId: string;
  userName: string;
}) {
  const raid = await getRaid(params.raidId);
  if (!raid) return { ok: false, content: "❌ Рейд не знайдено або він уже видалений." };
  if (isRaidClosed(raid)) return { ok: false, content: "🔒 Рейд уже закритий, запис вимкнено." };
  if (raid.status !== "published") return { ok: false, content: "❌ Запис доступний тільки для опублікованого рейду." };

  let profile: DashboardProfile | null = null;
  if (params.action !== "skipped") {
    profile = await getProfileByDiscordUserId(params.userId);
    const main = profile ? getMainCharacter(profile) : null;
    if (!profile || !main) {
      return {
        ok: false,
        content: "❌ Запис не зараховано: спочатку авторизуйся в панелі через Discord, додай персонажа Battle.net і вибери main.",
      };
    }
  } else {
    profile = await getProfileByDiscordUserId(params.userId).catch(() => null);
  }

  const signup = signupFromProfile(params.action, params.userId, params.userName, profile);
  const block = raidMinItemLevelBlockMessage(raid, signup);
  if (block) return { ok: false, content: block, warning: null, blockedByMinItemLevel: true };
  const updated = await recordRaidSignup(raid.id, signup);
  const discordSynced = await syncRaidDiscordAfterSignup(updated);
  const warning = params.action === "skipped" ? null : raidMinItemLevelWarning(updated, signup);
  return { ok: true, content: attendanceSuccessText(params.action, updated, signup, discordSynced), warning, raid: updated, discordSynced };
}

export async function handleRaidSessionAction(params: {
  raidId: string;
  action: RaidSignupStatus;
  user: DashboardSession;
}) {
  const raid = await getRaid(params.raidId);
  if (!raid) return { ok: false, content: "❌ Рейд не знайдено або він уже видалений." };
  if (isRaidClosed(raid)) return { ok: false, content: "🔒 Рейд уже закритий, запис вимкнено." };
  if (raid.status !== "published") return { ok: false, content: "❌ Запис доступний тільки для опублікованого рейду." };

  const discordId = params.user.provider === "discord" && /^\d{16,25}$/.test(params.user.id) ? params.user.id : "";
  if (!discordId) {
    return { ok: false, content: "❌ Для запису на рейд потрібно увійти через Discord." };
  }

  let profile: DashboardProfile | null = null;
  if (params.user.profileId) {
    profile = await getProfileById(params.user.profileId).catch(() => null);
  }
  if (!profile) {
    profile = await getProfileByDiscordUserId(discordId).catch(() => null);
  }

  if (params.action !== "skipped") {
    const main = profile ? getMainCharacter(profile) : null;
    if (!profile || !main) {
      return {
        ok: false,
        content: "❌ Запис не зараховано: додай персонажа Battle.net у профілі та вибери main.",
      };
    }
  }

  const signup = signupFromProfile(params.action, discordId, params.user.name || params.user.login || "Discord user", profile);
  const block = raidMinItemLevelBlockMessage(raid, signup);
  if (block) return { ok: false, content: block, warning: null, blockedByMinItemLevel: true };
  const updated = await recordRaidSignup(raid.id, signup);
  const discordSynced = await syncRaidDiscordAfterSignup(updated);
  const warning = params.action === "skipped" ? null : raidMinItemLevelWarning(updated, signup);
  return { ok: true, content: attendanceSuccessText(params.action, updated, signup, discordSynced), warning, raid: updated, discordSynced };
}

export function dashboardRaidUrl(raidId: string) {
  const base = dashboardBaseUrl();
  return `${base}/raids/${encodeURIComponent(raidId)}`;
}
