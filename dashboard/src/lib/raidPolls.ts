import { randomUUID } from "crypto";
import type { DashboardSession } from "@/lib/auth";
import { firebaseRead, firebaseWrite, firebaseUnavailableMessage } from "@/lib/firebaseAccess";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import {
  createDiscordRaidMessage,
  discordMessageUrl,
  editDiscordRaidMessage,
  getDiscordDefaultChannelId,
  normalizeDiscordEmbed,
  type DiscordMessageRef,
} from "@/lib/discordAdmin";

export type RaidPollStatus = "open" | "closed";
export type RaidPollDifficulty = "normal" | "heroic" | "mythic";
export type RaidPollDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type RaidPollTime = "19:00" | "19:30" | "20:00" | "20:30" | "21:00";

export type RaidPollVote = {
  discordId: string;
  discordName: string;
  guildId: string;
  guildName: string;
  selectedDays: RaidPollDay[];
  selectedTime: RaidPollTime | null;
  createdAt: string;
  updatedAt: string;
};

export type RaidPollItem = {
  id: string;
  title: string;
  difficulty: RaidPollDifficulty;
  description: string;
  status: RaidPollStatus;
  closeAfterMinutes: number;
  closesAt: string;
  closesAtMs: number;
  closedAt?: string | null;
  closedReason?: "manual" | "auto" | null;
  createdByDiscordId: string;
  createdByName: string;
  channelId?: string | null;
  messageId?: string | null;
  messageUrl?: string | null;
  votes: RaidPollVote[];
  createdAt: string;
  updatedAt: string;
};

export type RaidPollVoteResult = {
  ok: boolean;
  content: string;
  poll?: RaidPollItem;
  closed?: boolean;
};

const RAID_POLL_COLLECTION = "dashboardRaidPolls";
const RAID_POLL_ACTION_PREFIX = "mbv1:poll";
const RAID_POLL_DESCRIPTION = "Будь ласка, оберіть дні та час, коли ви готові взяти участь у гільдійському рейді. Голос враховується для формування основного складу.";
const RAID_POLL_LIST_CACHE_KEY = "raid-polls:list:v1";
const RAID_POLL_CACHE_TTL_MS = 20_000;

export const RAID_POLL_DAYS: Array<{ value: RaidPollDay; label: string; fullLabel: string; emoji: string }> = [
  { value: "mon", label: "Пн", fullLabel: "Понеділок", emoji: "1️⃣" },
  { value: "tue", label: "Вт", fullLabel: "Вівторок", emoji: "2️⃣" },
  { value: "wed", label: "Ср", fullLabel: "Середа", emoji: "3️⃣" },
  { value: "thu", label: "Чт", fullLabel: "Четвер", emoji: "4️⃣" },
  { value: "fri", label: "Пт", fullLabel: "Пʼятниця", emoji: "5️⃣" },
  { value: "sat", label: "Сб", fullLabel: "Субота", emoji: "6️⃣" },
  { value: "sun", label: "Нд", fullLabel: "Неділя", emoji: "7️⃣" },
];

export const RAID_POLL_TIMES: RaidPollTime[] = ["19:00", "19:30", "20:00", "20:30", "21:00"];

export const RAID_POLL_CLOSE_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 120, label: "2 години" },
  { minutes: 12 * 60, label: "12 годин" },
  { minutes: 24 * 60, label: "1 доба" },
  { minutes: 48 * 60, label: "2 доби" },
];

const DIFFICULTY_LABELS: Record<RaidPollDifficulty, string> = {
  normal: "Нормал",
  heroic: "Героїк",
  mythic: "Міфік",
};

const DIFFICULTY_COLORS: Record<RaidPollDifficulty, number> = {
  normal: 0x2f81f7,
  heroic: 0x9b4dff,
  mythic: 0xed4245,
};

function cleanString(value: unknown, max = 300) {
  return Array.from(String(value || "").replace(/\r\n/g, "\n").trim()).slice(0, max).join("");
}

