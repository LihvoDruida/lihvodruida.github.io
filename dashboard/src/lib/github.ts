import { STATUS_LABELS, StatusKey, statusFromLabels } from "./status";
import { notifyDiscordStatusChange } from "./discord";

export type ApplicationStatus = "accepted" | "declined";

export type ApplicationItem = {
  number: number;
  title: string;
  state: string;
  status_key: StatusKey;
  status_text: string;
  html_url: string;
  created_at: string;
  updated_at?: string;
  closed_at?: string | null;
  summary?: string;
  character_name?: string;
  realm?: string;
  region?: string;
  faction?: string;
  class_name?: string;
  source?: string;
  availability?: string;
  labels: string[];
  raider_io?: {
    profile_url?: string;
    thumbnail_url?: string;
    mythic_plus?: {
      current?: Record<string, number>;
      previous?: Record<string, number>;
    };
    raids?: {
      current?: string[];
      previous?: string[];
    };
  };
  raider_io_error?: string;
};

export function statusLabel(status: ApplicationStatus) {
  return status === "accepted" ? "status:accepted" : "status:declined";
}

export function statusText(status: ApplicationStatus) {
  return status === "accepted" ? "Прийнято" : "Відхилено";
}

export function statusEmoji(status: ApplicationStatus) {
  return status === "accepted" ? "✅" : "❌";
}

export function statusColor(status: ApplicationStatus) {
  return status === "accepted" ? 0x3ba55d : 0xed4245;
}

function ownerRepo() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("GitHub env is not configured");
  }

  return { owner, repo, token };
}

export async function githubFetch(path: string, init: RequestInit = {}) {
  const { owner, repo, token } = ownerRepo();
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

function readLine(body: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escaped}:\\s*(.+)`, "i"));
  return String(match?.[1] || "").trim();
}

function readSection(body: string, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`### ${escaped}\\s*\\n([\\s\\S]*?)(?:\\n### |$)`, "i"));
  return String(match?.[1] || "").trim();
}

