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

export type RaidPollCreateInput = {
  title?: unknown;
  difficulty?: unknown;
  description?: unknown;
  channelId?: unknown;
  closeAfterMinutes?: unknown;
};

export const RAID_POLL_DESCRIPTION = "Будь ласка, оберіть дні та час, коли ви готові взяти участь у гільдійському рейді. Голос враховується для формування основного складу.";

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
  { minutes: 720, label: "12 годин" },
  { minutes: 1440, label: "24 години" },
  { minutes: 2880, label: "48 годин" },
];

export function raidPollDescription() {
  return RAID_POLL_DESCRIPTION;
}