function cleanSnowflake(value: unknown) {
  const text = cleanString(value, 32);
  return /^\d{16,25}$/.test(text) ? text : "";
}

function cleanDifficulty(value: unknown): RaidPollDifficulty {
  const key = cleanString(value, 40).toLowerCase();
  if (key === "normal" || key === "нормал") return "normal";
  if (key === "mythic" || key === "міфік" || key === "мф") return "mythic";
  return "heroic";
}

function cleanCloseAfterMinutes(value: unknown) {
  const minutes = Math.floor(Number(value) || 0);
  const allowed = RAID_POLL_CLOSE_OPTIONS.map((item) => item.minutes);
  return allowed.includes(minutes) ? minutes : 12 * 60;
}

function cleanPollDay(value: unknown): RaidPollDay | null {
  const key = cleanString(value, 12).toLowerCase();
  return RAID_POLL_DAYS.some((day) => day.value === key) ? key as RaidPollDay : null;
}

function cleanPollDays(values: unknown): RaidPollDay[] {
  const list = Array.isArray(values) ? values : String(values || "").split(",");
  return Array.from(new Set(list.map(cleanPollDay).filter(Boolean) as RaidPollDay[]));
}

function cleanPollTime(value: unknown): RaidPollTime | null {
  const text = cleanString(value, 10);
  return RAID_POLL_TIMES.includes(text as RaidPollTime) ? text as RaidPollTime : null;
}

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") return maybeTimestamp.toDate().toISOString();
  return null;
}

function safeIso(value: unknown, fallback = new Date().toISOString()) {
  const text = timestampToIso(value) || cleanString(value, 40);
  if (!text) return fallback;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}

function safeMs(value: unknown, fallback = Date.now()) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function dayLabel(value: RaidPollDay) {
  return RAID_POLL_DAYS.find((day) => day.value === value)?.label || value;
}

function dayFullLabel(value: RaidPollDay) {
  return RAID_POLL_DAYS.find((day) => day.value === value)?.fullLabel || value;
}

export function raidPollDifficultyLabel(value: RaidPollDifficulty) {
  return DIFFICULTY_LABELS[value] || DIFFICULTY_LABELS.heroic;
}

export function raidPollTitle(poll: Pick<RaidPollItem, "title" | "difficulty">) {
  return `${poll.title} — ${raidPollDifficultyLabel(poll.difficulty)}`;
}

export function raidPollStatusLabel(poll: Pick<RaidPollItem, "status" | "closesAtMs">) {
  if (poll.status === "closed") return "Закрито";
  return poll.closesAtMs <= Date.now() ? "Завершується" : "Відкрите";
}

function dashboardBaseUrl() {
  return String(process.env.ADMIN_DASHBOARD_URL || process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "https://admin.lihvodruida.pp.ua").replace(/\/$/, "");
}

export function dashboardPollUrl(pollId: string) {
  return `${dashboardBaseUrl()}/polls/${encodeURIComponent(pollId)}`;
}

export function hasRaidPollStorage() {
  return hasFirebaseProfileConfig();
}

function newPollId() {
  return randomUUID().replace(/-/g, "").slice(0, 18);
}

function normalizeVote(raw: unknown, discordIdFallback = ""): RaidPollVote | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const discordId = cleanSnowflake(data.discordId || data.discord_id || discordIdFallback);
  if (!discordId) return null;
  const now = new Date().toISOString();
  return {
    discordId,
    discordName: cleanString(data.discordName || data.discord_name, 100) || "Discord user",
    guildId: cleanSnowflake(data.guildId || data.guild_id),
    guildName: cleanString(data.guildName || data.guild_name, 120) || "Discord server",
    selectedDays: cleanPollDays(data.selectedDays || data.selected_days),
    selectedTime: cleanPollTime(data.selectedTime || data.selected_time),
    createdAt: safeIso(data.createdAt || data.created_at, now),
    updatedAt: safeIso(data.updatedAt || data.updated_at, now),
  };
}

