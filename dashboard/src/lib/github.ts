import { FieldValue } from "firebase-admin/firestore";
import { mapConcurrent } from "@/lib/concurrency";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export const STATUS_LABELS = [
  "status:review",
  "status:accepted",
  "status:declined",

  // Legacy broken labels created by older dashboard/bot builds.
  "statusreview",
  "statusaccepted",
  "statusdeclined",
  "status:approved",
  "status:rejected",
  "statusapproved",
  "statusrejected",
];

const LABEL_COLORS: Record<string, string> = {
  "guild-application": "5865F2",
  "status:review": "D4A63A",
  "status:accepted": "3BA55D",
  "status:declined": "ED4245",
  "status:approved": "3BA55D",
  "status:rejected": "ED4245",
};

export type ApplicationStatus = "accepted" | "declined" | "review";

export type RaiderIoScoreBlock = {
  all?: number | string | null;
  dps?: number | string | null;
  healer?: number | string | null;
  tank?: number | string | null;
};

export type RaiderIoRaidBlock = {
  key?: string;
  name?: string;
  summary?: string;
  total_bosses?: number;
  normal_bosses_killed?: number;
  heroic_bosses_killed?: number;
  mythic_bosses_killed?: number;
};

export type RaiderIoApplicationData = {
  profile_url?: string | null;
  thumbnail_url?: string | null;
  profile_banner?: string | null;
  mythic_plus?: {
    current?: RaiderIoScoreBlock;
    previous?: RaiderIoScoreBlock;
  };
  raids?: {
    current?: RaiderIoRaidBlock[];
    previous?: RaiderIoRaidBlock[];
  };
};

export type ApplicationItem = {
  [key: string]: unknown;
  id?: string;
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  status_key: ApplicationStatus;
  status_text: string;
  character_name?: string;
  realm?: string;
  region?: string;
  faction?: string;
  class_name?: string;
  source?: string;
  availability?: string;
  discord?: string | null;
  battle_tag?: string | null;
  avatar_url?: string | null;
  profile_url?: string | null;
  raider_io?: RaiderIoApplicationData | null;
  raider_io_error?: string | null;
  discord_ref?: DiscordMessageRef | null;
  discord_message_ref?: { channel_id?: string | null; message_id?: string | null } | null;
  labels: string[];
};

export type DiscordMessageRef = {
  channel_id: string;
  message_id: string;
};

export function extractDiscordMessageRef(body: string): DiscordMessageRef | null {
  const match = String(body || "").match(/<!--\s*mistblossom:discord\s+({[\s\S]*?})\s*-->/i);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]);
    const channelId = String(parsed.channel_id || "").trim();
    const messageId = String(parsed.message_id || "").trim();

    if (!channelId || !messageId) return null;

    return {
      channel_id: channelId,
      message_id: messageId,
    };
  } catch {
    return null;
  }
}

export function normalizeStatus(value: string): ApplicationStatus {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "")
    .replace(/:/g, "");

  if (normalized === "accepted" || normalized === "statusaccepted" || normalized === "approved" || normalized === "statusapproved") {
    return "accepted";
  }

  if (normalized === "declined" || normalized === "statusdeclined" || normalized === "rejected" || normalized === "statusrejected") {
    return "declined";
  }

  return "review";
}

export function statusLabel(status: ApplicationStatus) {
  if (status === "accepted") return "status:accepted";
  if (status === "declined") return "status:declined";
  return "status:review";
}

export function statusText(status: ApplicationStatus) {
  if (status === "accepted") return "Прийнято";
  if (status === "declined") return "Відхилено";
  return "На розгляді";
}

export function statusEmoji(status: ApplicationStatus) {
  if (status === "accepted") return "✅";
  if (status === "declined") return "❌";
  return "🔎";
}

export function statusColor(status: ApplicationStatus) {
  if (status === "accepted") return 0x3ba55d;
  if (status === "declined") return 0xed4245;
  return 0xd4a63a;
}

