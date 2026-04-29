import { FieldValue } from "firebase-admin/firestore";
import type { DashboardSession } from "@/lib/auth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { getMainCharacter, getProfileByDiscordUserId, getProfileById, type DashboardProfile, type ProfileCharacter } from "@/lib/profiles";
import {
  createDiscordEmbedMessage,
  discordMessageUrl,
  editDiscordEmbedMessage,
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
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  createdByDiscordId: string;
  createdByName: string;
  createdByMain?: string | null;
  consumables: RaidConsumables;
  lootMode: RaidLootMode;
  composition: RaidComposition;
  status: "draft" | "published";
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
  if (["tank", "танк", "protection", "blood", "guardian", "brewmaster", "vengeance"].some((item) => key.includes(item))) return "tank";
  if (["heal", "healer", "хіл", "лікар", "restoration", "holy", "discipline", "mistweaver", "preservation"].some((item) => key.includes(item))) return "healer";
  return "dps";
}

function characterRole(character?: ProfileCharacter | null): RaidCharacterRole {
  const classText = `${character?.className || ""} ${character?.name || ""}`;
  return cleanRole(classText);
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

function normalizeSignup(value: unknown): RaidSignup | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const discordId = cleanString(item.discordId, 32);
  if (!/^\d{16,25}$/.test(discordId)) return null;

  const ilvl = Number(item.itemLevel);
  return {
    discordId,
    discordName: cleanString(item.discordName, 100) || "Discord user",
    profileId: cleanString(item.profileId, 80) || null,
    status: cleanSignupStatus(item.status),
    role: cleanRole(item.role),
    characterName: cleanString(item.characterName, 80) || null,
    realmName: cleanString(item.realmName, 120) || null,
    realmSlug: cleanString(item.realmSlug, 120) || null,
    region: cleanString(item.region, 12) || null,
    className: cleanString(item.className, 80) || null,
    avatarUrl: cleanUrl(item.avatarUrl),
    itemLevel: Number.isFinite(ilvl) && ilvl > 0 ? Math.floor(ilvl) : null,
    profileUrl: cleanUrl(item.profileUrl),
    signedAt: timestampToIso(item.signedAt) || null,
    updatedAt: timestampToIso(item.updatedAt) || null,
  };
}

function normalizeRaid(id: string, data: Record<string, unknown>): RaidItem {
  const status = data.status === "published" ? "published" : "draft";
  const signups = Array.isArray(data.signups)
    ? data.signups.map(normalizeSignup).filter(Boolean) as RaidSignup[]
    : [];

  return {
    id,
    title: cleanString(data.title, 120) || "Рейд",
    difficulty: cleanDifficulty(data.difficulty),
    date: cleanString(data.date, 20),
    time: cleanString(data.time, 20),
    description: cleanString(data.description, 1200) || "Будьте готові до рейду та перевірте спорядження заздалегідь.",
    imageUrl: cleanUrl(data.imageUrl),
    thumbnailUrl: cleanUrl(data.thumbnailUrl),
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

export function autoRaidCompositionForSize(size: number, difficulty: RaidDifficulty): RaidComposition {
  const activeSize = Math.max(0, Math.floor(Number.isFinite(size) ? size : 0));

  if (difficulty === "mythic") {
    return activeSize <= 10
      ? { tanks: 2, healers: 2, dps: 6 }
      : { tanks: 2, healers: 4, dps: 16 };
  }

  if (activeSize <= 10) return { tanks: 2, healers: 2, dps: 6 };
  if (activeSize <= 22) return { tanks: 2, healers: 4, dps: 16 };
  if (activeSize <= 30) return { tanks: 2, healers: 6, dps: 22 };

  const extraBlocks = Math.ceil((activeSize - 30) / 10);
  return {
    tanks: 2,
    healers: 6 + extraBlocks * 2,
    dps: 22 + extraBlocks * 8,
  };
}

export function raidAutoComposition(raid: RaidAutoInput): RaidComposition {
  const activeSize = raidActiveRosterSize(raid);
  return autoRaidCompositionForSize(activeSize, raid.difficulty);
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
  return snapshot.docs
    .map((doc) => normalizeRaid(doc.id, doc.data() || {}))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) || (Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || "")));
}

