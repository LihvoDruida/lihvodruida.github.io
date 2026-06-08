import { randomUUID } from "crypto";
import {
  FieldValue,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import type { DashboardSession } from "@/lib/auth";
import { getMainCharacter, getProfileByDiscordUserId, refreshProfileCharactersForRaidSignup, type DashboardProfile, type ProfileCharacter } from "@/lib/profiles";
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
  RAID_POLL_CLOSE_OPTIONS,
  RAID_POLL_DAYS,
  RAID_POLL_DESCRIPTION,
  RAID_POLL_ROLE_OPTIONS,
  RAID_POLL_SCHEDULE_GROUPS,
  RAID_POLL_REPEAT_TIMES,
  RAID_POLL_TIMES,
  raidPollAvailabilityLabel,
  raidPollClassColor,
  raidPollRoleLabel,
} from "@/lib/raidPollShared";
export type {
  RaidPollAvailability,
  RaidPollCreateInput,
  RaidPollUpdateInput,
  RaidPollDay,
  RaidPollDifficulty,
  RaidPollItem,
  RaidPollRepeatTime,
  RaidPollRole,
  RaidPollSchedule,
  RaidPollScheduleValue,
  RaidPollStatus,
  RaidPollTime,
  RaidPollVote,
  RaidPollVoteResult,
} from "@/lib/raidPollShared";
import {
  RAID_POLL_AVAILABILITY_OPTIONS,
  RAID_POLL_CLOSE_OPTIONS,
  RAID_POLL_DAYS,
  RAID_POLL_DESCRIPTION,
  RAID_POLL_ROLE_OPTIONS,
  RAID_POLL_SCHEDULE_GROUPS,
  RAID_POLL_REPEAT_TIMES,
  RAID_POLL_TIMES,
  raidPollAvailabilityLabel,
  raidPollRoleLabel,
  type RaidPollAvailability,
  type RaidPollCreateInput,
  type RaidPollUpdateInput,
  type RaidPollDay,
  type RaidPollRepeatTime,
  type RaidPollDifficulty,
  type RaidPollItem,
  type RaidPollRole,
  type RaidPollSchedule,
  type RaidPollScheduleValue,
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

function cleanSnowflakeIds(values: unknown) {
  const list = Array.isArray(values) ? values : typeof values === "string" ? values.split(/[\s,]+/) : [];
  return Array.from(new Set(list.map(cleanSnowflake).filter(Boolean))).slice(0, 25);
}

function cleanBoolean(value: unknown) {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  const text = cleanString(value, 20).toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on" || text === "так";
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

function cleanRepeatWeeklyDay(value: unknown): RaidPollDay {
  return cleanPollDay(value) || "mon";
}

function cleanRepeatWeeklyTime(value: unknown): RaidPollRepeatTime {
  const text = cleanString(value, 8);
  return RAID_POLL_REPEAT_TIMES.includes(text as RaidPollRepeatTime) ? text as RaidPollRepeatTime : "12:00";
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

function uniquePollTimes(values: unknown[]): RaidPollTime[] {
  const times = values.map(cleanPollTime).filter(Boolean) as RaidPollTime[];
  return RAID_POLL_TIMES.filter((time) => times.includes(time));
}

function compactScheduleValue(value: RaidPollScheduleValue | null | undefined): RaidPollScheduleValue | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const times = uniquePollTimes(value);
    if (!times.length) return null;
    return times.length === 1 ? times[0] : times;
  }
  return cleanPollAvailability(value);
}

function scheduleTimes(value: RaidPollScheduleValue | null | undefined): RaidPollTime[] {
  if (!value || value === "absent") return [];
  if (Array.isArray(value)) return uniquePollTimes(value);
  return cleanPollTime(value) ? [value] : [];
}

function scheduleHasTime(schedule: RaidPollSchedule, day: RaidPollDay, time: RaidPollTime) {
  return scheduleTimes(schedule[day]).includes(time);
}

function cleanPollScheduleValue(value: unknown): RaidPollScheduleValue | null {
  if (Array.isArray(value)) return compactScheduleValue(value);
  const availability = cleanPollAvailability(value);
  return availability || null;
}

function cleanPollSchedule(value: unknown): RaidPollSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const schedule: RaidPollSchedule = {};
  for (const day of RAID_POLL_DAYS) {
    const availability = cleanPollScheduleValue(raw[day.value]);
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
    .filter((day): day is RaidPollDay => scheduleTimes(schedule[day]).length > 0);
}

function firstTimeFromSchedule(schedule: RaidPollSchedule): RaidPollTime | null {
  for (const day of RAID_POLL_DAYS) {
    const [first] = scheduleTimes(schedule[day.value]);
    if (first) return first;
  }
  return null;
}

function parseScheduleValues(values: unknown): RaidPollSchedule {
  const timesByDay = new Map<RaidPollDay, Set<RaidPollTime>>();
  const absentDays = new Set<RaidPollDay>();
  const list = Array.isArray(values) ? values : String(values || "").split(",");

  for (const item of list) {
    const text = cleanString(item, 32);
    const separatorIndex = text.indexOf(":");
    if (separatorIndex <= 0) continue;
    const day = cleanPollDay(text.slice(0, separatorIndex));
    const availability = cleanPollAvailability(text.slice(separatorIndex + 1));
    if (!day || !availability) continue;

    if (availability === "absent") {
      if (!timesByDay.get(day)?.size) absentDays.add(day);
      continue;
    }

    absentDays.delete(day);
    const existing = timesByDay.get(day) || new Set<RaidPollTime>();
    existing.add(availability);
    timesByDay.set(day, existing);
  }

  const schedule: RaidPollSchedule = {};
  for (const day of RAID_POLL_DAYS) {
    const times = RAID_POLL_TIMES.filter((time) => timesByDay.get(day.value)?.has(time));
    if (times.length) schedule[day.value] = times.length === 1 ? times[0] : times;
    else if (absentDays.has(day.value)) schedule[day.value] = "absent";
  }
  return schedule;
}

function cleanCharacterSelector(value: unknown) {
  const text = cleanString(value, 260);
  if (/^c\d{1,2}$/i.test(text) || /^alt_[1-9][0-9]?$/.test(text) || text === "main") return text;
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
  const configured = String(process.env.ADMIN_DASHBOARD_URL || process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "https://admin.lihvodruida.pp.ua").trim();
  try {
    const url = new URL(configured || "https://admin.lihvodruida.pp.ua");
    if (url.hostname.endsWith(".vercel.app")) return "https://admin.lihvodruida.pp.ua";
    return url.origin;
  } catch {
    return "https://admin.lihvodruida.pp.ua";
  }
}

export function dashboardPollUrl(pollId: string) {
  return `${dashboardBaseUrl()}/polls/${encodeURIComponent(pollId)}`;
}

function raidPollTimeZone() {
  return String(process.env.RAID_POLL_TIME_ZONE || process.env.RAID_TIME_ZONE || process.env.NEXT_PUBLIC_RAID_TIME_ZONE || "Europe/Kyiv");
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

function zonedDateTimeToUtcMs(year: number, month: number, day: number, hour: number, minute: number, timeZone = raidPollTimeZone()) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return guess.getTime() - timezoneOffsetMs(guess, timeZone);
}

function localDateParts(date: Date, timeZone = raidPollTimeZone()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: String(values.weekday || ""),
  };
}

