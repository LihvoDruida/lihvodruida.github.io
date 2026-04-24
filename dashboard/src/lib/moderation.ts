import { getIssue, getIssueStatusFromLabels, setIssueStatus, ApplicationStatus } from "./github";
import { notifyDiscordStatusChange } from "./discord";

export async function moderateApplication(params: {
  issueNumber: number;
  status: ApplicationStatus;
  moderator: string;
  source: "dashboard" | "discord";
}) {
  if (params.status !== "accepted" && params.status !== "declined" && params.status !== "review") {
    throw new Error("Unsupported status");
  }

  const issue = await getIssue(params.issueNumber);
  const currentStatus = getIssueStatusFromLabels(issue.labels || []);

  if (currentStatus === params.status) {
    return {
      ok: true,
      unchanged: true,
      status: params.status,
      issue,
      discord: { skipped: true, reason: "Status is already set" },
    };
  }

  const result = await setIssueStatus(params);

  const discord = await notifyDiscordStatusChange({
    issueNumber: params.issueNumber,
    status: params.status,
    moderator: params.moderator,
    issueUrl: issue.html_url,
    title: issue.title,
    source: params.source,
  });

  return {
    ...result,
    unchanged: false,
    issue,
    discord,
  };
}