function normalizeVotes(data: Record<string, unknown>): RaidPollVote[] {
  const fromMap = data.votesByDiscordId && typeof data.votesByDiscordId === "object" && !Array.isArray(data.votesByDiscordId)
    ? Object.entries(data.votesByDiscordId as Record<string, unknown>).map(([discordId, vote]) => normalizeVote(vote, discordId)).filter(Boolean) as RaidPollVote[]
    : [];
  const fromArray = Array.isArray(data.votes)
    ? data.votes.map((vote) => normalizeVote(vote)).filter(Boolean) as RaidPollVote[]
    : [];
  const byId = new Map<string, RaidPollVote>();
  for (const vote of [...fromArray, ...fromMap]) byId.set(vote.discordId, vote);
  return Array.from(byId.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function normalizeRaidPoll(id: string, data: Record<string, unknown>): RaidPollItem {
  const now = new Date().toISOString();
  const closeAfterMinutes = cleanCloseAfterMinutes(data.closeAfterMinutes || data.close_after_minutes);
  const createdAt = safeIso(data.createdAt || data.created_at, now);
  const closesAtMs = safeMs(data.closesAtMs || data.closes_at_ms, Date.parse(createdAt) + closeAfterMinutes * 60 * 1000);
  const status = cleanString(data.status, 20).toLowerCase() === "closed" || closesAtMs <= Date.now() && cleanString(data.status, 20).toLowerCase() !== "open"
    ? "closed"
    : cleanString(data.status, 20).toLowerCase() === "closed" ? "closed" : "open";

  return {
    id,
    title: cleanString(data.title, 160) || "Рейд-пул",
    difficulty: cleanDifficulty(data.difficulty),
    description: cleanString(data.description, 900) || RAID_POLL_DESCRIPTION,
    status,
    closeAfterMinutes,
    closesAt: new Date(closesAtMs).toISOString(),
    closesAtMs,
    closedAt: timestampToIso(data.closedAt || data.closed_at),
    closedReason: cleanString(data.closedReason || data.closed_reason, 20) === "manual" ? "manual" : cleanString(data.closedReason || data.closed_reason, 20) === "auto" ? "auto" : null,
    createdByDiscordId: cleanSnowflake(data.createdByDiscordId || data.created_by_discord_id),
    createdByName: cleanString(data.createdByName || data.created_by_name, 120) || "Dashboard",
    channelId: cleanSnowflake(data.channelId || data.channel_id) || null,
    messageId: cleanSnowflake(data.messageId || data.message_id) || null,
    messageUrl: cleanString(data.messageUrl || data.message_url, 2048) || null,
    votes: normalizeVotes(data),
    createdAt,
    updatedAt: safeIso(data.updatedAt || data.updated_at, createdAt),
  };
}

function pollRef(pollId: string) {
  const id = cleanString(pollId, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("Некоректний ID рейд-пулу.");
  return getFirebaseAdminDb().collection(RAID_POLL_COLLECTION).doc(id);
}

export function pollVoteCounts(poll: Pick<RaidPollItem, "votes">) {
  const days = Object.fromEntries(RAID_POLL_DAYS.map((day) => [day.value, 0])) as Record<RaidPollDay, number>;
  const times = Object.fromEntries(RAID_POLL_TIMES.map((time) => [time, 0])) as Record<RaidPollTime, number>;
  for (const vote of poll.votes) {
    for (const day of vote.selectedDays) days[day] += 1;
    if (vote.selectedTime) times[vote.selectedTime] += 1;
  }
  return { days, times, total: poll.votes.length };
}

export function pollVotersForDay(poll: Pick<RaidPollItem, "votes">, day: RaidPollDay) {
  return poll.votes.filter((vote) => vote.selectedDays.includes(day));
}

function formatDiscordTimestamp(ms: number) {
  const stamp = Math.floor(ms / 1000);
  return `<t:${stamp}:f> • <t:${stamp}:R>`;
}

function topDaySummary(poll: RaidPollItem) {
  const counts = pollVoteCounts(poll);
  const sorted = RAID_POLL_DAYS
    .map((day) => ({ day: day.value, count: counts.days[day.value] }))
    .sort((a, b) => b.count - a.count || RAID_POLL_DAYS.findIndex((day) => day.value === a.day) - RAID_POLL_DAYS.findIndex((day) => day.value === b.day));
  const best = sorted.filter((item) => item.count > 0 && item.count === sorted[0]?.count);
  if (!best.length) return "Ще немає голосів.";
  return best.map((item) => `${dayLabel(item.day)} — ${item.count}`).join(" • ");
}

function dayCountsDiscordValue(poll: RaidPollItem) {
  const counts = pollVoteCounts(poll);
  return RAID_POLL_DAYS.map((day) => `${day.emoji} **${day.label}** — ${counts.days[day.value]}`).join("\n");
}

function timeCountsDiscordValue(poll: RaidPollItem) {
  const counts = pollVoteCounts(poll);
  return RAID_POLL_TIMES.map((time) => `**${time}** — ${counts.times[time]}`).join("\n");
}

function votersDiscordValue(poll: RaidPollItem) {
  if (!poll.votes.length) return "—";
  return poll.votes.slice(0, 16).map((vote) => {
    const days = vote.selectedDays.length ? vote.selectedDays.map(dayLabel).join(", ") : "дні не вибрано";
    const time = vote.selectedTime || "час не вибрано";
    return `• ${vote.discordName}: ${days} • ${time}`;
  }).join("\n").slice(0, 1000);
}

export function buildRaidPollDiscordPayload(poll: RaidPollItem) {
  const counts = pollVoteCounts(poll);
  const closed = poll.status === "closed" || poll.closesAtMs <= Date.now();
  const fields = [
    { name: "📌 Статус", value: closed ? "🔒 **Голосування завершено**" : `🟢 **Голосування відкрите**\nЗакриття: ${formatDiscordTimestamp(poll.closesAtMs)}`, inline: false },
    { name: "🗓️ Голоси за днями", value: dayCountsDiscordValue(poll), inline: true },
    { name: "⏰ Голоси за часом", value: timeCountsDiscordValue(poll), inline: true },
    { name: "👥 Проголосували", value: `${counts.total}`, inline: true },
    { name: "🏆 Найкращий день зараз", value: topDaySummary(poll), inline: false },
    { name: "🧾 Останні голоси", value: votersDiscordValue(poll), inline: false },
  ];

  const embed = normalizeDiscordEmbed({
    title: `${closed ? "🔒" : "🗳️"} ${raidPollTitle(poll)}`,
    description: poll.description,
    color: closed ? 0x5865f2 : DIFFICULTY_COLORS[poll.difficulty],
    url: dashboardPollUrl(poll.id),
    fields,
    footer: { text: closed ? "Mistblossom Vanguard • Рейд-пул завершено" : "Mistblossom Vanguard • Обери дні та час нижче" },
    timestamp: new Date().toISOString(),
  });

  return {
    content: closed ? "🔒 **Голосування завершено. Фінальний результат нижче.**" : "🗳️ **Рейд-пул відкрито. Оберіть доступні дні та час.**",
    embed,
    components: buildRaidPollDiscordComponents(poll),
  };
}

export function buildRaidPollDiscordComponents(poll: Pick<RaidPollItem, "id" | "status" | "closesAtMs">) {
  const disabled = poll.status === "closed" || poll.closesAtMs <= Date.now();
  // Публічні Discord components є спільними для всіх глядачів повідомлення.
  // Тому тут не ставимо user-specific selected/default values — персональний стан повертається тільки в ephemeral-відповіді після кліку.
  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_days:${poll.id}`,
          placeholder: disabled ? "Голосування завершено" : "Оберіть доступні дні рейду",
          min_values: 1,
          max_values: RAID_POLL_DAYS.length,
          disabled,
          options: RAID_POLL_DAYS.map((day) => ({ label: `${day.fullLabel} (${day.label})`, value: day.value, emoji: { name: day.emoji } })),
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_time:${poll.id}`,
          placeholder: disabled ? "Голосування завершено" : "Оберіть зручний час рейду",
          min_values: 1,
          max_values: 1,
          disabled,
          options: RAID_POLL_TIMES.map((time) => ({ label: time, value: time })),
        },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: "Деталі на сайті", url: dashboardPollUrl(poll.id) },
      ],
    },
  ];
}

