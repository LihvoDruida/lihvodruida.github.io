import { STATUS, STATUS_LABELS, StatusKey, statusFromLabels } from "./status";

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
  summary: string;
  labels: string[];
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

function extract(body: string | null | undefined, label: string): string {
  const match = String(body || "").match(new RegExp(`- ${label}: (.+)`));
  return clean(match?.[1] || "");
}

function mapIssue(issue: GitHubIssue): ApplicationItem {
  const labels = issue.labels.map((label) => typeof label === "string" ? label : String(label.name || ""));
  const status = statusFromLabels(labels);
  const character = extract(issue.body, "Ім’я персонажа");
  const realm = extract(issue.body, "Реалм");
  const region = extract(issue.body, "Регіон");
  const faction = extract(issue.body, "Фракція");
  const className = extract(issue.body, "Клас");

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
    items = items.filter((item) => [item.title, item.summary, item.character_name, item.realm, item.region, item.faction, item.class_name]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }
  return items;
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
