import { randomUUID } from "crypto";
import type { DashboardSession } from "@/lib/auth";
import { getMainCharacter, getProfileByDiscordUserId, type DashboardProfile, type ProfileCharacter } from "@/lib/profiles";
import { resolveWowCharacterRole } from "@/lib/wowRoles";
import { normalizeCharacterKey } from "@/lib/wowCharacters";
import { firebaseRead, firebaseWrite, firebaseUnavailableMessage } from "@/lib/firebaseAccess";
import { clearRuntimeCachedValue, clearRuntimeCachedValuesByPrefix } from "@/lib/runtimeResilience";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import {
  createDiscordRaidMessage,
  deleteDiscordRaidMessage,
  discordMessageUrl,
  editDiscordRaidMessage,
  getDiscordDefaultChannelId,
  normalizeDiscordEmbed,
  type DiscordMessageRef,
} from "@/lib/discordAdmin";

export {
  RAID_POLL_AVAILABILITY_OPTIONS,
  RAID_POLL_CHARACTER_SELECTOR_OPTIONS,
  RAID_POLL_CLOSE_OPTIONS,
  RAID_POLL_DAYS,
  RAID_POLL_DESCRIPTION,
  RAID_POLL_SCHEDULE_GROUPS,
  RAID_POLL_TIMES,
  raidPollAvailabilityLabel,
  raidPollClassColor,
  raidPollRoleLabel,
} from "@/lib/raidPollShared";
export type {
  RaidPollAvailability,
  RaidPollCreateInput,
  RaidPollDay,
  RaidPollDifficulty,
  RaidPollItem,
  RaidPollRole,
  RaidPollSchedule,
  RaidPollStatus,
  RaidPollTime,
  RaidPollVote,
  RaidPollVoteResult,
} from "@/lib/raidPollShared";
import {
  RAID_POLL_AVAILABILITY_OPTIONS,
  RAID_POLL_CHARACTER_SELECTOR_OPTIONS,
  RAID_POLL_CLOSE_OPTIONS,
  RAID_POLL_DAYS,
  RAID_POLL_DESCRIPTION,
  RAID_POLL_SCHEDULE_GROUPS,
  RAID_POLL_TIMES,
  raidPollAvailabilityLabel,
  raidPollRoleLabel,
  type RaidPollAvailability,
  type RaidPollCreateInput,
  type RaidPollDay,
  type RaidPollDifficulty,
  type RaidPollItem,
  type RaidPollRole,
  type RaidPollSchedule,
  type RaidPollStatus,
  type RaidPollTime,
  type RaidPollVote,
  type RaidPollVoteResult,
} from "@/lib/raidPollShared";

const RAID_POLL_COLLECTION = "dashboardRaidPolls";
const RAID_POLL_ACTION_PREFIX = "mbv1:poll";
const RAID_POLL_LIST_CACHE_KEY = "raid-polls:list:v1";
const RAID_POLL_CACHE_TTL_MS = 20_000;
const RAID_POLL_GET_CACHE_PREFIX = "raid-poll:";

function clearRaidPollRuntimeCaches(pollId?: string | null) {
  const id = cleanString(pollId, 80);
  if (id) clearRuntimeCachedValue(`${RAID_POLL_GET_CACHE_PREFIX}${id}`);
  clearRuntimeCachedValuesByPrefix(`${RAID_POLL_LIST_CACHE_KEY}:`);
}

function isMissingDiscordMessageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /404|unknown message|10008/i.test(message);
}


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

function cleanPollDescription(value: unknown) {
  const description = cleanString(value, 900);
  return description.length >= 20 ? description : RAID_POLL_DESCRIPTION;
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

function cleanPollAvailability(value: unknown): RaidPollAvailability | null {
  const text = cleanString(value, 12).toLowerCase();
  if (text === "absent" || text === "не можу" || text === "cannot") return "absent";
  return cleanPollTime(text);
}

function cleanPollSchedule(value: unknown): RaidPollSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const schedule: RaidPollSchedule = {};
  for (const day of RAID_POLL_DAYS) {
    const availability = cleanPollAvailability(raw[day.value]);
    if (availability) schedule[day.value] = availability;
  }
  return schedule;
}