function isMissingLabelError(error: unknown) {
  return String((error as Error)?.message || error || "")
    .toLowerCase()
    .includes("label does not exist");
}

function isAlreadyExistsError(error: unknown) {
  return String((error as Error)?.message || error || "")
    .toLowerCase()
    .includes("already_exists");
}

export async function githubFetch(path: string, init: RequestInit = {}) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("GitHub env is not configured");
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mistblossom-dashboard",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = raw || `GitHub API error ${response.status}`;
    try {
      const data = raw ? JSON.parse(raw) : null;
      message = data?.message || message;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

export async function ensureGitHubLabel(name: string) {
  const color = LABEL_COLORS[name] || "5865F2";

  try {
    await githubFetch(`/labels/${encodeURIComponent(name)}`);
    return { ok: true, existed: true };
  } catch {
    try {
      await githubFetch(`/labels`, {
        method: "POST",
        body: JSON.stringify({
          name,
          color,
          description: name.startsWith("status:")
            ? "Guild application status"
            : "Guild application",
        }),
      });

      return { ok: true, created: true };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return { ok: true, existed: true };
      }

      throw error;
    }
  }
}

export async function ensureApplicationLabels() {
  await Promise.all([
    ensureGitHubLabel(process.env.GUILD_APPLICATIONS_LABEL || "guild-application"),
    ensureGitHubLabel("status:review"),
    ensureGitHubLabel("status:accepted"),
    ensureGitHubLabel("status:declined"),
  ]);
}

export function getIssueStatusFromLabels(labels: Array<{ name?: string } | string>): ApplicationStatus {
  const names = labels.map((label) =>
    typeof label === "string" ? label.toLowerCase() : String(label.name || "").toLowerCase()
  );

  if (
    names.includes("status:accepted") ||
    names.includes("statusaccepted") ||
    names.includes("status:approved") ||
    names.includes("statusapproved")
  ) {
    return "accepted";
  }

  if (
    names.includes("status:declined") ||
    names.includes("statusdeclined") ||
    names.includes("status:rejected") ||
    names.includes("statusrejected")
  ) {
    return "declined";
  }

  return "review";
}

function extract(body: string, pattern: RegExp) {
  return (String(body || "").match(pattern)?.[1] || "").trim();
}

function isRedactedBattleTagValue(value: string) {
  return /приховано|hidden|redacted/i.test(value);
}