const WEEKDAY_SHORT_BY_POLL_DAY: Record<RaidPollDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function nextWeeklyRepeatMs(fromMs = Date.now(), repeatDay: RaidPollDay = "mon", repeatTime: RaidPollRepeatTime = "12:00") {
  const timeZone = raidPollTimeZone();
  const local = localDateParts(new Date(fromMs), timeZone);
  const [hourText, minuteText] = cleanRepeatWeeklyTime(repeatTime).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const targetWeekday = WEEKDAY_SHORT_BY_POLL_DAY[cleanRepeatWeeklyDay(repeatDay)] || "Mon";

  for (let addDays = 0; addDays <= 14; addDays += 1) {
    const localCandidateDate = new Date(Date.UTC(local.year, local.month - 1, local.day + addDays, hour, minute, 0));
    const year = localCandidateDate.getUTCFullYear();
    const month = localCandidateDate.getUTCMonth() + 1;
    const day = localCandidateDate.getUTCDate();
    const candidateMs = zonedDateTimeToUtcMs(year, month, day, hour, minute, timeZone);
    const candidateLocal = localDateParts(new Date(candidateMs), timeZone);
    if (candidateLocal.weekday === targetWeekday && candidateMs > fromMs + 60_000) return candidateMs;
  }
  return fromMs + 7 * 24 * 60 * 60 * 1000;
}

export function raidPollRepeatScheduleLabel(poll: Pick<RaidPollItem, "autoRepeatWeekly" | "repeatWeeklyDay" | "repeatWeeklyTime">) {
  if (!poll.autoRepeatWeekly) return "Вимкнено";
  const day = cleanRepeatWeeklyDay(poll.repeatWeeklyDay);
  const time = cleanRepeatWeeklyTime(poll.repeatWeeklyTime);
  return `${dayFullLabel(day)} о ${time}`;
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
  // Важливо: не закриваємо обʼєкт тільки під час normalize.
  // Інакше closeDueRaidPoll() бачить already closed і не PATCH-ить Discord,
  // через що публічна кнопка "Проголосувати" лишається активною у старому embed.
  const status = cleanString(data.status, 20).toLowerCase() === "closed" ? "closed" : "open";
  const autoRepeatWeekly = cleanBoolean(data.autoRepeatWeekly ?? data.auto_repeat_weekly ?? data.repeatWeekly ?? data.repeat_weekly);
  const repeatWeeklyDay = autoRepeatWeekly ? cleanRepeatWeeklyDay(data.repeatWeeklyDay ?? data.repeat_weekly_day ?? data.repeatDay ?? data.repeat_day) : null;
  const repeatWeeklyTime = autoRepeatWeekly ? cleanRepeatWeeklyTime(data.repeatWeeklyTime ?? data.repeat_weekly_time ?? data.repeatTime ?? data.repeat_time) : null;
  const repeatNextAtMs = autoRepeatWeekly
    ? safeMs(data.repeatNextAtMs ?? data.repeat_next_at_ms, nextWeeklyRepeatMs(Date.parse(createdAt) || Date.now(), repeatWeeklyDay || "mon", repeatWeeklyTime || "12:00"))
    : null;

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
    mentionRoleIds: cleanSnowflakeIds(data.mentionRoleIds ?? data.mention_role_ids),
    autoRepeatWeekly,
    repeatWeeklyDay,
    repeatWeeklyTime,
    repeatNextAt: repeatNextAtMs ? new Date(repeatNextAtMs).toISOString() : null,
    repeatNextAtMs,
    repeatSeriesId: cleanString(data.repeatSeriesId || data.repeat_series_id, 80) || (autoRepeatWeekly ? id : null),
    repeatedFromPollId: cleanString(data.repeatedFromPollId || data.repeated_from_poll_id, 80) || null,
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
        continue;
      }

      const selectedTimes = scheduleTimes(value);
      if (!selectedTimes.length) continue;
      days[day.value] += 1;
      for (const time of selectedTimes) {
        times[time] += 1;
        dayTimes[day.value][time] += 1;
      }
    }
  }

  return { days, absent, times, dayTimes, total: poll.votes.length };
}