function scheduleFromLegacy(selectedDays: RaidPollDay[], selectedTime: RaidPollTime | null): RaidPollSchedule {
  const schedule: RaidPollSchedule = {};
  for (const day of selectedDays) schedule[day] = selectedTime || "19:00";
  return schedule;
}

function activeDaysFromSchedule(schedule: RaidPollSchedule) {
  return RAID_POLL_DAYS
    .map((day) => day.value)
    .filter((day): day is RaidPollDay => Boolean(schedule[day] && schedule[day] !== "absent"));
}

function firstTimeFromSchedule(schedule: RaidPollSchedule): RaidPollTime | null {
  for (const day of RAID_POLL_DAYS) {
    const value = schedule[day.value];
    if (value && value !== "absent") return value;
  }
  return null;
}

function parseScheduleValues(values: unknown): RaidPollSchedule {
  const schedule: RaidPollSchedule = {};
  const list = Array.isArray(values) ? values : String(values || "").split(",");
  for (const item of list) {
    const text = cleanString(item, 32);
    const [dayRaw, availabilityRaw] = text.split(":");
    const day = cleanPollDay(dayRaw);
    const availability = cleanPollAvailability(availabilityRaw);
    if (day && availability) schedule[day] = availability;
  }
  return schedule;
}

function cleanCharacterSelector(value: unknown) {
  const text = cleanString(value, 260);
  if (/^alt_[1-9][0-9]?$/.test(text) || text === "main") return text;
  const key = normalizeCharacterKey(text);
  return key || text;
}