async function editPollDiscordMessage(poll: RaidPollItem) {
  if (!poll.channelId || !poll.messageId) return;
  const payload = buildRaidPollDiscordPayload(poll);
  await editDiscordRaidMessage({
    ref: { channelId: poll.channelId, messageId: poll.messageId },
    content: payload.content,
    embed: payload.embed,
    components: payload.components,
    auditReason: `Raid poll sync: ${poll.id}`,
  });
}

async function publishPollDiscordMessage(poll: RaidPollItem, channelIdInput?: string | null) {
  const channelId = cleanSnowflake(channelIdInput) || cleanSnowflake(poll.channelId) || getDiscordDefaultChannelId();
  if (!channelId) throw new Error("Discord-канал для рейд-пулу не вибрано.");
  const payload = buildRaidPollDiscordPayload(poll);
  const message = await createDiscordRaidMessage({
    channelId,
    content: payload.content,
    embed: payload.embed,
    components: payload.components,
    auditReason: `Raid poll created from dashboard: ${poll.id}`,
  });
  const messageId = cleanSnowflake((message as Record<string, unknown>)?.id || (message as Record<string, unknown>)?.message_id);
  const finalChannelId = cleanSnowflake((message as Record<string, unknown>)?.channel_id || channelId);
  if (!messageId || !finalChannelId) throw new Error("Discord не підтвердив створення повідомлення рейд-пулу.");
  return { channelId: finalChannelId, messageId, messageUrl: discordMessageUrl(finalChannelId, messageId) };
}