function cleanBattleTagCandidate(value: unknown) {
  const clean = stripDiscordMarker(String(value || ""))
    .replace(/^`+|`+$/g, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^>+\s*/g, "")
    .trim()
    .split(/\r?\n/)[0]
    .trim();

  if (!clean || isRedactedBattleTagValue(clean)) return null;

  const direct = clean.match(/[\p{L}\p{N}_-]{2,32}#\d{3,6}/u)?.[0] || "";
  return direct && !isRedactedBattleTagValue(direct) ? direct.trim() : null;
}

function extractBattleTag(body: string) {
  const text = String(body || "");

  const metadataPatterns = [
    /["']?battle[_-]?tag["']?\s*[:=]\s*["']([^"'\n,}]+)["']/im,
    /["']?battletag["']?\s*[:=]\s*["']([^"'\n,}]+)["']/im,
    /<!--\s*mistblossom:(?:application|guild-application|battletag|battle-tag)\s+({[\s\S]*?})\s*-->/im,
  ];

  for (const pattern of metadataPatterns) {
    const match = text.match(pattern);
    const rawValue = match?.[1] || "";

    if (rawValue.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(rawValue);
        const candidate = cleanBattleTagCandidate(parsed.battle_tag || parsed.battleTag || parsed.battletag || parsed.bnet_tag || parsed.bnetTag);
        if (candidate) return candidate;
      } catch {
        // Continue with visible body patterns.
      }
    } else {
      const candidate = cleanBattleTagCandidate(rawValue);
      if (candidate) return candidate;
    }
  }

  const labelPatterns = [
    /^\s*(?:[-*•]\s*)?(?:\*\*)?Battle\s*Tag(?:\*\*)?\s*[:：-]\s*(.+)$/gim,
    /^\s*(?:[-*•]\s*)?(?:\*\*)?Battle\.net(?:\s*(?:tag|тег))?(?:\*\*)?\s*[:：-]\s*(.+)$/gim,
    /^\s*(?:[-*•]\s*)?(?:\*\*)?BNet(?:\s*(?:tag|тег))?(?:\*\*)?\s*[:：-]\s*(.+)$/gim,
    /^\s*(?:[-*•]\s*)?(?:\*\*)?Батл(?:\.net|нет)?\s*(?:тег|tag)?(?:\*\*)?\s*[:：-]\s*(.+)$/gim,
    /^\s*(?:[-*•]\s*)?(?:\*\*)?Бател\s*тег(?:\*\*)?\s*[:：-]\s*(.+)$/gim,
    /^\s*#{1,6}\s*(?:Battle\s*Tag|Battle\.net|BNet|Батл(?:\.net|нет)?\s*(?:тег|tag)?|Бател\s*тег)\s*\r?\n([^#\r\n]+)/gim,
    /^\s*\|\s*(?:Battle\s*Tag|Battle\.net|BNet|Батл(?:\.net|нет)?\s*(?:тег|tag)?|Бател\s*тег)\s*\|\s*([^|\r\n]+)\s*\|/gim,
  ];

  for (const pattern of labelPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    const candidate = cleanBattleTagCandidate(match?.[1]);
    if (candidate) return candidate;
  }

  return cleanBattleTagCandidate(text);
}

function stripDiscordMarker(value: string) {
  return String(value || "")
    .replace(/<!--\s*mistblossom:discord[\s\S]*?-->/gi, "")
    .trim();
}

function extractAvailability(body: string) {
  const section = String(body || "").split("### Коли зазвичай грає")[1] || "";
  return stripDiscordMarker(section);
}

function slugifyRaiderIoValue(value?: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeScoreBlock(season: any): RaiderIoScoreBlock {
  const scores = season?.scores || {};
  return {
    all: scores.all ?? null,
    dps: scores.dps ?? null,
    healer: scores.healer ?? null,
    tank: scores.tank ?? null,
  };
}

function prettifyRaidKey(key?: string) {
  return String(key || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasRaidProgressData(raid: any) {
  if (!raid || typeof raid !== "object") return false;
  if (String(raid.summary || "").trim()) return true;

  return (
    Number(raid.normal_bosses_killed || 0) > 0 ||
    Number(raid.heroic_bosses_killed || 0) > 0 ||
    Number(raid.mythic_bosses_killed || 0) > 0
  );
}

function normalizeRaidBlock(key: string, raid: any): RaiderIoRaidBlock {
  return {
    key,
    name: prettifyRaidKey(key),
    summary: String(raid?.summary || "").trim() || undefined,
    total_bosses: Number(raid?.total_bosses || 0) || undefined,
    normal_bosses_killed: Number(raid?.normal_bosses_killed || 0) || undefined,
    heroic_bosses_killed: Number(raid?.heroic_bosses_killed || 0) || undefined,
    mythic_bosses_killed: Number(raid?.mythic_bosses_killed || 0) || undefined,
  };
}

function splitRaidProgressionByExpansion(raidProgression: any) {
  const entries = Object.entries(raidProgression || {})
    .map(([key, value]: [string, any]) => ({
      key,
      ...(value || {}),
    }))
    .filter((item: any) => Number.isFinite(Number(item.expansion_id)));

  const grouped = new Map<number, any[]>();

  for (const raid of entries) {
    const expansionId = Number(raid.expansion_id);
    if (!grouped.has(expansionId)) grouped.set(expansionId, []);
    grouped.get(expansionId)!.push(raid);
  }

  const expansionIds = Array.from(grouped.keys()).sort((a, b) => b - a);

  return {
    current: expansionIds.length ? grouped.get(expansionIds[0]) || [] : [],
    previous: expansionIds.length > 1 ? grouped.get(expansionIds[1]) || [] : [],
  };
}

export async function fetchRaiderIoForApplication(item: ApplicationItem): Promise<{
  data: RaiderIoApplicationData | null;
  error: string | null;
}> {
  const region = String(item.region || "").toLowerCase();
  const realm = slugifyRaiderIoValue(item.realm);
  const name = slugifyRaiderIoValue(item.character_name);

  if (!region || !realm || !name) {
    return {
      data: null,
      error: "Не вистачає region/realm/name для Raider.IO.",
    };
  }

  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realm);
  url.searchParams.set("name", name);
  url.searchParams.set(
    "fields",
    "mythic_plus_scores_by_season:current:previous,raid_progression:current-expansion:previous-expansion"
  );

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    const raw = await response.text();
    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        data: null,
        error: payload?.message || payload?.error || `Raider.IO HTTP ${response.status}`,
      };
    }

    const seasons = Array.isArray(payload?.mythic_plus_scores_by_season)
      ? payload.mythic_plus_scores_by_season
      : [];

    const raidGroups = splitRaidProgressionByExpansion(payload?.raid_progression);

    return {
      data: {
        profile_url: payload?.profile_url || null,
        thumbnail_url: payload?.thumbnail_url || null,
        profile_banner: payload?.profile_banner || null,
        mythic_plus: {
          current: normalizeScoreBlock(seasons[0]),
          previous: normalizeScoreBlock(seasons[1]),
        },
        raids: {
          current: raidGroups.current
            .filter(hasRaidProgressData)
            .slice(0, 8)
            .map((raid: any) => normalizeRaidBlock(raid.key, raid)),
          previous: raidGroups.previous
            .filter(hasRaidProgressData)
            .slice(0, 8)
            .map((raid: any) => normalizeRaidBlock(raid.key, raid)),
        },
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Не вдалося отримати Raider.IO.",
    };
  }
}

function parseDiscordMessageRef(body: string): { channel_id?: string | null; message_id?: string | null } | null {
  const match = String(body || "").match(/<!--\s*mistblossom:discord\s+({[\s\S]*?})\s*-->/);

  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    return {
      channel_id: parsed.channel_id || null,
      message_id: parsed.message_id || null,
    };
  } catch {
    return null;
  }
}

export function mapApplicationIssue(issue: any): ApplicationItem {
  const body = String(issue.body || "");
  const status = getIssueStatusFromLabels(issue.labels || []);

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    html_url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    closed_at: issue.closed_at,
    status_key: status,
    status_text: statusText(status),
    character_name: extract(body, /- Ім’я персонажа: (.+)/),
    realm: extract(body, /- Реалм: (.+)/),
    region: extract(body, /- Регіон: (.+)/),
    faction: extract(body, /- Фракція: (.+)/),
    class_name: extract(body, /- Клас: (.+)/),
    source: extract(body, /- Звідки дізнався: (.+)/),
    availability: extractAvailability(body),
    battle_tag: extractBattleTag(body),
    avatar_url: null,
    profile_url: null,
    raider_io: null,
    raider_io_error: null,
    discord_ref: extractDiscordMessageRef(body),
    discord_message_ref: parseDiscordMessageRef(body),
    labels: Array.isArray(issue.labels) ? issue.labels.map((label: any) => label.name) : [],
  };
}

export async function listIssues() {
  const label = process.env.GUILD_APPLICATIONS_LABEL || "guild-application";

  try {
    await ensureGitHubLabel(label);

    const issues = await githubFetch(
      `/issues?state=all&labels=${encodeURIComponent(label)}&per_page=100&sort=created&direction=desc`
    );

    return Array.isArray(issues) ? issues.filter((issue: any) => !issue.pull_request) : [];
  } catch (error) {
    if (isMissingLabelError(error)) {
      return [];
    }

    throw error;
  }
}


const SENSITIVE_APPLICATION_FIELD_RE = /battle[_-]?tag|battletag|bnet[_-]?tag|^discord$|discord[_-]?id|discord[_-]?tag|discord[_-]?ref|discord[_-]?message[_-]?ref/i;
const BATTLE_TAG_TEXT_RE = /(^|[^\p{L}\p{N}_-])([\p{L}\p{N}_-]{2,32}#\d{3,6})(?=$|[^\p{L}\p{N}_-])/gu;

function redactApplicationText(value: string) {
  return value.replace(BATTLE_TAG_TEXT_RE, "$1BattleTag приховано");
}

function redactApplicationValueForReadOnlyViewer(value: unknown): unknown {
  if (typeof value === "string") return redactApplicationText(value);
  if (Array.isArray(value)) return value.map((item) => redactApplicationValueForReadOnlyViewer(item));
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_APPLICATION_FIELD_RE.test(key)) continue;
    output[key] = redactApplicationValueForReadOnlyViewer(nestedValue);
  }
  return output;
}

export function sanitizeApplicationForMentorViewer(item: ApplicationItem): ApplicationItem {
  const sanitized = redactApplicationValueForReadOnlyViewer(item) as ApplicationItem;

  return {
    ...sanitized,
    html_url: "",
    discord: null,
    battle_tag: null,
    discord_ref: null,
    discord_message_ref: null,
    labels: Array.isArray(sanitized.labels) ? sanitized.labels : [],
  };
}

export function sanitizeApplicationsForMentorViewer(items: ApplicationItem[]): ApplicationItem[] {
  return items.map((item) => sanitizeApplicationForMentorViewer(item));
}

/**
 * Backward-compatible alias. Prefer sanitizeApplicationsForMentorViewer for new code,
 * so it is clear that this DTO is only for mentor/member read-only views.
 */
export const sanitizeApplicationForReadOnlyViewer = sanitizeApplicationForMentorViewer;
export const sanitizeApplicationsForReadOnlyViewer = sanitizeApplicationsForMentorViewer;


function applicationsCollectionName() {
  return process.env.FIREBASE_APPLICATIONS_COLLECTION || process.env.GUILD_APPLICATIONS_FIREBASE_COLLECTION || "guildApplications";
}

function normalizeTimestamp(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?._seconds === "number") return new Date(value._seconds * 1000).toISOString();
  return undefined;
}

