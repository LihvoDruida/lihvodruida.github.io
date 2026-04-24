export const STATUS_LABELS = [
  "status:review",
  "status:accepted",
  "status:declined",
  "status:approved",
  "status:rejected",
];

export type ApplicationStatus = "accepted" | "declined" | "review";

export type ApplicationItem = {
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
  labels: string[];
};


export function normalizeStatus(value: string): ApplicationStatus {
  if (value === "accepted") return "accepted";
  if (value === "declined") return "declined";
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

export async function getIssue(issueNumber: number) {
  return githubFetch(`/issues/${issueNumber}`);
}

export function getIssueStatusFromLabels(labels: Array<{ name?: string } | string>): ApplicationStatus {
  const names = labels.map((label) =>
    typeof label === "string" ? label.toLowerCase() : String(label.name || "").toLowerCase()
  );

  if (names.includes("status:accepted") || names.includes("status:approved")) return "accepted";
  if (names.includes("status:declined") || names.includes("status:rejected")) return "declined";
  return "review";
}

function extract(body: string, pattern: RegExp) {
  return (String(body || "").match(pattern)?.[1] || "").trim();
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
    availability: body.split("### Коли зазвичай грає")[1]?.trim() || "",
    labels: Array.isArray(issue.labels) ? issue.labels.map((label: any) => label.name) : [],
  };
}

export async function listIssues() {
  const label = process.env.GUILD_APPLICATIONS_LABEL || "guild-application";
  const issues = await githubFetch(
    `/issues?state=all&labels=${encodeURIComponent(label)}&per_page=100&sort=created&direction=desc`
  );

  return Array.isArray(issues) ? issues.filter((issue: any) => !issue.pull_request) : [];
}

export async function listApplications() {
  const issues = await listIssues();
  return issues.map(mapApplicationIssue);
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

  const nextLabel = statusLabel(params.status);

  await Promise.all(
    STATUS_LABELS
      .filter((label) => label !== nextLabel)
      .map((label) =>
        githubFetch(`/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
          method: "DELETE",
        }).catch((error) => {
          if (!String(error?.message || "").toLowerCase().includes("not found")) {
            throw error;
          }
        })
      )
  );

  await githubFetch(`/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [nextLabel] }),
  });

  if (params.status === "accepted" || params.status === "declined") {
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
        `${statusEmoji(params.status)} Статус заявки змінено на **${statusText(params.status)}** через ${params.source}.`,
        `Модератор: ${params.moderator}`,
      ].join("\n"),
    }),
  });

  return {
    ok: true,
    status: params.status,
    label: nextLabel,
  };
}

export async function updateApplicationStatus(
  issueNumber: number,
  status: ApplicationStatus,
  moderator = "Dashboard"
) {
  return setIssueStatus({
    issueNumber,
    status,
    moderator,
    source: "dashboard",
  });
}