export async function getRaidPoll(pollId: string, options: { closeDue?: boolean } = {}) {
  if (!hasRaidPollStorage()) return null;
  const poll = await firebaseRead<RaidPollItem | null>(
    "raid",
    `raid-poll:${pollId}`,
    async () => {
      const snap = await pollRef(pollId).get();
      if (!snap.exists) return null;
      return normalizeRaidPoll(snap.id, snap.data() || {});
    },
    { ttlMs: 10_000, fallback: () => null, logEvent: "raid_polls.read_failed" },
  );
  if (poll && options.closeDue !== false) return closeDueRaidPoll(poll);
  return poll;
}

export async function listRaidPolls(limit = 100) {
  if (!hasRaidPollStorage()) return [];
  await closeDueRaidPolls().catch(() => null);
  return firebaseRead<RaidPollItem[]>(
    "raid",
    `${RAID_POLL_LIST_CACHE_KEY}:${limit}`,
    async () => {
      const snap = await getFirebaseAdminDb()
        .collection(RAID_POLL_COLLECTION)
        .orderBy("createdAtMs", "desc")
        .limit(Math.max(1, Math.min(200, Math.floor(limit))))
        .get();
      return snap.docs.map((doc) => normalizeRaidPoll(doc.id, doc.data() || {}));
    },
    { ttlMs: RAID_POLL_CACHE_TTL_MS, fallback: () => [], logEvent: "raid_polls.list_failed" },
  );
}