function slugify(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function raidSummary(raid: any) {
  if (!raid || typeof raid !== "object") return "";
  if (raid.summary) return String(raid.summary);
  const total = Number(raid.total_bosses || 0) || "?";
  const parts = [];
  if (Number(raid.mythic_bosses_killed || 0) > 0) parts.push(`${raid.mythic_bosses_killed}/${total} M`);
  if (Number(raid.heroic_bosses_killed || 0) > 0) parts.push(`${raid.heroic_bosses_killed}/${total} H`);
  if (Number(raid.normal_bosses_killed || 0) > 0) parts.push(`${raid.normal_bosses_killed}/${total} N`);
  return parts.join(" • ");
}

function prettifyRaidKey(key: string) {
  return String(key || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function splitRaids(raidProgression: any) {
  const entries = Object.entries(raidProgression || {})
    .map(([key, value]: [string, any]) => ({ key, ...(value || {}) }))
    .filter((item: any) => Number.isFinite(Number(item.expansion_id)));
  const ids = Array.from(new Set(entries.map((item: any) => Number(item.expansion_id)))).sort((a, b) => b - a);
  const format = (expansionId?: number) => entries
    .filter((item: any) => Number(item.expansion_id) === expansionId)
    .map((item: any) => {
      const summary = raidSummary(item);
      return summary ? `${prettifyRaidKey(item.key)}: ${summary}` : "";
    })
    .filter(Boolean)
    .slice(0, 8);

  return { current: format(ids[0]), previous: format(ids[1]) };
}

async function fetchRaiderIo(item: ApplicationItem) {
  const region = String(item.region || "").toLowerCase();
  const realm = slugify(item.realm || "");
  const character = slugify(item.character_name || "");
  if (!region || !realm || !character) return item;

  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realm);
  url.searchParams.set("name", character);
  url.searchParams.set("fields", "mythic_plus_scores_by_season:current:previous,raid_progression:current-expansion:previous-expansion");

  try {
    const response = await fetch(url.toString(), { headers: { accept: "application/json" }, next: { revalidate: 300 } });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { ...item, raider_io_error: data?.message || `Raider.IO HTTP ${response.status}` };
    }

    const seasons = Array.isArray(data?.mythic_plus_scores_by_season) ? data.mythic_plus_scores_by_season : [];
    const raids = splitRaids(data?.raid_progression);
    return {
      ...item,
      raider_io: {
        profile_url: data?.profile_url,
        thumbnail_url: data?.thumbnail_url,
        mythic_plus: {
          current: seasons[0]?.scores || {},
          previous: seasons[1]?.scores || {},
        },
        raids,
      },
    };
  } catch (error) {
    return { ...item, raider_io_error: error instanceof Error ? error.message : "Raider.IO unavailable" };
  }
}

function mapIssue(issue: any): ApplicationItem {
  const body = String(issue?.body || "");
  const labels = Array.isArray(issue?.labels) ? issue.labels.map((label: any) => String(label?.name || label)) : [];
  const status = statusFromLabels(labels);
  const character = readLine(body, "Ім’я персонажа");
  const realm = readLine(body, "Реалм");
  const region = readLine(body, "Регіон");
  const faction = readLine(body, "Фракція");
  const className = readLine(body, "Клас");
  const source = readLine(body, "Звідки дізнався");
  const availability = readSection(body, "Коли зазвичай грає");

  return {
    number: Number(issue.number),
    title: String(issue.title || ""),
    state: String(issue.state || ""),
    status_key: status,
    status_text: status === "accepted" ? "Прийнято" : status === "declined" ? "Відхилено" : "На розгляді",
    html_url: String(issue.html_url || ""),
    created_at: String(issue.created_at || ""),
    updated_at: String(issue.updated_at || ""),
    closed_at: issue.closed_at || null,
    character_name: character,
    realm,
    region,
    faction,
    class_name: className,
    source,
    availability,
    summary: [character, realm, region, faction, className].filter(Boolean).join(" • "),
    labels,
  };
}

export async function listApplications(searchParams: URLSearchParams): Promise<ApplicationItem[]> {
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 100);
  const sort = searchParams.get("sort") === "updated" ? "updated" : "created";
  const direction = searchParams.get("direction") === "asc" ? "asc" : "desc";
  const label = encodeURIComponent(process.env.GUILD_APPLICATIONS_LABEL || "guild-application");
  const issues = await githubFetch(`/issues?state=all&per_page=${limit}&sort=${sort}&direction=${direction}&labels=${label}`);

  let items = (Array.isArray(issues) ? issues : [])
    .filter((issue: any) => !issue.pull_request)
    .map(mapIssue);

  const status = String(searchParams.get("status") || "all").toLowerCase();
  const className = String(searchParams.get("class") || "all").toLowerCase();
  const query = String(searchParams.get("q") || "").trim().toLowerCase();

  if (["review", "accepted", "declined"].includes(status)) {
    items = items.filter((item) => item.status_key === status);
  }
  if (className && className !== "all") {
    items = items.filter((item) => String(item.class_name || "").toLowerCase() === className);
  }
  if (query) {
    items = items.filter((item) => [item.title, item.summary, item.character_name, item.realm, item.region, item.faction, item.class_name, item.source, item.availability]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }

  const enriched = await Promise.all(items.map((item) => fetchRaiderIo(item)));
  return enriched;
}

export async function updateIssueStatusDirect(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
}) {
  const issueNumber = Number(params.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("Invalid issue number");
  }

  const nextLabel = statusLabel(params.status);

  await Promise.all(
    STATUS_LABELS
      .filter((label) => label !== nextLabel)
      .map((label) =>
        githubFetch(`/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, { method: "DELETE" }).catch((error) => {
          if (!String(error?.message || "").toLowerCase().includes("not found")) throw error;
        })
      )
  );

  await githubFetch(`/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [nextLabel] }),
  });

  await githubFetch(`/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "completed" }),
  });

  await githubFetch(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: [`${statusEmoji(params.status)} Заявку ${statusText(params.status).toLowerCase()} через dashboard.`, `Модератор: ${params.moderator}`].join("\n"),
    }),
  });

  return { ok: true, status: params.status, label: nextLabel };
}

export async function updateApplicationStatus(issueNumber: number, status: ApplicationStatus, moderator: string) {
  const result = await updateIssueStatusDirect({ issueNumber, status, moderator });
  await notifyDiscordStatusChange({ issueNumber, status, moderator });
  return result;
}