function normalizeApplicationNumber(value: unknown, fallback: string) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0) return number;
  const fromId = Number(String(fallback || "").replace(/\D/g, ""));
  return Number.isInteger(fromId) && fromId > 0 ? fromId : Date.now();
}

function labelsForFirebaseStatus(status: ApplicationStatus) {
  return [process.env.GUILD_APPLICATIONS_LABEL || "guild-application", statusLabel(status)];
}

function buildFirebaseApplicationBody(item: ApplicationItem) {
  return [
    "### Персонаж",
    `- Регіон: ${item.region || "eu"}`,
    `- Ім’я персонажа: ${item.character_name || ""}`,
    `- Фракція: ${item.faction || ""}`,
    `- Реалм: ${item.realm || ""}`,
    `- Клас: ${item.class_name || "Не вказано"}`,
    "",
    "### Контакти",
    `- Discord: ${item.discord || "Приховано"}`,
    `- BattleTag: ${item.battle_tag || "Приховано"}`,
    `- Звідки дізнався: ${item.source || "Не вказано"}`,
    "",
    "### Коли зазвичай грає",
    item.availability || "Не вказано",
    item.discord_message_ref?.channel_id && item.discord_message_ref?.message_id
      ? `\n<!-- mistblossom:discord ${JSON.stringify({ channel_id: item.discord_message_ref.channel_id, message_id: item.discord_message_ref.message_id })} -->`
      : "",
  ].filter(Boolean).join("\n");
}

