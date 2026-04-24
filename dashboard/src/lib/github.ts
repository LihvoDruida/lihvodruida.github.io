import { STATUS, STATUS_LABELS, StatusKey, statusFromLabels } from "./status";

export type RaiderIoProfile = {
  profile_url?: string;
  thumbnail_url?: string;
  mythic_plus?: {
    current?: Record<string, number | null>;
    previous?: Record<string, number | null>;
  };
  raids?: {
    current?: string[];
    previous?: string[];
  };
};

export type ApplicationItem = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  status_key: StatusKey;
  status_text: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  character_name: string;
  realm: string;
  region: string;
  faction: string;
  class_name: string;
  source: string;
  availability: string;
  summary: string;
  labels: string[];
  raider_io?: RaiderIoProfile | null;
  raider_io_error?: string;
};

type GitHubIssue = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  body?: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  pull_request?: unknown;
  labels: Array<string | { name?: string }>;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanBlock(value: unknown): string {
  return String(value || "").trim();
}

function extract(body: string | null | undefined, label: string): string {
  const match = String(body || "").match(new RegExp(`- ${label}: (.+)`));
  return clean(match?.[1] || "");
}

function extractSection(body: string | null | undefined, heading: string): string {
  const text = String(body || "");
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`### ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n### |$)`));
  return cleanBlock(match?.[1] || "");
}