export function pollVotersForDay(poll: Pick<RaidPollItem, "votes">, day: RaidPollDay) {
  return poll.votes.filter((vote) => {
    const schedule = vote.schedule && Object.keys(vote.schedule).length ? vote.schedule : scheduleFromLegacy(vote.selectedDays, vote.selectedTime);
    return scheduleTimes(schedule[day]).length > 0;
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

export type RaidPollSlotRecommendation = {
  day: RaidPollDay;
  time: RaidPollTime;
  total: number;
  tanks: number;
  healers: number;
  dps: number;
  unknown: number;
  voters: RaidPollVote[];
  score: number;
};

function roleBucket(role: RaidPollRole | null | undefined) {
  if (role === "tank") return "tanks";
  if (role === "healer") return "healers";
  if (role === "dps") return "dps";
  return "unknown";
}

function raidPollSlotScore(item: Pick<RaidPollSlotRecommendation, "tanks" | "healers" | "dps" | "unknown" | "total">) {
  // Головна ціль голосувалки — знайти слот, де реально можна зібрати рейд.
  // Тому 2 танки важливіші за загальну кількість, далі йдуть хіли, потім сумарний онлайн.
  const tankCore = Math.min(item.tanks, 2);
  const completeTankCore = item.tanks >= 2 ? 1 : 0;
  return completeTankCore * 1_000_000 + tankCore * 100_000 + item.healers * 10_000 + item.total * 100 + item.dps * 10 - item.unknown;
}

export function raidPollSlotRecommendations(poll: Pick<RaidPollItem, "days" | "votes">, limit = 6): RaidPollSlotRecommendation[] {
  const active = poll.days?.length ? poll.days : RAID_POLL_DAYS.map((day) => day.value);
  const activeSet = new Set(active);
  const rows: RaidPollSlotRecommendation[] = [];

  for (const day of RAID_POLL_DAYS) {
    if (!activeSet.has(day.value)) continue;
    for (const time of RAID_POLL_TIMES) {
      const voters = poll.votes.filter((vote) => scheduleHasTime(raidPollVoteSchedule(vote), day.value, time));
      let tanks = 0;
      let healers = 0;
      let dps = 0;
      let unknown = 0;
      for (const vote of voters) {
        const bucket = roleBucket(vote.characterRole);
        if (bucket === "tanks") tanks += 1;
        else if (bucket === "healers") healers += 1;
        else if (bucket === "dps") dps += 1;
        else unknown += 1;
      }
      const total = voters.length;
      rows.push({
        day: day.value,
        time,
        total,
        tanks,
        healers,
        dps,
        unknown,
        voters,
        score: raidPollSlotScore({ tanks, healers, dps, unknown, total }),
      });
    }
  }

  return rows
    .filter((item) => item.total > 0)
    .sort((a, b) =>
      b.score - a.score ||
      Math.min(b.tanks, 2) - Math.min(a.tanks, 2) ||
      b.healers - a.healers ||
      b.total - a.total ||
      RAID_POLL_DAYS.findIndex((day) => day.value === a.day) - RAID_POLL_DAYS.findIndex((day) => day.value === b.day) ||
      RAID_POLL_TIMES.indexOf(a.time) - RAID_POLL_TIMES.indexOf(b.time),
    )
    .slice(0, Math.max(1, Math.min(20, Math.floor(limit))));
}

export function raidPollBestSlot(poll: Pick<RaidPollItem, "days" | "votes">) {
  return raidPollSlotRecommendations(poll, 1)[0] || null;
}

export function raidPollSlotSummary(slot: RaidPollSlotRecommendation | null | undefined) {
  if (!slot) return "Ще немає достатніх голосів.";
  return `${dayLabel(slot.day)} ${slot.time} — ${slot.tanks}/2 танки • ${slot.healers} хіли • ${slot.dps} ДД • всього ${slot.total}`;
}


type RaidPollVoteDraft = RaidPollVote & {
  roleSelected: boolean;
};

const RAID_POLL_PRIVATE_SCHEDULE_GROUPS: Array<{ key: "a" | "b"; label: string; days: RaidPollDay[] }> = [
  { key: "a", label: "Пн-Чт", days: ["mon", "tue", "wed", "thu"] },
  { key: "b", label: "Пт-Нд", days: ["fri", "sat", "sun"] },
];

function baseDraftForUser(params: { userId: string; userName: string; guildId?: string | null; guildName?: string | null }, nowIso: string): RaidPollVoteDraft {
  return {
    discordId: cleanSnowflake(params.userId),
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
    roleSelected: false,
  };
}

function draftFromExistingVote(vote: RaidPollVote, nowIso: string): RaidPollVoteDraft {
  return {
    ...vote,
    schedule: raidPollVoteSchedule(vote),
    selectedDays: activeDaysFromSchedule(raidPollVoteSchedule(vote)),
    selectedTime: firstTimeFromSchedule(raidPollVoteSchedule(vote)),
    roleSelected: Boolean(vote.characterRole),
    updatedAt: vote.updatedAt || nowIso,
  };
}

function normalizeVoteDraft(raw: unknown, fallback: RaidPollVoteDraft): RaidPollVoteDraft {
  const normalized = normalizeVote(raw, fallback.discordId);
  const rawObject = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const roleSelected = rawObject
    ? rawObject.roleSelected === true || rawObject.role_selected === true
    : fallback.roleSelected;
  const source = normalized || fallback;
  const schedule = raidPollVoteSchedule(source);
  return {
    ...fallback,
    ...source,
    schedule,
    selectedDays: activeDaysFromSchedule(schedule),
    selectedTime: firstTimeFromSchedule(schedule),
    roleSelected,
    createdAt: source.createdAt || fallback.createdAt,
    updatedAt: source.updatedAt || fallback.updatedAt,
  };
}

function voteDraftFromPollData(data: Record<string, unknown>, userId: string, fallback: RaidPollVoteDraft) {
  const drafts = data.voteDraftsByDiscordId && typeof data.voteDraftsByDiscordId === "object" && !Array.isArray(data.voteDraftsByDiscordId)
    ? data.voteDraftsByDiscordId as Record<string, unknown>
    : {};
  return normalizeVoteDraft(drafts[userId], fallback);
}

function voteDraftToFirestore(draft: RaidPollVoteDraft) {
  return {
    ...draft,
    selectedDays: activeDaysFromSchedule(draft.schedule),
    selectedTime: firstTimeFromSchedule(draft.schedule),
    roleSelected: Boolean(draft.roleSelected),
  };
}

function hasDraftSchedule(draft: Pick<RaidPollVoteDraft, "schedule">) {
  return Object.keys(draft.schedule || {}).some((day) => Boolean((draft.schedule as Record<string, unknown>)[day]));
}

function isDraftReadyToSubmit(draft: RaidPollVoteDraft) {
  return Boolean(draft.characterKey && draft.characterName && draft.roleSelected && draft.characterRole && hasDraftSchedule(draft));
}

function draftReadinessLines(draft: RaidPollVoteDraft, poll: Pick<RaidPollItem, "days">) {
  const character = draft.characterName
    ? `✅ Персонаж: ${draft.characterName}${draft.characterRealm ? ` • ${draft.characterRealm}` : ""}`
    : "⬜ Персонаж: не вибрано";
  const role = draft.roleSelected && draft.characterRole
    ? `✅ Роль: ${raidPollRoleLabel(draft.characterRole)}`
    : "⬜ Роль: не вибрано";
  const schedule = hasDraftSchedule(draft)
    ? `✅ Дні/години: ${scheduleSummary(draft.schedule, poll.days)}`
    : "⬜ Дні/години: не вибрано";
  const submit = isDraftReadyToSubmit(draft)
    ? "🟢 Можна натискати **Проголосувати**."
    : "🟡 Це ще чернетка. Вибери персонажа, роль і доступність, потім натисни **Проголосувати**.";
  return [character, role, schedule, submit].join("\n");
}

function draftSavedContent(draft: RaidPollVoteDraft, poll: RaidPollItem) {
  return `📝 Чернетку оновлено, але голос ще **не зараховано**.\n${draftReadinessLines(draft, poll)}`;
}

function draftPromptContent(draft: RaidPollVoteDraft, poll: RaidPollItem) {
  const intro = poll.votes.some((vote) => vote.discordId === draft.discordId)
    ? "✏️ Зміни свій голос: персонаж, роль і розклад редагуються тут приватно."
    : "🗳️ Створи голос: вибери персонажа, роль, дні й години.";
  return `${intro}\n${draftReadinessLines(draft, poll)}`;
}

function submittedVoteContent(vote: RaidPollVote, poll: RaidPollItem) {
  const characterLabel = vote.characterName
    ? `${vote.characterName}${vote.characterClass ? ` • ${vote.characterClass}` : ""}${vote.characterRole ? ` • ${raidPollRoleLabel(vote.characterRole)}` : ""}`
    : "персонаж не вказаний";
  return `✅ Голос зараховано для **${raidPollTitle(poll)}**.\nПерсонаж: **${characterLabel}**\nРозклад: **${scheduleSummary(raidPollVoteSchedule(vote), poll.days)}**`;
}

function formatDiscordTimestamp(ms: number) {
  const stamp = Math.floor(ms / 1000);
  return `<t:${stamp}:f> • <t:${stamp}:R>`;
}

function topDaySummary(poll: RaidPollItem) {
  const best = raidPollBestSlot(poll);
  return raidPollSlotSummary(best);
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
    { name: "🧠 Рекомендований день/час", value: topDaySummary(poll), inline: false },
    { name: "🧾 Останні голоси", value: votersDiscordValue(poll), inline: false },
  ];

  const embed = normalizeDiscordEmbed({
    title: `${closed ? "🔒" : "🗳️"} ${raidPollTitle(poll)}`,
    description: poll.description,
    color: closed ? 0x5865f2 : DIFFICULTY_COLORS[poll.difficulty],
    url: dashboardPollUrl(poll.id),
    fields,
    footer: { text: closed ? "Mistblossom Vanguard • Рейд-пул завершено" : "Mistblossom Vanguard • Натисни кнопку голосування й підтвердь вибір" },
    timestamp: new Date().toISOString(),
  });

  return {
    content: closed ? "🔒 **Голосування завершено. Фінальний результат нижче.**" : "🗳️ **Рейд-пул відкрито. Натисніть кнопку, оберіть персонажа/роль/розклад і підтвердьте голос.**",
    embed,
    components: buildRaidPollDiscordComponents(poll),
    mentionRoleIds: cleanSnowflakeIds(poll.mentionRoleIds || []),
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

  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: disabled ? 2 : 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_character_prompt:${poll.id}`,
          label: disabled ? "Голосування завершено" : "Проголосувати / змінити голос",
          disabled,
        },
        { type: 2, style: 5, label: "Деталі на сайті", url: dashboardPollUrl(poll.id) },
      ],
    },
  ];
}

function buildRaidPollSubmittedComponents(poll: Pick<RaidPollItem, "id" | "status" | "closesAtMs" | "days">) {
  const disabled = poll.status === "closed" || poll.closesAtMs <= Date.now();
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_character_prompt:${poll.id}`,
          label: disabled ? "Голосування завершено" : "Змінити голос",
          disabled,
        },
        { type: 2, style: 5, label: "Деталі на сайті", url: dashboardPollUrl(poll.id) },
      ],
    },
  ];
}

function roleSelectOptions(draft: RaidPollVoteDraft) {
  return RAID_POLL_ROLE_OPTIONS.map((role) => ({
    label: `${role.emoji} ${role.label}`.slice(0, 100),
    value: role.value,
    description: role.description.slice(0, 100),
    default: draft.roleSelected && draft.characterRole === role.value,
  }));
}

function isScheduleOptionDefault(schedule: RaidPollSchedule, day: RaidPollDay, availability: RaidPollAvailability) {
  const value = schedule[day];
  if (availability === "absent") return value === "absent";
  return scheduleTimes(value).includes(availability);
}

