import {
  ApplicationStatus,
  getIssue,
  getIssueStatusFromLabels,
  normalizeStatus,
  setIssueStatus,
} from "./github";
import {
  editDiscordApplicationMessage,
  notifyDiscordStatusChange,
} from "./discord";

export async function moderateApplication(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  source: "dashboard" | "discord";
}) {
  const issueNumber = Number(params.issueNumber);
  const status = normalizeStatus(params.status);
  const issue = await getIssue(issueNumber);
  const previousStatus = getIssueStatusFromLabels(issue.labels || []);

  const github = await setIssueStatus({
    issueNumber,
    status,
    moderator: params.moderator,
    source: params.source,
  });

  const discordEdit = await editDiscordApplicationMessage({
    issue,
    issueNumber,
    status,
    moderator: params.moderator,
    source: params.source,
  });

  let discordNotify: unknown = null;

  if (!discordEdit?.ok) {
    discordNotify = await notifyDiscordStatusChange({
      issueNumber,
      status,
      moderator: params.moderator,
      issueUrl: issue.html_url,
      source: params.source,
    });
  }

  return {
    ok: true,
    issueNumber,
    status,
    previousStatus,
    changed: previousStatus !== status,
    github,
    discord: {
      edited: discordEdit,
      notified: discordNotify,
    },
  };
}