function cleanCharacterRole(value: unknown): RaidPollRole | null {
  const text = cleanString(value, 20).toLowerCase();
  if (text === "tank") return "tank";
  if (text === "healer") return "healer";
  if (text === "dps") return "dps";
  return null;
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
  const selectedDays = cleanPollDays(data.selectedDays || data.selected_days);
  const selectedTime = cleanPollTime(data.selectedTime || data.selected_time);
  const explicitSchedule = cleanPollSchedule(data.schedule);
  const schedule = Object.keys(explicitSchedule).length ? explicitSchedule : scheduleFromLegacy(selectedDays, selectedTime);
  const normalizedSelectedDays = activeDaysFromSchedule(schedule);
  const normalizedSelectedTime = selectedTime || firstTimeFromSchedule(schedule);

  return {
    discordId,
    discordName: cleanString(data.discordName || data.discord_name, 100) || "Discord user",
    guildId: cleanSnowflake(data.guildId || data.guild_id),
    guildName: cleanString(data.guildName || data.guild_name, 120) || "Discord server",
    selectedDays: normalizedSelectedDays,
    selectedTime: normalizedSelectedTime,
    schedule,
    characterKey: cleanString(data.characterKey || data.character_key, 260) || null,
    characterName: cleanString(data.characterName || data.character_name || data.charName || data.char_name, 80) || null,
    characterClass: cleanString(data.characterClass || data.character_class || data.charClass || data.char_class, 80) || null,
    characterRole: cleanCharacterRole(data.characterRole || data.character_role || data.charRole || data.char_role),
    characterRealm: cleanString(data.characterRealm || data.character_realm || data.realmName || data.realm_name, 100) || null,
    characterRegion: cleanString(data.characterRegion || data.character_region || data.region, 12) || null,
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
    days: cleanPollDays(data.days).length ? cleanPollDays(data.days) : RAID_POLL_DAYS.map((day) => day.value),
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
  const absent = Object.fromEntries(RAID_POLL_DAYS.map((day) => [day.value, 0])) as Record<RaidPollDay, number>;
  const times = Object.fromEntries(RAID_POLL_TIMES.map((time) => [time, 0])) as Record<RaidPollTime, number>;
  const dayTimes = Object.fromEntries(
    RAID_POLL_DAYS.map((day) => [day.value, Object.fromEntries(RAID_POLL_TIMES.map((time) => [time, 0]))]),
  ) as Record<RaidPollDay, Record<RaidPollTime, number>>;

  for (const vote of poll.votes) {
    const schedule = vote.schedule && Object.keys(vote.schedule).length
      ? vote.schedule
      : scheduleFromLegacy(vote.selectedDays, vote.selectedTime);
    for (const day of RAID_POLL_DAYS) {
      const value = schedule[day.value];
      if (!value) continue;
      if (value === "absent") {
        absent[day.value] += 1;
      } else {
        days[day.value] += 1;
        times[value] += 1;
        dayTimes[day.value][value] += 1;
      }
    }
  }

  return { days, absent, times, dayTimes, total: poll.votes.length };
}

export function pollVotersForDay(poll: Pick<RaidPollItem, "votes">, day: RaidPollDay) {
  return poll.votes.filter((vote) => {
    const schedule = vote.schedule && Object.keys(vote.schedule).length ? vote.schedule : scheduleFromLegacy(vote.selectedDays, vote.selectedTime);
    const value = schedule[day];
    return Boolean(value && value !== "absent");
  });
}

export function pollAbsentVotersForDay(poll: Pick<RaidPollItem, "votes">, day: RaidPollDay) {
  return poll.votes.filter((vote) => {
    const schedule = vote.schedule && Object.keys(vote.schedule).length ? vote.schedule : scheduleFromLegacy(vote.selectedDays, vote.selectedTime);
    return schedule[day] === "absent";
  });
}

export function raidPollVoteSchedule(vote: RaidPollVote) {
  return vote.schedule && Object.keys(vote.schedule).length ? vote.schedule : scheduleFromLegacy(vote.selectedDays, vote.selectedTime);
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

function pollActiveDays(poll: Pick<RaidPollItem, "days">) {
  const allowed = poll.days?.length ? poll.days : RAID_POLL_DAYS.map((day) => day.value);
  return RAID_POLL_DAYS.filter((day) => allowed.includes(day.value));
}

function scheduleSummary(schedule: RaidPollSchedule, days: RaidPollDay[] = RAID_POLL_DAYS.map((day) => day.value)) {
  const parts = days
    .map((day) => {
      const value = schedule[day];
      return value ? `${dayLabel(day)} ${raidPollAvailabilityLabel(value)}` : null;
    })
    .filter(Boolean) as string[];
  return parts.length ? parts.join(" • ") : "розклад ще не вибрано";
}

function characterSummary(vote: RaidPollVote) {
  const name = vote.characterName || vote.discordName;
  const details = [vote.characterClass, vote.characterRole ? raidPollRoleLabel(vote.characterRole) : null].filter(Boolean).join(" • ");
  return details ? `${name} (${details})` : name;
}

function dayCountsDiscordValue(poll: RaidPollItem) {
  const counts = pollVoteCounts(poll);
  return pollActiveDays(poll).map((day) => {
    const cant = counts.absent[day.value] ? ` • ❌ ${counts.absent[day.value]}` : "";
    return `${day.emoji} **${day.label}** — ${counts.days[day.value]}${cant}`;
  }).join("\n") || "—";
}

function timeCountsDiscordValue(poll: RaidPollItem) {
  const counts = pollVoteCounts(poll);
  return RAID_POLL_TIMES.map((time) => `**${time}** — ${counts.times[time]}`).join("\n");
}

function votersDiscordValue(poll: RaidPollItem) {
  if (!poll.votes.length) return "—";
  const days = pollActiveDays(poll).map((day) => day.value);
  return poll.votes.slice(0, 12).map((vote) => {
    return `• ${characterSummary(vote)}: ${scheduleSummary(raidPollVoteSchedule(vote), days)}`;
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

function scheduleOptionLabel(day: RaidPollDay, availability: RaidPollAvailability) {
  return `${dayLabel(day)} • ${raidPollAvailabilityLabel(availability)}`.slice(0, 100);
}

function scheduleOptionDescription(day: RaidPollDay, availability: RaidPollAvailability) {
  return availability === "absent"
    ? `${dayFullLabel(day)}: гравець позначає, що не може бути в рейді`
    : `${dayFullLabel(day)}: готовий/готова на ${availability}`;
}

function scheduleSelectOptions(days: RaidPollDay[]) {
  return days.flatMap((day) => RAID_POLL_AVAILABILITY_OPTIONS.map((availability) => ({
    label: scheduleOptionLabel(day, availability),
    value: `${day}:${availability}`,
    description: scheduleOptionDescription(day, availability).slice(0, 100),
  })));
}

export function buildRaidPollDiscordComponents(poll: Pick<RaidPollItem, "id" | "status" | "closesAtMs" | "days">) {
  const disabled = poll.status === "closed" || poll.closesAtMs <= Date.now();
  const activeDays = pollActiveDays(poll).map((day) => day.value);
  const dayGroups = RAID_POLL_SCHEDULE_GROUPS
    .map((group) => ({ ...group, days: group.days.filter((day) => activeDays.includes(day)) }))
    .filter((group) => group.days.length > 0);

  // Публічні Discord components є спільними для всіх глядачів повідомлення.
  // Тут навмисно немає user-specific default values і списку конкретних персонажів.
  // Персонаж резолвиться персонально на бекенді через Discord ID користувача й dashboard-профіль.
  const rows = [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_character:${poll.id}`,
          placeholder: disabled ? "Голосування завершено" : "Обрати персонажа з dashboard-профілю",
          min_values: 1,
          max_values: 1,
          disabled,
          options: RAID_POLL_CHARACTER_SELECTOR_OPTIONS,
        },
      ],
    },
    ...dayGroups.slice(0, 3).map((group) => ({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_schedule_${group.key}:${poll.id}`,
          placeholder: disabled ? "Голосування завершено" : `${group.label}: час або «Не можу»`,
          min_values: 1,
          max_values: group.days.length,
          disabled,
          options: scheduleSelectOptions(group.days),
        },
      ],
    })),
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: "Деталі на сайті", url: dashboardPollUrl(poll.id) },
      ],
    },
  ];

  return rows.slice(0, 5);
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