function scheduleSelectOptionsWithDefaults(days: RaidPollDay[], draft: RaidPollVoteDraft) {
  return days.flatMap((day) => RAID_POLL_AVAILABILITY_OPTIONS.map((availability) => ({
    label: scheduleOptionLabel(day, availability),
    value: `${day}:${availability}`,
    description: scheduleOptionDescription(day, availability).slice(0, 100),
    default: isScheduleOptionDefault(draft.schedule, day, availability),
  })));
}

function buildRaidPollVoteDraftComponents(poll: Pick<RaidPollItem, "id" | "status" | "closesAtMs" | "days">, profile: DashboardProfile, draft: RaidPollVoteDraft) {
  const disabled = poll.status === "closed" || poll.closesAtMs <= Date.now();
  const rows: Array<Record<string, unknown>> = [];

  const characterOptions = orderedProfileCharacters(profile)
    .slice(0, 25)
    .map((character, index) => ({
      label: pollCharacterOptionLabel(character, index),
      description: pollCharacterOptionDescription(character),
      value: `c${index}`,
      default: draft.characterKey ? normalizeCharacterKey(character.key) === normalizeCharacterKey(draft.characterKey) : false,
    }));

  if (characterOptions.length) {
    rows.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_character:${poll.id}`,
          placeholder: "1) Обери персонажа",
          min_values: 1,
          max_values: 1,
          disabled,
          options: characterOptions,
        },
      ],
    });
  }

  rows.push({
    type: 1,
    components: [
      {
        type: 3,
        custom_id: `${RAID_POLL_ACTION_PREFIX}_role:${poll.id}`,
        placeholder: "2) Обери роль у рейді",
        min_values: 1,
        max_values: 1,
        disabled,
        options: roleSelectOptions(draft),
      },
    ],
  });

  const activeDays = pollActiveDays(poll).map((day) => day.value);
  for (const group of RAID_POLL_PRIVATE_SCHEDULE_GROUPS) {
    const groupDays = group.days.filter((day) => activeDays.includes(day));
    if (!groupDays.length) continue;
    rows.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_schedule_${group.key}:${poll.id}`,
          placeholder: `3) ${group.label}: час або «Не можу»`,
          min_values: 1,
          max_values: Math.min(25, scheduleSelectOptionsWithDefaults(groupDays, draft).length),
          disabled,
          options: scheduleSelectOptionsWithDefaults(groupDays, draft),
        },
      ],
    });
  }

  rows.push({
    type: 1,
    components: [
      {
        type: 2,
        style: isDraftReadyToSubmit(draft) && !disabled ? 3 : 2,
        custom_id: `${RAID_POLL_ACTION_PREFIX}_submit:${poll.id}`,
        label: "Проголосувати",
        disabled: disabled || !isDraftReadyToSubmit(draft),
      },
      { type: 2, style: 5, label: "Деталі на сайті", url: dashboardPollUrl(poll.id) },
    ],
  });

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
    mentionRoleIds: payload.mentionRoleIds,
    auditReason: `Raid poll sync: ${poll.id}`,
  });
}