function mapFirebaseApplicationDoc(doc: any): ApplicationItem {
  const data = (doc.data() || {}) as Record<string, any>;
  const status = normalizeStatus(String(data.status_key || data.status || "review"));
  const number = normalizeApplicationNumber(data.number, doc.id);
  const createdAt = normalizeTimestamp(data.created_at || data.createdAt || data.submitted_at || data.submittedAt) || new Date(0).toISOString();
  const updatedAt = normalizeTimestamp(data.updated_at || data.updatedAt) || createdAt;
  const closedAt = normalizeTimestamp(data.closed_at || data.closedAt) || null;
  const discordMessageRef = data.discord_message_ref || data.discordMessageRef || null;

  const item: ApplicationItem = {
    id: doc.id,
    number,
    title: String(data.title || `Заявка до гільдії: ${data.character_name || data.characterName || "Персонаж"}`),
    state: String(data.state || (status === "review" ? "open" : "closed")),
    html_url: String(data.html_url || data.htmlUrl || ""),
    created_at: createdAt,
    updated_at: updatedAt,
    closed_at: closedAt,
    status_key: status,
    status_text: statusText(status),
    character_name: String(data.character_name || data.characterName || ""),
    realm: String(data.realm || ""),
    region: String(data.region || "eu"),
    faction: String(data.faction || ""),
    class_name: String(data.class_name || data.className || ""),
    source: String(data.source || ""),
    availability: String(data.availability || ""),
    discord: data.discord ? String(data.discord) : null,
    battle_tag: data.battle_tag || data.battleTag ? String(data.battle_tag || data.battleTag) : null,
    avatar_url: String(data.avatar_url || data.avatarUrl || data.raider_io?.thumbnail_url || data.raiderIo?.thumbnail_url || "") || null,
    profile_url: String(data.profile_url || data.profileUrl || data.raider_io?.profile_url || data.raiderIo?.profile_url || "") || null,
    raider_io: (data.raider_io || data.raiderIo || null) as RaiderIoApplicationData | null,
    raider_io_error: data.raider_io_error || data.raiderIoError || data.verification?.raider_io?.error || null,
    discord_ref: discordMessageRef,
    discord_message_ref: discordMessageRef,
    labels: Array.isArray(data.labels) ? data.labels.map((label: unknown) => String(label)) : labelsForFirebaseStatus(status),
  };

  if (!item.raider_io && data.verification?.raider_io?.data) item.raider_io = data.verification.raider_io.data;
  if (!item.avatar_url && item.raider_io?.thumbnail_url) item.avatar_url = item.raider_io.thumbnail_url;
  if (!item.profile_url && item.raider_io?.profile_url) item.profile_url = item.raider_io.profile_url;
  return item;
}