export async function saveRaidPollFromForm(form: FormData, user: DashboardSession) {
  if (!hasRaidPollStorage()) throw new Error(firebaseUnavailableMessage("raid", "write"));

  const title = cleanString(form.get("title"), 160);
  if (title.length < 3) throw new Error("Вкажи назву рейду для голосування.");

  const difficulty = cleanDifficulty(form.get("difficulty"));
  const closeAfterMinutes = cleanCloseAfterMinutes(form.get("closeAfterMinutes"));
  const now = new Date();
  const nowIso = now.toISOString();
  const closesAtMs = now.getTime() + closeAfterMinutes * 60 * 1000;
  const id = newPollId();
  const channelId = cleanSnowflake(form.get("channelId")) || getDiscordDefaultChannelId();

  const basePoll: RaidPollItem = {
    id,
    title,
    difficulty,
    description: RAID_POLL_DESCRIPTION,
    status: "open",
    closeAfterMinutes,
    closesAt: new Date(closesAtMs).toISOString(),
    closesAtMs,
    closedAt: null,
    closedReason: null,
    createdByDiscordId: user.provider === "discord" ? user.id : "",
    createdByName: user.name || "Dashboard",
    channelId: channelId || null,
    messageId: null,
    messageUrl: null,
    votes: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await firebaseWrite("raid", `raid-poll:create:${id}`, async () => {
    await pollRef(id).set({
      ...basePoll,
      votes: [],
      votesByDiscordId: {},
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
    });
    return true;
  }, { logEvent: "raid_polls.create_failed" });

  const published = await publishPollDiscordMessage(basePoll, channelId);
  const publishedPoll = { ...basePoll, ...published, updatedAt: new Date().toISOString() };
  await firebaseWrite("raid", `raid-poll:publish:${id}`, async () => {
    await pollRef(id).update({
      channelId: published.channelId,
      messageId: published.messageId,
      messageUrl: published.messageUrl,
      updatedAt: publishedPoll.updatedAt,
      updatedAtMs: Date.now(),
    });
    return true;
  }, { logEvent: "raid_polls.publish_ref_failed" });

  return publishedPoll;
}

export async function closeDueRaidPoll(input: RaidPollItem) {
  if (input.status === "closed" || input.closesAtMs > Date.now()) return input;
  return closeRaidPoll(input.id, "auto", { silentIfClosed: true });
}

export async function closeDueRaidPolls() {
  if (!hasRaidPollStorage()) return 0;
  const snap = await getFirebaseAdminDb()
    .collection(RAID_POLL_COLLECTION)
    .where("status", "==", "open")
    .where("closesAtMs", "<=", Date.now())
    .limit(20)
    .get();
  let closed = 0;
  for (const doc of snap.docs) {
    await closeRaidPoll(doc.id, "auto", { silentIfClosed: true }).then(() => { closed += 1; }).catch(() => null);
  }
  return closed;
}

export async function closeRaidPoll(pollId: string, reason: "manual" | "auto" = "manual", options: { silentIfClosed?: boolean } = {}) {
  if (!hasRaidPollStorage()) throw new Error(firebaseUnavailableMessage("raid", "write"));
  const closedAt = new Date().toISOString();
  const updated = await firebaseWrite<RaidPollItem>("raid", `raid-poll:close:${pollId}:${reason}`, async () => {
    const ref = pollRef(pollId);
    return getFirebaseAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Рейд-пул не знайдено.");
      const poll = normalizeRaidPoll(snap.id, snap.data() || {});
      if (poll.status === "closed") {
        if (options.silentIfClosed) return poll;
        throw new Error("Рейд-пул уже закритий.");
      }
      tx.update(ref, {
        status: "closed",
        closedAt,
        closedReason: reason,
        updatedAt: closedAt,
        updatedAtMs: Date.now(),
      });
      return { ...poll, status: "closed", closedAt, closedReason: reason, updatedAt: closedAt };
    });
  }, { logEvent: "raid_polls.close_failed" });

  await editPollDiscordMessage(updated).catch(() => null);
  return updated;
}