async function publishOrUpdatePollDiscordMessage(poll: RaidPollItem, channelIdInput?: string | null) {
  const targetChannelId = cleanSnowflake(channelIdInput) || cleanSnowflake(poll.channelId) || getDiscordDefaultChannelId();
  if (!targetChannelId) throw new Error("Discord-канал для рейд-пулу не вибрано.");

  const payload = buildRaidPollDiscordPayload(poll);
  const hasExistingMessage = Boolean(poll.channelId && poll.messageId);
  const canEditExisting = Boolean(hasExistingMessage && poll.channelId === targetChannelId);
  let message: Record<string, unknown> | null = null;

  if (canEditExisting && poll.channelId && poll.messageId) {
    try {
      message = await editDiscordRaidMessage({
        ref: { channelId: poll.channelId, messageId: poll.messageId },
        content: payload.content,
        embed: payload.embed,
        components: payload.components,
        mentionRoleIds: payload.mentionRoleIds,
        auditReason: `Raid poll updated: ${poll.id}`,
      }) as Record<string, unknown>;
    } catch (error) {
      if (!isMissingDiscordMessageError(error)) throw error;
      message = await createDiscordRaidMessage({
        channelId: targetChannelId,
        content: payload.content,
        embed: payload.embed,
        components: payload.components,
        mentionRoleIds: payload.mentionRoleIds,
        auditReason: `Raid poll republished after missing message: ${poll.id}`,
      }) as Record<string, unknown>;
    }
  } else {
    message = await createDiscordRaidMessage({
      channelId: targetChannelId,
      content: payload.content,
      embed: payload.embed,
      components: payload.components,
      mentionRoleIds: payload.mentionRoleIds,
      auditReason: hasExistingMessage ? `Raid poll moved to another channel: ${poll.id}` : `Raid poll created from dashboard: ${poll.id}`,
    }) as Record<string, unknown>;

    if (hasExistingMessage && poll.channelId && poll.messageId && poll.channelId !== targetChannelId) {
      await deleteDiscordRaidMessage({
        ref: { channelId: poll.channelId, messageId: poll.messageId },
        auditReason: `Raid poll moved to another channel: ${poll.id}`,
      }).catch((error) => {
        console.warn("[raidPolls] Failed to delete old Discord poll message", {
          pollId: poll.id,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  const messageId = cleanSnowflake(message?.id || message?.message_id || poll.messageId);
  const finalChannelId = cleanSnowflake(message?.channel_id || targetChannelId);
  if (!messageId || !finalChannelId) throw new Error("Discord не підтвердив повідомлення рейд-пулу.");
  return { channelId: finalChannelId, messageId, messageUrl: discordMessageUrl(finalChannelId, messageId) };
}

async function savePollDiscordRef(pollId: string, ref: { channelId: string; messageId: string; messageUrl: string }) {
  const updatedAt = new Date().toISOString();
  await firebaseWrite("raid", `raid-poll:discord-ref:${pollId}`, async () => {
    await pollRef(pollId).update({
      channelId: ref.channelId,
      messageId: ref.messageId,
      messageUrl: ref.messageUrl,
      updatedAt,
      updatedAtMs: Date.now(),
    });
    return true;
  }, { logEvent: "raid_polls.discord_ref_failed" });
  clearRaidPollRuntimeCaches(pollId);
  return updatedAt;
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
      return snap.docs.map((doc: QueryDocumentSnapshot) => normalizeRaidPoll(doc.id, doc.data() || {}));
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
  const mentionRoleIds = cleanSnowflakeIds(input.mentionRoleIds);
  const autoRepeatWeekly = cleanBoolean(input.autoRepeatWeekly);
  const repeatWeeklyDay = autoRepeatWeekly ? cleanRepeatWeeklyDay(input.repeatWeeklyDay) : null;
  const repeatWeeklyTime = autoRepeatWeekly ? cleanRepeatWeeklyTime(input.repeatWeeklyTime) : null;
  const repeatNextAtMs = autoRepeatWeekly ? nextWeeklyRepeatMs(now.getTime(), repeatWeeklyDay || "mon", repeatWeeklyTime || "12:00") : null;
  const repeatSeriesId = autoRepeatWeekly ? id : null;

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
    mentionRoleIds,
    autoRepeatWeekly,
    repeatWeeklyDay,
    repeatWeeklyTime,
    repeatNextAt: repeatNextAtMs ? new Date(repeatNextAtMs).toISOString() : null,
    repeatNextAtMs,
    repeatSeriesId,
    repeatedFromPollId: null,
    days: activeDays,
    votes: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await firebaseWrite("raid", `raid-poll:create:${id}`, async () => {
    await pollRef(id).set({
      ...basePoll,
      days: activeDays,
      mentionRoleIds,
      autoRepeatWeekly,
      repeatWeeklyDay,
      repeatWeeklyTime,
      repeatNextAt: repeatNextAtMs ? new Date(repeatNextAtMs).toISOString() : null,
      repeatNextAtMs,
      repeatSeriesId,
      repeatedFromPollId: null,
      votes: [],
      votesByDiscordId: {},
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
    });
    return true;
  }, { logEvent: "raid_polls.create_failed" });
  clearRaidPollRuntimeCaches(id);

  let published: { channelId: string; messageId: string; messageUrl: string } | null = null;
  try {
    published = await publishOrUpdatePollDiscordMessage(basePoll, channelId);
    const updatedAt = await savePollDiscordRef(id, published);
    return { ...basePoll, ...published, updatedAt };
  } catch (error) {
    if (published?.channelId && published?.messageId) {
      await deleteDiscordRaidMessage({
        ref: { channelId: published.channelId, messageId: published.messageId },
        auditReason: `Rollback failed raid poll create: ${id}`,
      }).catch(() => null);
    }
    await firebaseWrite("raid", `raid-poll:create-rollback:${id}`, async () => {
      await pollRef(id).delete().catch(() => null);
      return true;
    }, { logEvent: "raid_polls.create_rollback_failed" }).catch(() => null);
    clearRaidPollRuntimeCaches(id);
    throw error;
  }
}

export async function saveRaidPollFromForm(form: FormData, user: DashboardSession) {
  return saveRaidPollFromInput({
    title: form.get("title"),
    difficulty: form.get("difficulty"),
    description: form.get("description"),
    channelId: form.get("channelId"),
    closeAfterMinutes: form.get("closeAfterMinutes"),
    days: form.getAll("days"),
    mentionRoleIds: form.getAll("mentionRoleIds"),
    autoRepeatWeekly: form.get("autoRepeatWeekly"),
    repeatWeeklyDay: form.get("repeatWeeklyDay"),
    repeatWeeklyTime: form.get("repeatWeeklyTime"),
  }, user);
}

export async function updateRaidPollFromInput(pollId: string, input: RaidPollUpdateInput) {
  if (!hasRaidPollStorage()) throw new Error(firebaseUnavailableMessage("raid", "write"));

  const title = cleanString(input.title, 160);
  if (title.length < 3) throw new Error("Вкажи назву рейду для голосування.");
  const difficulty = cleanDifficulty(input.difficulty);
  const closeAfterMinutes = cleanCloseAfterMinutes(input.closeAfterMinutes);
  const description = cleanPollDescription(input.description);
  const days = cleanPollDays(input.days);
  const activeDays = days.length ? days : RAID_POLL_DAYS.map((day) => day.value);
  const channelId = cleanSnowflake(input.channelId) || getDiscordDefaultChannelId();
  const mentionRoleIds = cleanSnowflakeIds(input.mentionRoleIds);
  const autoRepeatWeekly = cleanBoolean(input.autoRepeatWeekly);
  const repeatWeeklyDay = autoRepeatWeekly ? cleanRepeatWeeklyDay(input.repeatWeeklyDay) : null;
  const repeatWeeklyTime = autoRepeatWeekly ? cleanRepeatWeeklyTime(input.repeatWeeklyTime) : null;
  if (!channelId) throw new Error("Discord-канал для рейд-пулу не вибрано.");

  const updatedAt = new Date().toISOString();
  const updatedPoll = await firebaseWrite<RaidPollItem>("raid", `raid-poll:update:${pollId}`, async () => {
    const ref = pollRef(pollId);
    return getFirebaseAdminDb().runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Рейд-пул не знайдено.");
      const previous = normalizeRaidPoll(snap.id, snap.data() || {});
      const createdAtMs = Date.parse(previous.createdAt);
      const closesAtMs = previous.status === "closed"
        ? previous.closesAtMs
        : (Number.isFinite(createdAtMs) ? createdAtMs : Date.now()) + closeAfterMinutes * 60 * 1000;
      const repeatConfigChanged = previous.repeatWeeklyDay !== repeatWeeklyDay || previous.repeatWeeklyTime !== repeatWeeklyTime || previous.autoRepeatWeekly !== autoRepeatWeekly;
      const nextRepeatAtMs = autoRepeatWeekly
        ? repeatConfigChanged || !previous.repeatNextAtMs
          ? nextWeeklyRepeatMs(Date.now(), repeatWeeklyDay || "mon", repeatWeeklyTime || "12:00")
          : previous.repeatNextAtMs
        : null;
      const nextRepeatAt = nextRepeatAtMs ? new Date(nextRepeatAtMs).toISOString() : null;
      const next: RaidPollItem = {
        ...previous,
        title,
        difficulty,
        description,
        closeAfterMinutes,
        closesAt: new Date(closesAtMs).toISOString(),
        closesAtMs,
        channelId,
        mentionRoleIds,
        autoRepeatWeekly,
        repeatWeeklyDay,
        repeatWeeklyTime,
        repeatNextAt: nextRepeatAt,
        repeatNextAtMs: nextRepeatAtMs,
        repeatSeriesId: autoRepeatWeekly ? previous.repeatSeriesId || previous.id : null,
        days: activeDays,
        updatedAt,
      };
      tx.update(ref, {
        title,
        difficulty,
        description,
        closeAfterMinutes,
        closesAt: next.closesAt,
        closesAtMs,
        channelId,
        mentionRoleIds,
        autoRepeatWeekly,
        repeatWeeklyDay,
        repeatWeeklyTime,
        repeatNextAt: nextRepeatAt,
        repeatNextAtMs: nextRepeatAtMs,
        repeatSeriesId: autoRepeatWeekly ? previous.repeatSeriesId || previous.id : null,
        days: activeDays,
        updatedAt,
        updatedAtMs: Date.now(),
      });
      return next;
    });
  }, { logEvent: "raid_polls.update_failed" });

  clearRaidPollRuntimeCaches(updatedPoll.id);
  const published = await publishOrUpdatePollDiscordMessage(updatedPoll, channelId);
  const discordUpdatedAt = await savePollDiscordRef(updatedPoll.id, published);
  return { ...updatedPoll, ...published, updatedAt: discordUpdatedAt };
}

export async function updateRaidPollFromForm(pollId: string, form: FormData) {
  return updateRaidPollFromInput(pollId, {
    title: form.get("title"),
    difficulty: form.get("difficulty"),
    description: form.get("description"),
    channelId: form.get("channelId"),
    closeAfterMinutes: form.get("closeAfterMinutes"),
    days: form.getAll("days"),
    mentionRoleIds: form.getAll("mentionRoleIds"),
    autoRepeatWeekly: form.get("autoRepeatWeekly"),
    repeatWeeklyDay: form.get("repeatWeeklyDay"),
    repeatWeeklyTime: form.get("repeatWeeklyTime"),
  });
}

async function markRaidPollRepeatFailed(pollId: string, message: string) {
  await firebaseWrite("raid", `raid-poll:repeat-failed:${pollId}`, async () => {
    await pollRef(pollId).update({
      repeatLockedAtMs: FieldValue.delete(),
      repeatLockId: FieldValue.delete(),
      repeatLastError: cleanString(message, 400),
      repeatLastErrorAt: new Date().toISOString(),
      updatedAtMs: Date.now(),
    });
    return true;
  }, { logEvent: "raid_polls.repeat_unlock_failed" }).catch(() => null);
}

async function claimRaidPollRepeat(pollId: string, nowMs: number, lockId: string) {
  return firebaseWrite<RaidPollItem | null>("raid", `raid-poll:repeat-claim:${pollId}:${lockId}`, async () => {
    const ref = pollRef(pollId);
    return getFirebaseAdminDb().runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const raw = snap.data() || {};
      const poll = normalizeRaidPoll(snap.id, raw);
      if (!poll.autoRepeatWeekly || !poll.repeatNextAtMs || poll.repeatNextAtMs > nowMs) return null;

      const existingLockAt = safeMs((raw as Record<string, unknown>).repeatLockedAtMs, 0);
      if (existingLockAt && nowMs - existingLockAt < 5 * 60 * 1000) return null;

      tx.update(ref, {
        repeatLockedAtMs: nowMs,
        repeatLockId: lockId,
        updatedAt: new Date(nowMs).toISOString(),
        updatedAtMs: nowMs,
      });
      return poll;
    });
  }, { logEvent: "raid_polls.repeat_claim_failed" });
}

async function createRepeatedRaidPoll(template: RaidPollItem) {
  const now = new Date();
  const nowIso = now.toISOString();
  const id = newPollId();
  const closesAtMs = now.getTime() + template.closeAfterMinutes * 60 * 1000;
  const repeatWeeklyDay = template.repeatWeeklyDay || "mon";
  const repeatWeeklyTime = template.repeatWeeklyTime || "12:00";
  const repeatNextAtMs = nextWeeklyRepeatMs(now.getTime(), repeatWeeklyDay, repeatWeeklyTime);
  const repeatSeriesId = template.repeatSeriesId || template.id;
  const nextPoll: RaidPollItem = {
    ...template,
    id,
    status: "open",
    closesAt: new Date(closesAtMs).toISOString(),
    closesAtMs,
    closedAt: null,
    closedReason: null,
    messageId: null,
    messageUrl: null,
    votes: [],
    autoRepeatWeekly: true,
    repeatWeeklyDay,
    repeatWeeklyTime,
    repeatNextAt: new Date(repeatNextAtMs).toISOString(),
    repeatNextAtMs,
    repeatSeriesId,
    repeatedFromPollId: template.id,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await firebaseWrite("raid", `raid-poll:repeat-create:${template.id}:${id}`, async () => {
    await pollRef(id).set({
      ...nextPoll,
      votes: [],
      votesByDiscordId: {},
      voteDraftsByDiscordId: {},
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
      repeatedAt: nowIso,
    });
    return true;
  }, { logEvent: "raid_polls.repeat_create_failed" });
  clearRaidPollRuntimeCaches(id);

  let published: { channelId: string; messageId: string; messageUrl: string } | null = null;
  try {
    published = await publishOrUpdatePollDiscordMessage(nextPoll, template.channelId);
    const updatedAt = await savePollDiscordRef(id, published);
    const publishedPoll = { ...nextPoll, ...published, updatedAt };
    const deleteResult = await deleteRaidPoll(template.id).catch(async (error) => {
      await firebaseWrite("raid", `raid-poll:repeat-old-disable:${template.id}`, async () => {
        await pollRef(template.id).update({
          autoRepeatWeekly: false,
          repeatWeeklyDay: null,
          repeatWeeklyTime: null,
          repeatNextAt: null,
          repeatNextAtMs: null,
          repeatReplacedByPollId: id,
          status: "closed",
          closedAt: nowIso,
          closedReason: "auto",
          updatedAt: nowIso,
          updatedAtMs: now.getTime(),
        });
        return true;
      }, { logEvent: "raid_polls.repeat_old_disable_failed" }).catch(() => null);
      console.warn("[raidPolls] Failed to delete repeated old poll", {
        pollId: template.id,
        newPollId: id,
        message: error instanceof Error ? error.message : String(error),
      });
      return { discordDeleted: false, discordDeleteFailed: true };
    });
    return { poll: publishedPoll, oldPollId: template.id, discordDeleted: Boolean(deleteResult?.discordDeleted), discordDeleteFailed: Boolean(deleteResult?.discordDeleteFailed) };
  } catch (error) {
    if (published?.channelId && published?.messageId) {
      await deleteDiscordRaidMessage({
        ref: { channelId: published.channelId, messageId: published.messageId },
        auditReason: `Rollback failed repeated raid poll create: ${id}`,
      }).catch(() => null);
    }
    await pollRef(id).delete().catch(() => null);
    clearRaidPollRuntimeCaches(id);
    throw error;
  }
}

export async function repeatDueRaidPolls() {
  if (!hasRaidPollStorage()) return { checked: 0, repeated: 0, deleted: 0, failed: 0 };
  const nowMs = Date.now();
  const snap = await getFirebaseAdminDb()
    .collection(RAID_POLL_COLLECTION)
    .where("autoRepeatWeekly", "==", true)
    .limit(50)
    .get();

  let checked = 0;
  let repeated = 0;
  let deleted = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const poll = normalizeRaidPoll(doc.id, doc.data() || {});
    if (!poll.repeatNextAtMs || poll.repeatNextAtMs > nowMs) continue;
    checked += 1;
    const lockId = randomUUID();
    const claimed = await claimRaidPollRepeat(doc.id, nowMs, lockId).catch((error) => {
      failed += 1;
      console.warn("[raidPolls] Failed to claim repeated poll", { pollId: doc.id, message: error instanceof Error ? error.message : String(error) });
      return null;
    });
    if (!claimed) continue;

    await createRepeatedRaidPoll(claimed)
      .then((result) => {
        repeated += 1;
        if (result.discordDeleted) deleted += 1;
        if (result.discordDeleteFailed) failed += 1;
      })
      .catch(async (error) => {
        failed += 1;
        await markRaidPollRepeatFailed(claimed.id, error instanceof Error ? error.message : String(error));
        console.warn("[raidPolls] Failed to repeat raid poll", { pollId: claimed.id, message: error instanceof Error ? error.message : String(error) });
      });
  }

  return { checked, repeated, deleted, failed };
}

export async function closeDueRaidPoll(input: RaidPollItem) {
  if (input.status === "closed" || input.closesAtMs > Date.now()) return input;
  return closeRaidPoll(input.id, "auto", { silentIfClosed: true });
}

export async function closeDueRaidPolls() {
  if (!hasRaidPollStorage()) return { checked: 0, closed: 0, repeatedChecked: 0, repeated: 0, deleted: 0, failed: 0, errors: [] as string[] };

  const nowMs = Date.now();
  let openPolls: RaidPollItem[] = [];
  let failed = 0;
  const errors: string[] = [];

  try {
    // Не використовуємо composite query status + closesAtMs. У проді це легко ламається без
    // Firestore composite-index і перетворює кожний cron у 500. Беремо відкриті пули
    // невеликим батчем і фільтруємо due-стан у коді.
    const snap = await getFirebaseAdminDb()
      .collection(RAID_POLL_COLLECTION)
      .where("status", "==", "open")
      .limit(80)
      .get();
    openPolls = snap.docs.map((doc: QueryDocumentSnapshot) => normalizeRaidPoll(doc.id, doc.data() || {}));
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error || "unknown");
    errors.push(message.slice(0, 220));
    console.warn("[raidPolls] Failed to read due polls", { message });
  }

  let closed = 0;
  const duePolls = openPolls
    .filter((poll) => poll.status !== "closed" && poll.closesAtMs <= nowMs)
    .sort((a, b) => a.closesAtMs - b.closesAtMs)
    .slice(0, 20);

  for (const poll of duePolls) {
    await closeRaidPoll(poll.id, "auto", { silentIfClosed: true })
      .then(() => { closed += 1; })
      .catch((error) => {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error || "unknown");
        errors.push(`${poll.id}: ${message}`.slice(0, 220));
        console.warn("[raidPolls] Failed to close due poll", { pollId: poll.id, message });
      });
  }

  const repeated = await repeatDueRaidPolls().catch((error) => {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error || "unknown");
    errors.push(`repeat: ${message}`.slice(0, 220));
    console.warn("[raidPolls] Failed to repeat due polls", { message });
    return { checked: 0, repeated: 0, deleted: 0, failed: 0 };
  });

  return {
    checked: duePolls.length,
    scanned: openPolls.length,
    closed,
    repeatedChecked: repeated.checked,
    repeated: repeated.repeated,
    deleted: repeated.deleted,
    failed: failed + repeated.failed,
    errors: errors.slice(0, 8),
  };
}