async function listFirebaseApplicationsBase() {
  const db = getFirebaseAdminDb();
  const collection = db.collection(applicationsCollectionName());
  const limit = Math.max(1, Math.min(Number(process.env.FIREBASE_APPLICATIONS_LIST_LIMIT || 300), 1000));
  const snapshot = await collection.orderBy("createdAtMs", "desc").limit(limit).get().catch(async (error) => {
    if (String(error?.message || "").toLowerCase().includes("createdatms")) {
      return collection.limit(limit).get();
    }
    throw error;
  });
  return snapshot.docs.map(mapFirebaseApplicationDoc);
}

async function findFirebaseApplicationDoc(issueNumber: number) {
  const db = getFirebaseAdminDb();
  const collection = db.collection(applicationsCollectionName());
  const snapshot = await collection.where("number", "==", Number(issueNumber)).limit(1).get();
  if (!snapshot.empty) return snapshot.docs[0];
  const fallback = await collection.doc(`application-${issueNumber}`).get();
  return fallback.exists ? fallback : null;
}

export async function listApplicationFilterOptions() {
  const items = await listFirebaseApplicationsBase();
  return {
    classes: Array.from(new Set(items.map((item) => String(item.class_name || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk")),
    total: items.length,
  };
}

function timestampForApplicationSort(item: ApplicationItem, key: "created" | "updated") {
  const value = key === "updated" ? item.updated_at || item.created_at : item.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export async function listApplications(params?: URLSearchParams) {
  let items = await listFirebaseApplicationsBase();

  const status = params?.get("status") || "";
  const query = (params?.get("q") || "").trim().toLowerCase();
  const className = (params?.get("class") || "").trim().toLowerCase();
  const sort = params?.get("sort") === "updated" ? "updated" : "created";

  if (status && status !== "all") {
    items = items.filter((item) => item.status_key === normalizeStatus(status));
  }

  if (className && className !== "all") {
    items = items.filter((item) => String(item.class_name || "").toLowerCase() === className);
  }

  if (query) {
    items = items.filter((item) =>
      [
        item.title,
        item.character_name,
        item.realm,
        item.region,
        item.faction,
        item.class_name,
        item.source,
        item.availability,
      ].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }

  items = [...items].sort((a, b) => timestampForApplicationSort(b, sort) - timestampForApplicationSort(a, sort));

  const { results } = await mapConcurrent(
    items,
    async (item) => {
      if (item.raider_io || item.raider_io_error) return item;
      const rio = await fetchRaiderIoForApplication(item);
      return {
        ...item,
        avatar_url: rio.data?.thumbnail_url || item.avatar_url || null,
        profile_url: rio.data?.profile_url || item.profile_url || null,
        raider_io: rio.data,
        raider_io_error: rio.error,
      };
    },
    {
      profile: "external-api",
      envKey: "RAIDERIO_LOOKUP_CONCURRENCY",
      maxEnvKey: "RAIDERIO_LOOKUP_MAX_CONCURRENCY",
      min: 2,
      max: 10,
      failFast: false,
    },
  );

  return results;
}

export async function getIssue(issueNumber: number) {
  const doc = await findFirebaseApplicationDoc(issueNumber);
  if (!doc) throw new Error("Заявку не знайдено у Firebase.");
  const item = mapFirebaseApplicationDoc(doc);
  return {
    ...item,
    body: buildFirebaseApplicationBody(item),
    html_url: item.html_url || "",
    labels: item.labels.map((name) => ({ name })),
  };
}

export async function setIssueStatus(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  source: "dashboard" | "discord";
}) {
  const issueNumber = Number(params.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("Invalid application number");
  }

  const status = normalizeStatus(params.status);
  const doc = await findFirebaseApplicationDoc(issueNumber);
  if (!doc) throw new Error("Заявку не знайдено у Firebase.");

  const nextLabel = statusLabel(status);
  const now = new Date().toISOString();
  await doc.ref.update({
    status,
    status_key: status,
    status_text: statusText(status),
    state: status === "review" ? "open" : "closed",
    closed_at: status === "review" ? null : now,
    updated_at: now,
    updatedAtMs: Date.now(),
    labels: labelsForFirebaseStatus(status),
    moderation_events: FieldValue.arrayUnion({
      status,
      moderator: params.moderator,
      source: params.source,
      at: now,
    }),
  });

  return {
    ok: true,
    status,
    label: nextLabel,
  };
}

export async function updateApplicationStatus(
  issueNumber: number,
  status: ApplicationStatus,
  moderator = "Dashboard"
) {
  const { moderateApplication } = await import("./moderation");

  return moderateApplication({
    issueNumber,
    status,
    moderator,
    source: "dashboard",
  });
}

