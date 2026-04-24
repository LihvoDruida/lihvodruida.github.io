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

function githubToken() {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || "";
}

function githubPermissionHint(message: string, status: number) {
  const normalized = String(message || "").toLowerCase();

  if (normalized.includes("resource not accessible by personal access token")) {
    return [
      "GitHub токен не має доступу до цього репозиторію або потрібних прав.",
      "Для панелі потрібен PAT з доступом до репозиторію з правами: Contents: Read and write, Issues: Read and write, Metadata: Read-only.",
      "Якщо використовується fine-grained PAT — перевір, що вибрано саме цей репозиторій, а не тільки профіль/організацію.",
      "Після зміни токена онови GITHUB_TOKEN або GITHUB_PAT у Vercel/ENV і redeploy.",
    ].join(" ");
  }

  if (status === 401 || normalized.includes("bad credentials")) {
    return "GitHub токен неправильний або прострочений. Онови GITHUB_TOKEN/GITHUB_PAT у ENV і зроби redeploy.";
  }

  if (status === 403) {
    return `GitHub відхилив запит через недостатні права токена: ${message}`;
  }

  return message || `GitHub API error ${status}`;
}

export async function githubFetch(path: string, init: RequestInit = {}) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = githubToken();

  if (!owner || !repo || !token) {
    throw new Error("GitHub ENV не налаштовано. Потрібні GITHUB_OWNER, GITHUB_REPO і GITHUB_TOKEN або GITHUB_PAT.");
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

    throw new Error(githubPermissionHint(message, response.status));
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

export async function getIssue(issueNumber: number) {
  return githubFetch(`/issues/${issueNumber}`);
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

export async function listApplications(params?: URLSearchParams) {
  const issues = await listIssues();
  let items = issues.map(mapApplicationIssue);

  const status = params?.get("status") || "";
  const query = (params?.get("q") || "").trim().toLowerCase();
  const className = (params?.get("class") || "").trim().toLowerCase();

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

  return Promise.all(
    items.map(async (item) => {
      const rio = await fetchRaiderIoForApplication(item);
      return {
        ...item,
        avatar_url: rio.data?.thumbnail_url || null,
        profile_url: rio.data?.profile_url || null,
        raider_io: rio.data,
        raider_io_error: rio.error,
      };
    })
  );
}

export async function setIssueStatus(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  source: "dashboard" | "discord";
}) {
  const issueNumber = Number(params.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("Invalid issue number");
  }

  const status = normalizeStatus(params.status);
  await ensureApplicationLabels();

  const nextLabel = statusLabel(status);

  await Promise.all(
    STATUS_LABELS
      .filter((label) => label !== nextLabel)
      .map((label) =>
        githubFetch(`/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
          method: "DELETE",
        }).catch((error) => {
          if (
            !String(error?.message || "").toLowerCase().includes("not found") &&
            !isMissingLabelError(error)
          ) {
            throw error;
          }
        })
      )
  );

  await githubFetch(`/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [nextLabel] }),
  });

  if (status === "accepted" || status === "declined") {
    await githubFetch(`/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({
        state: "closed",
        state_reason: "completed",
      }),
    });
  }

  await githubFetch(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: [
        `${statusEmoji(status)} Статус заявки змінено на **${statusText(status)}** через ${params.source}.`,
        `Модератор: ${params.moderator}`,
      ].join("\n"),
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