export async function handleRaidPollDiscordVote(params: {
  pollId: string;
  kind: "days" | "time";
  values: string[];
  userId: string;
  userName: string;
  guildId?: string | null;
  guildName?: string | null;
  messageRef?: DiscordMessageRef | null;
}): Promise<RaidPollVoteResult> {
  if (!hasRaidPollStorage()) {
    return { ok: false, content: "❌ Голосування тимчасово недоступне: Firebase не налаштований." };
  }

  const userId = cleanSnowflake(params.userId);
  if (!userId) return { ok: false, content: "❌ Не вдалося визначити Discord ID користувача." };

  const nowIso = new Date().toISOString();
  let changedPoll: RaidPollItem | null = null;
  const result = await firebaseWrite<RaidPollVoteResult>("raid", `raid-poll:vote:${params.pollId}:${userId}:${params.kind}`, async () => {
    const ref = pollRef(params.pollId);
    return getFirebaseAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, content: "❌ Рейд-пул не знайдено або його було видалено." };

      const poll = normalizeRaidPoll(snap.id, snap.data() || {});
      if (poll.status === "closed" || poll.closesAtMs <= Date.now()) {
        const closedPoll = poll.status === "closed" ? poll : { ...poll, status: "closed" as RaidPollStatus, closedAt: nowIso, closedReason: "auto" as const, updatedAt: nowIso };
        tx.update(ref, {
          status: "closed",
          closedAt: poll.closedAt || nowIso,
          closedReason: poll.closedReason || "auto",
          updatedAt: nowIso,
          updatedAtMs: Date.now(),
        });
        changedPoll = closedPoll;
        return { ok: false, closed: true, poll: closedPoll, content: "🔒 Голосування вже завершено. Нові голоси не приймаються." };
      }

      const existing = poll.votes.find((vote) => vote.discordId === userId);
      const previousVote: RaidPollVote = existing || {
        discordId: userId,
        discordName: cleanString(params.userName, 100) || "Discord user",
        guildId: cleanSnowflake(params.guildId),
        guildName: cleanString(params.guildName, 120) || "Discord server",
        selectedDays: [],
        selectedTime: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const nextVote: RaidPollVote = {
        ...previousVote,
        discordName: cleanString(params.userName, 100) || previousVote.discordName,
        guildId: cleanSnowflake(params.guildId) || previousVote.guildId,
        guildName: cleanString(params.guildName, 120) || previousVote.guildName,
        selectedDays: params.kind === "days" ? cleanPollDays(params.values) : previousVote.selectedDays,
        selectedTime: params.kind === "time" ? cleanPollTime(params.values[0]) : previousVote.selectedTime,
        updatedAt: nowIso,
      };

      tx.update(ref, {
        [`votesByDiscordId.${userId}`]: nextVote,
        updatedAt: nowIso,
        updatedAtMs: Date.now(),
        ...(params.messageRef?.channelId ? { channelId: params.messageRef.channelId } : {}),
        ...(params.messageRef?.messageId ? { messageId: params.messageRef.messageId } : {}),
      });

      const votes = poll.votes.filter((vote) => vote.discordId !== userId).concat(nextVote);
      changedPoll = {
        ...poll,
        channelId: params.messageRef?.channelId || poll.channelId,
        messageId: params.messageRef?.messageId || poll.messageId,
        messageUrl: params.messageRef?.channelId && params.messageRef?.messageId ? discordMessageUrl(params.messageRef.channelId, params.messageRef.messageId) : poll.messageUrl,
        votes,
        updatedAt: nowIso,
      };
      const daysLabel = nextVote.selectedDays.length ? nextVote.selectedDays.map(dayLabel).join(", ") : "дні ще не вибрано";
      const timeLabel = nextVote.selectedTime || "час ще не вибрано";
      return {
        ok: true,
        poll: changedPoll,
        content: `✅ Голос збережено для **${raidPollTitle(poll)}**.\nДні: **${daysLabel}**\nЧас: **${timeLabel}**`,
      };
    });
  }, { logEvent: "raid_polls.vote_failed" });

  if (changedPoll) {
    await editPollDiscordMessage(changedPoll).catch(() => null);
  }

  return result;
}

export function raidPollDayLabel(value: RaidPollDay) {
  return dayLabel(value);
}

export function raidPollDayFullLabel(value: RaidPollDay) {
  return dayFullLabel(value);
}

export function raidPollDescription() {
  return RAID_POLL_DESCRIPTION;
}