export async function closeRaidPoll(pollId: string, reason: "manual" | "auto" = "manual", options: { silentIfClosed?: boolean } = {}) {
  if (!hasRaidPollStorage()) throw new Error(firebaseUnavailableMessage("raid", "write"));
  const closedAt = new Date().toISOString();
  const updated = await firebaseWrite<RaidPollItem>("raid", `raid-poll:close:${pollId}:${reason}`, async () => {
    const ref = pollRef(pollId);
    return getFirebaseAdminDb().runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Рейд-пул не знайдено.");
      const poll = normalizeRaidPoll(snap.id, snap.data() || {});
      if (poll.status === "closed") return poll;
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

function pollCharacterOptionLabel(character: ProfileCharacter, index: number) {
  const realm = character.realmName || character.realmSlug || "realm";
  const prefix = index === 0 ? "★ " : character.verifiedGuild ? "" : "🤝 ";
  return `${prefix}${character.name || "Персонаж"} • ${realm}`.slice(0, 100);
}

function pollCharacterOptionDescription(character: ProfileCharacter) {
  return ([
    character.verifiedGuild ? "Гільдійний" : "Інший персонаж",
    character.activeSpecName || null,
    character.className || null,
    character.itemLevel ? `${character.itemLevel} ilvl` : null,
  ].filter(Boolean).join(" • ").slice(0, 100) || "Персонаж Battle.net");
}

function buildRaidPollCharacterSelectComponents(pollId: string, profile: DashboardProfile, selectedCharacterKey?: string | null) {
  const options = orderedProfileCharacters(profile)
    .slice(0, 25)
    .map((character, index) => ({
      label: pollCharacterOptionLabel(character, index),
      description: pollCharacterOptionDescription(character),
      value: `c${index}`,
      default: selectedCharacterKey ? normalizeCharacterKey(character.key) === normalizeCharacterKey(selectedCharacterKey) : index === 0,
    }));

  if (!options.length) return [];
  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `${RAID_POLL_ACTION_PREFIX}_character:${pollId}`,
          placeholder: "Обери персонажа з dashboard-профілю",
          min_values: 1,
          max_values: 1,
          options,
        },
      ],
    },
  ];
}

