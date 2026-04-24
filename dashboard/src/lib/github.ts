const STATUS_LABELS = [
  "status:review",
  "status:accepted",
  "status:declined",
  "status:approved",
  "status:rejected",
];

export type ApplicationStatus = "accepted" | "declined";

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

  await githubFetch(`/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({
      state: "closed",
      state_reason: "completed",
    }),
  });

  await githubFetch(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: [
        `${statusEmoji(params.status)} Заявку ${statusText(params.status).toLowerCase()} через dashboard.`,
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