export async function getRaidPoll(pollId: string, options: { closeDue?: boolean; bypassCache?: boolean } = {}) {
  if (!hasRaidPollStorage()) return null;
  const poll = await firebaseRead<RaidPollItem | null>(
    "raid",
    `raid-poll:${pollId}`,
    async () => {
      const snap = await pollRef(pollId).get();
      if (!snap.exists) return null;
      return normalizeRaidPoll(snap.id, snap.data() || {});
    },
    { ttlMs: 10_000, fallback: () => null, logEvent: "raid_polls.read_failed", bypassCache: options.bypassCache },
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

export async function saveRaidPollFromInput(input: RaidPollCreateInput, user: DashboardSession) {
  if (!hasRaidPollStorage()) throw new Error(firebaseUnavailableMessage("raid", "write"));

  const title = cleanString(input.title, 160);
  if (title.length < 3) throw new Error("Вкажи назву рейду для голосування.");

  const difficulty = cleanDifficulty(input.difficulty);
  const closeAfterMinutes = cleanCloseAfterMinutes(input.closeAfterMinutes);
  const description = cleanPollDescription(input.description);
  const days = cleanPollDays(input.days);
  const activeDays = days.length ? days : RAID_POLL_DAYS.map((day) => day.value);
  const now = new Date();
  const nowIso = now.toISOString();
  const closesAtMs = now.getTime() + closeAfterMinutes * 60 * 1000;
  const id = newPollId();
  const channelId = cleanSnowflake(input.channelId) || getDiscordDefaultChannelId();

  const basePoll: RaidPollItem = {
    id,
    title,
    difficulty,
    description,
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
    days: activeDays,
    votes: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await firebaseWrite("raid", `raid-poll:create:${id}`, async () => {
    await pollRef(id).set({
      ...basePoll,
      days: activeDays,
      votes: [],
      votesByDiscordId: {},
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
    });
    return true;
  }, { logEvent: "raid_polls.create_failed" });
  clearRaidPollRuntimeCaches(id);

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
  clearRaidPollRuntimeCaches(id);

  return publishedPoll;
}

export async function saveRaidPollFromForm(form: FormData, user: DashboardSession) {
  return saveRaidPollFromInput({
    title: form.get("title"),
    difficulty: form.get("difficulty"),
    description: form.get("description"),
    channelId: form.get("channelId"),
    closeAfterMinutes: form.get("closeAfterMinutes"),
    days: form.getAll("days"),
  }, user);
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

  clearRaidPollRuntimeCaches(updated.id);
  await editPollDiscordMessage(updated).catch(() => null);
  return updated;
}

function orderedProfileCharacters(profile: DashboardProfile | null | undefined) {
  if (!profile?.characters?.length) return [] as ProfileCharacter[];
  const main = getMainCharacter(profile);
  const rest = profile.characters.filter((character) => character.key !== main?.key);
  return main ? [main, ...rest] : rest;
}

function resolvePollProfileCharacter(profile: DashboardProfile | null, selectorInput: unknown) {
  const selector = cleanCharacterSelector(selectorInput || "main");
  const characters = orderedProfileCharacters(profile);
  if (!characters.length) return null;
  if (selector === "main") return characters[0] || null;
  const altMatch = selector.match(/^alt_(\d+)$/);
  if (altMatch) return characters[Math.max(1, Number(altMatch[1]))] || null;
  const key = normalizeCharacterKey(selector);
  return key ? characters.find((character) => normalizeCharacterKey(character.key) === key) || null : null;
}

function voteCharacterPayload(profile: DashboardProfile | null, selector: unknown) {
  const character = resolvePollProfileCharacter(profile, selector);
  if (!character) return null;
  return {
    characterKey: character.key || null,
    characterName: character.name || null,
    characterClass: character.className || null,
    characterRole: resolveWowCharacterRole({
      className: character.className,
      activeSpecName: character.activeSpecName,
      activeSpecId: character.activeSpecId,
      activeSpecRole: character.activeSpecRole,
    }),
    characterRealm: character.realmName || character.realmSlug || null,
    characterRegion: character.region || "eu",
  } satisfies Pick<RaidPollVote, "characterKey" | "characterName" | "characterClass" | "characterRole" | "characterRealm" | "characterRegion">;
}

function normalizeVoteScheduleForPoll(poll: RaidPollItem, schedule: RaidPollSchedule) {
  const allowed = new Set((poll.days?.length ? poll.days : RAID_POLL_DAYS.map((day) => day.value)) as RaidPollDay[]);
  const next: RaidPollSchedule = {};
  for (const day of RAID_POLL_DAYS) {
    if (!allowed.has(day.value)) continue;
    const value = schedule[day.value];
    if (value) next[day.value] = value;
  }
  return next;
}

function shouldAutoAttachMainCharacter(kind: "days" | "time" | "schedule" | "character", existing: RaidPollVote | undefined) {
  if (kind === "character") return false;
  return !existing?.characterKey && !existing?.characterName;
}

function dedupeSchedulePatch(schedule: RaidPollSchedule) {
  const next: RaidPollSchedule = {};
  for (const day of RAID_POLL_DAYS) {
    const value = schedule[day.value];
    if (value) next[day.value] = value;
  }
  return next;
}

export async function handleRaidPollDiscordVote(params: {
  pollId: string;
  kind: "days" | "time" | "schedule" | "character";
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
  const profile = await getProfileByDiscordUserId(userId).catch(() => null);
  const selectedCharacter = params.kind === "character" ? voteCharacterPayload(profile, params.values[0] || "main") : null;

  if (params.kind === "character" && !selectedCharacter) {
    return {
      ok: false,
      content: "⚠️ Не знайшов персонажа у твоєму dashboard-профілі. Привʼяжи Battle.net/персонажів на сайті або обери інший пункт персонажа.",
    };
  }

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
      const previousSchedule = existing ? raidPollVoteSchedule(existing) : {};
      const previousVote: RaidPollVote = existing || {
        discordId: userId,
        discordName: cleanString(params.userName, 100) || "Discord user",
        guildId: cleanSnowflake(params.guildId),
        guildName: cleanString(params.guildName, 120) || "Discord server",
        selectedDays: [],
        selectedTime: null,
        schedule: {},
        characterKey: null,
        characterName: null,
        characterClass: null,
        characterRole: null,
        characterRealm: null,
        characterRegion: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      let nextSchedule: RaidPollSchedule = { ...previousSchedule };
      if (params.kind === "schedule") {
        nextSchedule = dedupeSchedulePatch({ ...nextSchedule, ...parseScheduleValues(params.values) });
      } else if (params.kind === "days") {
        const legacyDays = cleanPollDays(params.values);
        const fallbackTime = previousVote.selectedTime || firstTimeFromSchedule(previousSchedule) || "19:00";
        for (const day of legacyDays) nextSchedule[day] = fallbackTime;
      } else if (params.kind === "time") {
        const nextTime = cleanPollTime(params.values[0]);
        if (nextTime) {
          const days = activeDaysFromSchedule(previousSchedule).length ? activeDaysFromSchedule(previousSchedule) : poll.days;
          for (const day of days) nextSchedule[day] = nextTime;
        }
      }

      nextSchedule = normalizeVoteScheduleForPoll(poll, nextSchedule);
      const autoCharacter = shouldAutoAttachMainCharacter(params.kind, existing) ? voteCharacterPayload(profile, "main") : null;
      const nextSelectedDays = activeDaysFromSchedule(nextSchedule);
      const nextSelectedTime = firstTimeFromSchedule(nextSchedule);
      const nextVote: RaidPollVote = {
        ...previousVote,
        discordName: cleanString(params.userName, 100) || previousVote.discordName,
        guildId: cleanSnowflake(params.guildId) || previousVote.guildId,
        guildName: cleanString(params.guildName, 120) || previousVote.guildName,
        selectedDays: nextSelectedDays,
        selectedTime: nextSelectedTime,
        schedule: nextSchedule,
        ...(autoCharacter || {}),
        ...(selectedCharacter || {}),
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

      const characterLabel = nextVote.characterName
        ? `${nextVote.characterName}${nextVote.characterClass ? ` • ${nextVote.characterClass}` : ""}${nextVote.characterRole ? ` • ${raidPollRoleLabel(nextVote.characterRole)}` : ""}`
        : "персонаж ще не вибраний";
      return {
        ok: true,
        poll: changedPoll,
        content: `✅ Голос збережено для **${raidPollTitle(poll)}**.\nПерсонаж: **${characterLabel}**\nРозклад: **${scheduleSummary(nextSchedule, poll.days)}**`,
      };
    });
  }, { logEvent: "raid_polls.vote_failed" });

  if (result.poll) {
    clearRaidPollRuntimeCaches(result.poll.id);
    await editPollDiscordMessage(result.poll).catch(() => null);
  }

  return result;
}

export async function deleteRaidPoll(pollId: string) {
  if (!hasRaidPollStorage()) throw new Error(firebaseUnavailableMessage("raid", "write"));

  const ref = pollRef(pollId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Рейд-пул не знайдено або його вже видалено.");

  const poll = normalizeRaidPoll(snap.id, snap.data() || {});
  let discordDeleted = false;
  let discordDeleteFailed = false;

  if (poll.channelId && poll.messageId) {
    try {
      await deleteDiscordRaidMessage({
        ref: { channelId: poll.channelId, messageId: poll.messageId },
        auditReason: `Raid poll manually deleted from dashboard: ${poll.id}`,
      });
      discordDeleted = true;
    } catch (error) {
      if (isMissingDiscordMessageError(error)) {
        discordDeleted = true;
      } else {
        discordDeleteFailed = true;
        console.warn("[raidPolls] Failed to delete Discord poll message", {
          pollId: poll.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await firebaseWrite("raid", `raid-poll:delete:${poll.id}`, async () => {
    await ref.delete();
    return true;
  }, { logEvent: "raid_polls.delete_failed" });

  clearRaidPollRuntimeCaches(poll.id);
  return { poll, discordDeleted, discordDeleteFailed };
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