function profileLinkComponents() {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: "Відкрити dashboard-профіль", url: `${dashboardBaseUrl()}/profile` },
      ],
    },
  ];
}

function resolvePollProfileCharacter(profile: DashboardProfile | null, selectorInput: unknown) {
  const selector = cleanCharacterSelector(selectorInput || "main");
  const characters = orderedProfileCharacters(profile);
  if (!characters.length) return null;
  if (selector === "main") return characters[0] || null;
  const characterIndexMatch = selector.match(/^c(\d{1,2})$/i);
  if (characterIndexMatch) return characters[Number(characterIndexMatch[1])] || null;
  const altMatch = selector.match(/^alt_(\d+)$/);
  if (altMatch) return characters[Math.max(1, Number(altMatch[1]))] || null;
  const key = normalizeCharacterKey(selector);
  return key ? characters.find((character) => normalizeCharacterKey(character.key) === key) || null : null;
}

async function refreshProfileBeforePollVote(profile: DashboardProfile | null, context: { pollId: string; userId: string }) {
  if (!profile?.characters?.length) return profile;
  try {
    return await refreshProfileCharactersForRaidSignup(profile);
  } catch (error) {
    console.warn("[raidPolls] Battle.net character refresh before poll vote failed", {
      pollId: context.pollId,
      userId: context.userId,
      profileId: profile.profileId,
      message: error instanceof Error ? error.message : String(error),
    });
    return profile;
  }
}

function voteCharacterPayload(profile: DashboardProfile | null, selector: unknown) {
  const character = resolvePollProfileCharacter(profile, selector);
  if (!character) return null;
  const manualRole = profile?.raidRolePreference?.characterKey === character.key ? profile.raidRolePreference?.role : null;
  const resolvedRole = manualRole === "tank" || manualRole === "healer" || manualRole === "dps"
    ? manualRole
    : resolveWowCharacterRole({
        className: character.className,
        activeSpecName: character.activeSpecName,
        activeSpecId: character.activeSpecId,
        activeSpecRole: character.activeSpecRole,
      });
  return {
    characterKey: character.key || null,
    characterName: character.name || null,
    characterClass: character.className || null,
    characterRole: resolvedRole,
    characterRealm: character.realmName || character.realmSlug || null,
    characterRegion: character.region || "eu",
  } satisfies Pick<RaidPollVote, "characterKey" | "characterName" | "characterClass" | "characterRole" | "characterRealm" | "characterRegion">;
}

function normalizeVoteScheduleForPoll(poll: RaidPollItem, schedule: RaidPollSchedule) {
  const allowed = new Set((poll.days?.length ? poll.days : RAID_POLL_DAYS.map((day) => day.value)) as RaidPollDay[]);
  const next: RaidPollSchedule = {};
  for (const day of RAID_POLL_DAYS) {
    if (!allowed.has(day.value)) continue;
    const value = compactScheduleValue(schedule[day.value]);
    if (value) next[day.value] = value;
  }
  return next;
}


function scheduleGroupDays(groupKey: string | null | undefined, poll: Pick<RaidPollItem, "days">): RaidPollDay[] {
  const active = new Set((poll.days?.length ? poll.days : RAID_POLL_DAYS.map((day) => day.value)) as RaidPollDay[]);
  const group = RAID_POLL_PRIVATE_SCHEDULE_GROUPS.find((item) => item.key === groupKey);
  return (group?.days || []).filter((day) => active.has(day));
}

function shouldAutoAttachMainCharacter(kind: "days" | "time" | "schedule" | "character" | "character_prompt", existing: RaidPollVote | undefined) {
  if (kind === "character" || kind === "character_prompt") return false;
  return !existing?.characterKey && !existing?.characterName;
}

function dedupeSchedulePatch(schedule: RaidPollSchedule) {
  const next: RaidPollSchedule = {};
  for (const day of RAID_POLL_DAYS) {
    const value = compactScheduleValue(schedule[day.value]);
    if (value) next[day.value] = value;
  }
  return next;
}