export async function getRaid(raidId: string): Promise<RaidItem | null> {
  const id = cleanRaidId(raidId);
  if (!id || !hasRaidStorage()) return null;
  const snapshot = await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(id).get();
  if (!snapshot.exists) return null;
  return normalizeRaid(snapshot.id, snapshot.data() || {});
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

  return {
    title: cleanString(form.get("title"), 120) || "Рейд",
    difficulty: cleanDifficulty(form.get("difficulty")),
    date: cleanString(form.get("date"), 20),
    time: cleanString(form.get("time"), 20),
    description: cleanString(form.get("description"), 1200) || "Будьте готові до рейду та перевірте спорядження заздалегідь.",
    imageUrl: cleanUrl(form.get("imageUrl")),
    thumbnailUrl: cleanUrl(form.get("thumbnailUrl")),
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

function compositionLongLabel(raid: RaidAutoInput) {
  const composition = raidAutoComposition(raid);
  return `${composition.tanks} танки / ${composition.healers} хіли / ${composition.dps} дд`;
}

function signupName(item?: RaidSignup | null) {
  if (!item) return "—";
  const name = item.characterName || item.discordName || "Гравець";
  const ilvl = item.itemLevel ? ` ${item.itemLevel} ilvl` : "";
  const late = item.status === "late" ? " ⏱" : "";
  return `${name}${ilvl}${late}`;
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

export function buildRaidParties(raid: Pick<RaidItem, "difficulty" | "composition" | "signups">): RaidParty[] {
  const roster = rosterForGroups(raid);
  const composition = raidAutoComposition(raid);
  const hardCap = raid.difficulty === "mythic" ? 4 : 16;
  const groupCount = Math.max(2, Math.min(hardCap, composition.healers));
  const groupOrder = [1, 3, 2, 4, 5, 7, 6, 8, 9, 11, 10, 12, 13, 15, 14, 16];
  const orderedIndexes = groupOrder.filter((index) => index <= groupCount);
  const parties: RaidParty[] = orderedIndexes.map((index) => ({ index, dps: [], late: [], members: [] }));

  const primaryTank = roster.tanks[0] || null;
  const secondaryTank = roster.tanks[1] || primaryTank || null;
  for (const party of parties) {
    party.tank = party.index % 2 === 1 ? primaryTank : secondaryTank;
  }

  const healers = [...roster.healers];
  for (const party of parties) {
    party.healer = healers.shift() || null;
  }

  const dpsPool = [...roster.dps, ...healers];
  const dpsSlotsByParty = Math.max(1, Math.ceil(composition.dps / Math.max(1, parties.length)));
  let cursor = 0;

  for (const member of dpsPool.slice(0, composition.dps)) {
    let placed = false;
    for (let attempt = 0; attempt < parties.length; attempt += 1) {
      const party = parties[(cursor + attempt) % parties.length];
      if (party.dps.length < dpsSlotsByParty) {
        party.dps.push(member);
        cursor = (cursor + attempt + 1) % parties.length;
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }

  for (const party of parties) {
    party.members = [party.tank, party.healer, ...party.dps].filter(Boolean) as RaidSignup[];
    party.late = party.members.filter((item) => item.status === "late");
  }

  return parties.sort((a, b) => a.index - b.index);
}

function partyDiscordText(party: RaidParty) {
  const rows = [
    `T  ${signupName(party.tank)}`,
    `H  ${signupName(party.healer)}`,
    ...party.dps.map((item) => `DD ${signupName(item)}`),
  ];
  return truncateDiscordField("```text\n" + rows.join("\n") + "\n```", 1024);
}

export function buildRaidDiscordPayload(raid: RaidItem) {
  const counts = raidRosterCounts(raid);
  const composition = raidAutoComposition(raid);
  const parties = buildRaidParties(raid);
  const imageUrl = raid.imageUrl || undefined;
  const thumbUrl = raid.thumbnailUrl || raid.imageUrl || DEFAULT_RAID_IMAGE;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "📅 Дата", value: dateTimeLabel(raid), inline: true },
    { name: "👤 Створив", value: `${raid.createdByName}${raid.createdByMain ? `\nmain: ${raid.createdByMain}` : ""}`, inline: true },
    { name: "🧪 Розхідники", value: raidConsumablesLabel(raid.consumables), inline: true },
    { name: "🎁 Лут", value: raidLootLabel(raid.lootMode), inline: true },
    { name: "👥 Склад рейду", value: `${counts.roster} / ${raidAutoCapacity(raid)}\n${compositionLongLabel(raid)}`, inline: true },
    { name: "⚔️ Ролі", value: `${counts.tanks}/${composition.tanks} танки • ${counts.healers}/${composition.healers} хіли • ${counts.dps}/${composition.dps} дд`, inline: true },
    ...parties.map((party) => ({ name: `Паті ${party.index}`, value: partyDiscordText(party), inline: true })),
  ];

  const embed = {
    title: raidTitle(raid),
    url: dashboardRaidUrl(raid.id),
    description: raid.description,
    color: DIFFICULTY_COLORS[raid.difficulty],
    thumbnail: thumbUrl ? { url: thumbUrl } : undefined,
    image: imageUrl ? { url: imageUrl } : undefined,
    fields,
    footer: { text: "Кнопки автоматично оновлюють склад рейду після кожної заявки." },
    timestamp: new Date().toISOString(),
  };

  return {
    content: `**${raidTitle(raid)}** • ${dateTimeLabel(raid)}`,
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

export function buildRaidAttendanceComponents(raidId: string) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "Підписатися", custom_id: buildRaidAttendanceCustomId(raidId, "going") },
        { type: 2, style: 2, label: "Пропустити", custom_id: buildRaidAttendanceCustomId(raidId, "skipped") },
        { type: 2, style: 4, label: "Затримаюсь", custom_id: buildRaidAttendanceCustomId(raidId, "late") },
      ],
    },
  ];
}