function slugifyRaiderIo(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function positive(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatRaidName(key: string): string {
  return String(key || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function raidSummary(raid: any): string | null {
  if (!raid || typeof raid !== "object") return null;
  if (clean(raid.summary)) return clean(raid.summary);
  const total = Number(raid.total_bosses || 0);
  const mythic = Number(raid.mythic_bosses_killed || 0);
  const heroic = Number(raid.heroic_bosses_killed || 0);
  const normal = Number(raid.normal_bosses_killed || 0);
  const parts = [];
  if (mythic > 0) parts.push(`${mythic}/${total || "?"} M`);
  if (heroic > 0) parts.push(`${heroic}/${total || "?"} H`);
  if (normal > 0) parts.push(`${normal}/${total || "?"} N`);
  return parts.length ? parts.join(" • ") : null;
}

function splitRaidProgressionByExpansion(raidProgression: any) {
  const entries = Object.entries(raidProgression || {})
    .map(([key, value]) => ({ key, ...(value as object) }))
    .filter((item: any) => Number.isFinite(Number(item.expansion_id)));
  const grouped = new Map<number, any[]>();
  for (const raid of entries) {
    const expansionId = Number((raid as any).expansion_id);
    grouped.set(expansionId, [...(grouped.get(expansionId) || []), raid]);
  }
  const ids = Array.from(grouped.keys()).sort((a, b) => b - a);
  return {
    current: ids.length ? grouped.get(ids[0]) || [] : [],
    previous: ids.length > 1 ? grouped.get(ids[1]) || [] : []
  };
}

function mapRaidList(raids: any[]): string[] {
  return raids
    .map((raid) => {
      const summary = raidSummary(raid);
      return summary ? `${formatRaidName(raid.key)}: ${summary}` : "";
    })
    .filter(Boolean)
    .slice(0, 6);
}

async function fetchRaiderIoProfile(item: ApplicationItem): Promise<RaiderIoProfile | null> {
  if (process.env.RAIDERIO_ENABLED === "false") return null;
  if (!item.region || !item.realm || !item.character_name) return null;

  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", item.region.toLowerCase());
  url.searchParams.set("realm", slugifyRaiderIo(item.realm));
  url.searchParams.set("name", slugifyRaiderIo(item.character_name));
  url.searchParams.set("fields", "mythic_plus_scores_by_season:current:previous,raid_progression:current-expansion:previous-expansion");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url.toString(), { headers: { accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    const data = await parseJson(response);
    if (!response.ok) throw new Error(data?.message || data?.error || `Raider.IO ${response.status}`);

    const seasons = Array.isArray(data.mythic_plus_scores_by_season) ? data.mythic_plus_scores_by_season : [];
    const currentScores = seasons[0]?.scores || {};
    const previousScores = seasons[1]?.scores || {};
    const raidGroups = splitRaidProgressionByExpansion(data.raid_progression);

    return {
      profile_url: data.profile_url || "",
      thumbnail_url: data.thumbnail_url || "",
      mythic_plus: {
        current: {
          all: positive(currentScores.all),
          healer: positive(currentScores.healer),
          dps: positive(currentScores.dps),
          tank: positive(currentScores.tank)
        },
        previous: {
          all: positive(previousScores.all),
          healer: positive(previousScores.healer),
          dps: positive(previousScores.dps),
          tank: positive(previousScores.tank)
        }
      },
      raids: {
        current: mapRaidList(raidGroups.current),
        previous: mapRaidList(raidGroups.previous)
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function enrichWithRaiderIo(items: ApplicationItem[]): Promise<ApplicationItem[]> {
  const concurrency = Math.min(Math.max(Number(process.env.RAIDERIO_CONCURRENCY || 6), 1), 10);
  const queue = [...items];
  const result: ApplicationItem[] = [];

  async function worker() {
    while (queue.length) {
      const item = queue.shift()!;
      try {
        result.push({ ...item, raider_io: await fetchRaiderIoProfile(item) });
      } catch (error) {
        result.push({ ...item, raider_io: null, raider_io_error: error instanceof Error ? error.message : "Raider.IO недоступний" });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  const order = new Map(items.map((item, index) => [item.number, index]));
  return result.sort((a, b) => (order.get(a.number) || 0) - (order.get(b.number) || 0));
}

function mapIssue(issue: GitHubIssue): ApplicationItem {
  const labels = issue.labels.map((label) => typeof label === "string" ? label : String(label.name || ""));
  const status = statusFromLabels(labels);
  const character = extract(issue.body, "Ім’я персонажа");
  const realm = extract(issue.body, "Реалм");
  const region = extract(issue.body, "Регіон");
  const faction = extract(issue.body, "Фракція");
  const className = extract(issue.body, "Клас");
  const source = extract(issue.body, "Звідки дізнався");
  const availability = extractSection(issue.body, "Коли зазвичай грає");

  return {
    number: issue.number,
    title: issue.title,
    html_url: issue.html_url,
    state: issue.state,
    status_key: status,
    status_text: STATUS[status].label,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    closed_at: issue.closed_at,
    character_name: character,
    realm,
    region,
    faction,
    class_name: className,
    source,
    availability,
    summary: [character, realm, region, faction, className].filter(Boolean).join(" • "),
    labels
  };
}

async function githubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mistblossom-dashboard",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {})
    },
    cache: "no-store"
  });
}

async function parseJson(response: Response): Promise<any> {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return raw; }
}

export async function listApplications(params: URLSearchParams): Promise<ApplicationItem[]> {
  const owner = env("GITHUB_OWNER");
  const repo = env("GITHUB_REPO");
  const label = encodeURIComponent(process.env.GUILD_APPLICATIONS_LABEL || "guild-application");
  const limit = Math.min(Math.max(Number(params.get("limit") || 100), 1), 100);
  const sort = params.get("sort") === "updated" ? "updated" : "created";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const response = await githubFetch(`/repos/${owner}/${repo}/issues?state=all&per_page=${limit}&sort=${sort}&direction=${direction}&labels=${label}`);
  const data = await parseJson(response);
  if (!response.ok) throw new Error(data?.message || "Failed to load applications.");

  let items = (Array.isArray(data) ? data : []).filter((issue: GitHubIssue) => !issue.pull_request).map(mapIssue);
  const status = params.get("status");
  const className = clean(params.get("class")).toLowerCase();
  const query = clean(params.get("q")).toLowerCase();

  if (status && status !== "all") items = items.filter((item) => item.status_key === status);
  if (className && className !== "all") items = items.filter((item) => item.class_name.toLowerCase() === className);
  if (query) {
    items = items.filter((item) => [item.title, item.summary, item.character_name, item.realm, item.region, item.faction, item.class_name, item.source, item.availability]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }

  return enrichWithRaiderIo(items);
}

export async function updateApplicationStatus(issueNumber: number, status: StatusKey, moderator = "Dashboard"): Promise<void> {
  const owner = env("GITHUB_OWNER");
  const repo = env("GITHUB_REPO");
  const targetLabel = STATUS[status].labelName;

  await Promise.all(STATUS_LABELS.filter((label) => label !== targetLabel).map(async (label) => {
    const response = await githubFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const data = await parseJson(response);
      throw new Error(data?.message || `Failed to remove ${label}.`);
    }
  }));

  const add = await githubFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [targetLabel] })
  });
  if (!add.ok) {
    const data = await parseJson(add);
    throw new Error(data?.message || `Failed to add ${targetLabel}.`);
  }

  const shouldClose = status === "accepted" || status === "declined";
  if (shouldClose) {
    const close = await githubFetch(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" })
    });
    if (!close.ok) {
      const data = await parseJson(close);
      throw new Error(data?.message || "Failed to close issue.");
    }
  }

  const comment = await githubFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: `📋 Dashboard: статус змінено на **${STATUS[status].label}**. Модератор: ${moderator}` })
  });
  if (!comment.ok) {
    const data = await parseJson(comment);
    throw new Error(data?.message || "Status updated, but comment failed.");
  }
}