export async function handleRaidPollDiscordVote(params: {
  pollId: string;
  kind: "days" | "time" | "schedule" | "character" | "character_prompt" | "role" | "submit";
  group?: string | null;
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
  let profile = await getProfileByDiscordUserId(userId).catch(() => null);
  profile = await refreshProfileBeforePollVote(profile, { pollId: params.pollId, userId });

  const readPollAndDraft = async () => {
    const snap = await pollRef(params.pollId).get();
    if (!snap.exists) return null;
    const poll = normalizeRaidPoll(snap.id, snap.data() || {});
    const existingVote = poll.votes.find((vote) => vote.discordId === userId) || null;
    const fallback = existingVote
      ? draftFromExistingVote(existingVote, nowIso)
      : baseDraftForUser({ ...params, userId }, nowIso);
    const draft = voteDraftFromPollData(snap.data() || {}, userId, fallback);
    return { poll, draft, data: snap.data() || {} };
  };

  if (params.kind === "character_prompt") {
    const state = await readPollAndDraft();
    if (!state) return { ok: false, content: "❌ Рейд-пул не знайдено або його було видалено." };
    const { poll, draft } = state;
    if (poll.status === "closed" || poll.closesAtMs <= Date.now()) {
      return { ok: false, closed: true, poll, content: "🔒 Голосування вже завершено. Голос змінити не можна." };
    }
    if (!profile?.characters?.length) {
      return {
        ok: false,
        poll,
        content: "⚠️ Не знайшов персонажів у твоєму dashboard-профілі. Відкрий профіль, привʼяжи Battle.net і додай персонажів, тоді повернись до голосування.",
        components: profileLinkComponents(),
      };
    }

    return {
      ok: true,
      poll,
      content: draftPromptContent(draft, poll),
      components: buildRaidPollVoteDraftComponents(poll, profile, draft),
    };
  }

  if (!profile?.characters?.length && (params.kind === "character" || params.kind === "submit")) {
    return {
      ok: false,
      content: "⚠️ Не знайшов персонажів у твоєму dashboard-профілі. Привʼяжи Battle.net/персонажів на сайті, тоді повернись до голосування.",
      components: profileLinkComponents(),
    };
  }

  const result = await firebaseWrite<RaidPollVoteResult>("raid", `raid-poll:vote:${params.pollId}:${userId}:${params.kind}`, async () => {
    const ref = pollRef(params.pollId);
    return getFirebaseAdminDb().runTransaction(async (tx: Transaction) => {
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

      const existing = poll.votes.find((vote) => vote.discordId === userId) || null;
      const fallback = existing
        ? draftFromExistingVote(existing, nowIso)
        : baseDraftForUser({ ...params, userId }, nowIso);
      let draft = voteDraftFromPollData(snap.data() || {}, userId, fallback);
      draft = {
        ...draft,
        discordName: cleanString(params.userName, 100) || draft.discordName,
        guildId: cleanSnowflake(params.guildId) || draft.guildId,
        guildName: cleanString(params.guildName, 120) || draft.guildName,
        updatedAt: nowIso,
      };

      if (params.kind === "character") {
        const selectedCharacter = voteCharacterPayload(profile, params.values[0] || "main");
        if (!selectedCharacter) {
          return {
            ok: false,
            poll,
            content: "⚠️ Не знайшов персонажа у твоєму dashboard-профілі. Привʼяжи Battle.net/персонажів на сайті або обери інший пункт персонажа.",
            components: profile ? profileLinkComponents() : [],
          };
        }
        const selectedCharacterKey = normalizeCharacterKey(selectedCharacter.characterKey || "");
        const previousCharacterKey = normalizeCharacterKey(draft.characterKey || "");
        const changedCharacter = Boolean(previousCharacterKey && selectedCharacterKey && previousCharacterKey !== selectedCharacterKey);
        const explicitRole = !changedCharacter && draft.roleSelected ? draft.characterRole : null;
        draft = {
          ...draft,
          ...selectedCharacter,
          characterRole: explicitRole,
          roleSelected: Boolean(explicitRole),
          selectedDays: activeDaysFromSchedule(draft.schedule),
          selectedTime: firstTimeFromSchedule(draft.schedule),
        };
      } else if (params.kind === "role") {
        const selectedRole = cleanCharacterRole(params.values[0]);
        if (!selectedRole) {
          return { ok: false, poll, content: "⚠️ Роль не розпізнано. Обери Танк / Хіл / ДД." };
        }
        draft = {
          ...draft,
          characterRole: selectedRole,
          roleSelected: true,
        };
      } else if (params.kind === "schedule") {
        const patch = parseScheduleValues(params.values);
        const groupDays = scheduleGroupDays(params.group, poll);
        const nextDraftSchedule: RaidPollSchedule = { ...draft.schedule };
        for (const day of groupDays) delete nextDraftSchedule[day];
        const nextSchedule = normalizeVoteScheduleForPoll(poll, dedupeSchedulePatch({ ...nextDraftSchedule, ...patch }));
        draft = {
          ...draft,
          schedule: nextSchedule,
          selectedDays: activeDaysFromSchedule(nextSchedule),
          selectedTime: firstTimeFromSchedule(nextSchedule),
        };
      } else if (params.kind === "days") {
        const legacyDays = cleanPollDays(params.values);
        const fallbackTime = draft.selectedTime || firstTimeFromSchedule(draft.schedule) || "19:00";
        const nextSchedule = { ...draft.schedule };
        for (const day of legacyDays) nextSchedule[day] = fallbackTime;
        const normalizedSchedule = normalizeVoteScheduleForPoll(poll, nextSchedule);
        draft = {
          ...draft,
          schedule: normalizedSchedule,
          selectedDays: activeDaysFromSchedule(normalizedSchedule),
          selectedTime: firstTimeFromSchedule(normalizedSchedule),
        };
      } else if (params.kind === "time") {
        const nextTime = cleanPollTime(params.values[0]);
        if (nextTime) {
          const days = activeDaysFromSchedule(draft.schedule).length ? activeDaysFromSchedule(draft.schedule) : poll.days;
          const nextSchedule = { ...draft.schedule };
          for (const day of days) nextSchedule[day] = nextTime;
          const normalizedSchedule = normalizeVoteScheduleForPoll(poll, nextSchedule);
          draft = {
            ...draft,
            schedule: normalizedSchedule,
            selectedDays: activeDaysFromSchedule(normalizedSchedule),
            selectedTime: firstTimeFromSchedule(normalizedSchedule),
          };
        }
      }

      if (params.kind !== "submit") {
        tx.update(ref, {
          [`voteDraftsByDiscordId.${userId}`]: voteDraftToFirestore(draft),
          voteDraftsUpdatedAtMs: Date.now(),
          ...(params.messageRef?.channelId ? { channelId: params.messageRef.channelId } : {}),
          ...(params.messageRef?.messageId ? { messageId: params.messageRef.messageId } : {}),
        });

        return {
          ok: true,
          poll,
          content: params.kind === "character_prompt" ? draftPromptContent(draft, poll) : draftSavedContent(draft, poll),
          components: profile ? buildRaidPollVoteDraftComponents(poll, profile, draft) : [],
        };
      }

      if (!isDraftReadyToSubmit(draft)) {
        return {
          ok: false,
          poll,
          content: `⚠️ Голос ще не зараховано.\n${draftReadinessLines(draft, poll)}`,
          components: profile ? buildRaidPollVoteDraftComponents(poll, profile, draft) : [],
        };
      }

      const finalSchedule = normalizeVoteScheduleForPoll(poll, draft.schedule);
      const finalVote: RaidPollVote = {
        discordId: userId,
        discordName: draft.discordName,
        guildId: draft.guildId,
        guildName: draft.guildName,
        selectedDays: activeDaysFromSchedule(finalSchedule),
        selectedTime: firstTimeFromSchedule(finalSchedule),
        schedule: finalSchedule,
        characterKey: draft.characterKey || null,
        characterName: draft.characterName || null,
        characterClass: draft.characterClass || null,
        characterRole: draft.characterRole || null,
        characterRealm: draft.characterRealm || null,
        characterRegion: draft.characterRegion || null,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      tx.update(ref, {
        [`votesByDiscordId.${userId}`]: finalVote,
        [`voteDraftsByDiscordId.${userId}`]: FieldValue.delete(),
        updatedAt: nowIso,
        updatedAtMs: Date.now(),
        ...(params.messageRef?.channelId ? { channelId: params.messageRef.channelId } : {}),
        ...(params.messageRef?.messageId ? { messageId: params.messageRef.messageId } : {}),
      });

      const votes = poll.votes.filter((vote) => vote.discordId !== userId).concat(finalVote);
      changedPoll = {
        ...poll,
        channelId: params.messageRef?.channelId || poll.channelId,
        messageId: params.messageRef?.messageId || poll.messageId,
        messageUrl: params.messageRef?.channelId && params.messageRef?.messageId ? discordMessageUrl(params.messageRef.channelId, params.messageRef.messageId) : poll.messageUrl,
        votes,
        updatedAt: nowIso,
      };

      const submittedDraft = draftFromExistingVote(finalVote, nowIso);
      return {
        ok: true,
        poll: changedPoll,
        content: submittedVoteContent(finalVote, poll),
        components: buildRaidPollSubmittedComponents(changedPoll),
      };
    });
  }, { logEvent: "raid_polls.vote_failed" });

  if (result.poll) {
    clearRaidPollRuntimeCaches(result.poll.id);
  }
  if (changedPoll) {
    await editPollDiscordMessage(changedPoll).catch(() => null);
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
