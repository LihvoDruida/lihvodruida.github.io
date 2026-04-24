import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCanModerate } from "@/lib/access";
import { listIssues, getIssueStatusFromLabels, statusText } from "@/lib/github";

function extract(body: string, pattern: RegExp) {
  return (String(body || "").match(pattern)?.[1] || "").trim();
}

function mapIssue(issue: any) {
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

export async function GET() {
  const session = await getSession();
  assertCanModerate(session);

  const issues = await listIssues();
  return NextResponse.json({
    items: issues.filter((issue: any) => !issue.pull_request).map(mapIssue),
  });
}