export async function publishOrUpdateRaid(raid: RaidItem, channelId?: string | null) {
  const payload = buildRaidDiscordPayload(raid);
  const components = buildRaidAttendanceComponents(raid.id);
  const targetChannelId = cleanString(channelId || raid.channelId, 32);
  if (!targetChannelId && !raid.channelId) throw new Error("Канал Discord для рейду не вибрано.");

  let message: any;
  if (raid.channelId && raid.messageId && (!targetChannelId || targetChannelId === raid.channelId)) {
    const existingRef: DiscordMessageRef = { channelId: raid.channelId, messageId: raid.messageId };
    message = await editDiscordEmbedMessage({
      ref: existingRef,
      content: payload.content,
      embed: payload.embed,
      components,
      auditReason: `Raid updated: ${raid.id}`,
    });
  } else {
    message = await createDiscordEmbedMessage({
      channelId: targetChannelId,
      content: payload.content,
      embed: payload.embed,
      components,
      auditReason: `Raid published: ${raid.id}`,
    });
  }

  const nextChannelId = String(message?.channel_id || raid.channelId || targetChannelId);
  const nextMessageId = String(message?.id || raid.messageId || "");
  const messageUrl = nextChannelId && nextMessageId ? discordMessageUrl(nextChannelId, nextMessageId) : null;

  await getFirebaseAdminDb().collection(RAID_COLLECTION).doc(raid.id).set({
    status: "published",
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
    const result = await publishOrUpdateRaid(raid, form.get("channelId") ? cleanString(form.get("channelId"), 32) : raid.channelId);
    return { raid: { ...raid, status: "published" as const, ...result }, published: result.messageUrl };
  }
  return { raid, published: null };
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
    const nextSignups = raid.signups.filter((item) => item.discordId !== signup.discordId);
    nextSignups.push({ ...signup, updatedAt: new Date().toISOString(), signedAt: signup.signedAt || new Date().toISOString() });
    transaction.set(ref, { signups: nextSignups, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  const updated = await getRaid(id);
  if (!updated) throw new Error("Рейд не знайдено після оновлення.");
  if (updated.status === "published" && updated.channelId && updated.messageId) {
    await publishOrUpdateRaid(updated, updated.channelId);
  }
  return updated;
}

function attendanceSuccessText(action: RaidSignupStatus, raid: RaidItem, signup?: RaidSignup | null) {
  if (action === "skipped") return `👌 Позначено, що ти пропускаєш: ${raidTitle(raid)}.`;
  if (action === "late") return `⏱ Записано: ти затримаєшся на ${raidTitle(raid)}. Склад Discord оновлено.`;
  return `✅ Ти записаний на ${raidTitle(raid)}${signup?.characterName ? ` як ${signup.characterName}` : ""}. Склад Discord оновлено.`;
}

export async function handleRaidDiscordAction(params: {
  raidId: string;
  action: RaidSignupStatus;
  userId: string;
  userName: string;
}) {
  const raid = await getRaid(params.raidId);
  if (!raid) return { ok: false, content: "❌ Рейд не знайдено або він уже видалений." };
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
  const updated = await recordRaidSignup(raid.id, signup);
  return { ok: true, content: attendanceSuccessText(params.action, updated, signup), raid: updated };
}

export async function handleRaidSessionAction(params: {
  raidId: string;
  action: RaidSignupStatus;
  user: DashboardSession;
}) {
  const raid = await getRaid(params.raidId);
  if (!raid) return { ok: false, content: "❌ Рейд не знайдено або він уже видалений." };
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
  const updated = await recordRaidSignup(raid.id, signup);
  return { ok: true, content: attendanceSuccessText(params.action, updated, signup), raid: updated };
}

export function dashboardRaidUrl(raidId: string) {
  const base = String(process.env.ADMIN_DASHBOARD_URL || process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "https://admin.lihvodruida.pp.ua").replace(/\/$/, "");
  return `${base}/raids/${encodeURIComponent(raidId)}`;
}
