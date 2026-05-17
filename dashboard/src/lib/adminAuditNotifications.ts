import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { logDashboardEvent } from "@/lib/security";
import type { DashboardSession } from "@/lib/auth";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const SETTINGS_COLLECTION = "dashboardSettings";
const ADMIN_AUDIT_LOG_POLICY_DOC_ID = "adminAuditLogPolicy";

export type AdminAuditStatus = "success" | "warning" | "error" | "info";
export type AdminAuditDiscordMinStatus = "info" | "warning" | "error";

export type AdminAuditDiscordPolicy = {
  enabled: boolean;
  channelId: string;
  minStatus: AdminAuditDiscordMinStatus;
  includeSystemLogs: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  source: "firestore" | "env" | "defaults";
};

export type AdminAuditNotificationInput = {
  id: string;
  action: string;
  actorId: string;
  actorName: string | null;
  actorGroupId: string | null;
  isServerOwner: boolean;
  status: AdminAuditStatus;
  summary: string | null;
  details: Record<string, unknown>;
  createdAt: string | null;
};

function splitCsv(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envFlag(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function cleanChannelId(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{16,25}$/.test(text) ? text : "";
}

function cleanMinStatus(value: unknown): AdminAuditDiscordMinStatus {
  const status = String(value || "").trim().toLowerCase();
  return status === "error" || status === "warning" || status === "info" ? status : "warning";
}

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") return maybeTimestamp.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function envPolicy(): AdminAuditDiscordPolicy {
  const channelId = cleanChannelId(
    process.env.ADMIN_LOGS_DISCORD_CHANNEL_ID ||
      process.env.DISCORD_ADMIN_LOGS_CHANNEL_ID ||
      process.env.DASHBOARD_LOGS_DISCORD_CHANNEL_ID ||
      "",
  );
  const enabledByEnv = envFlag("ADMIN_LOGS_DISCORD_ENABLED", false) || envFlag("DISCORD_ADMIN_LOGS_ENABLED", false);
  return {
    enabled: Boolean(enabledByEnv && channelId),
    channelId,
    minStatus: cleanMinStatus(process.env.ADMIN_LOGS_DISCORD_MIN_STATUS || process.env.DISCORD_ADMIN_LOGS_MIN_STATUS || "warning"),
    includeSystemLogs: envFlag("ADMIN_LOGS_DISCORD_INCLUDE_SYSTEM", true),
    updatedAt: null,
    updatedBy: null,
    source: channelId || enabledByEnv ? "env" : "defaults",
  };
}

function normalizePolicy(raw: Record<string, unknown> | null | undefined): AdminAuditDiscordPolicy {
  const fallback = envPolicy();
  if (!raw) return fallback;
  const channelId = cleanChannelId(raw.channelId) || fallback.channelId;
  return {
    enabled: Boolean(raw.enabled) && Boolean(channelId),
    channelId,
    minStatus: cleanMinStatus(raw.minStatus || fallback.minStatus),
    includeSystemLogs: raw.includeSystemLogs === undefined ? fallback.includeSystemLogs : Boolean(raw.includeSystemLogs),
    updatedAt: timestampToIso(raw.updatedAt),
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null,
    source: "firestore",
  };
}

export async function getAdminAuditDiscordPolicy(): Promise<AdminAuditDiscordPolicy> {
  if (!hasFirebaseProfileConfig()) return envPolicy();
  const snapshot = await getFirebaseAdminDb()
    .collection(SETTINGS_COLLECTION)
    .doc(ADMIN_AUDIT_LOG_POLICY_DOC_ID)
    .get()
    .catch((error) => {
      logDashboardEvent("warn", "admin.audit.discord_policy_read_failed", undefined, {
        message: error instanceof Error ? error.message : String(error || "unknown"),
      });
      return null;
    });
  if (!snapshot?.exists) return envPolicy();
  return normalizePolicy(snapshot.data() || null);
}

export async function setAdminAuditDiscordPolicy(input: {
  enabled?: unknown;
  channelId?: unknown;
  minStatus?: unknown;
  includeSystemLogs?: unknown;
}, actor?: DashboardSession | null) {
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase не налаштований для збереження параметрів журналу.");
  const channelId = cleanChannelId(input.channelId);
  const enabled = input.enabled === "1" || input.enabled === "on" || input.enabled === "true" || input.enabled === true;
  if (enabled && !channelId) throw new Error("Вкажи коректний Discord channel ID для дублювання журналу.");
  const minStatus = cleanMinStatus(input.minStatus);
  const includeSystemLogs = input.includeSystemLogs === "1" || input.includeSystemLogs === "on" || input.includeSystemLogs === "true" || input.includeSystemLogs === true;

  await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(ADMIN_AUDIT_LOG_POLICY_DOC_ID).set({
    enabled,
    channelId,
    minStatus,
    includeSystemLogs,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor?.name || actor?.login || actor?.id || null,
  }, { merge: true });

  return getAdminAuditDiscordPolicy();
}

function shouldPublishStatus(status: AdminAuditStatus, minStatus: AdminAuditDiscordMinStatus) {
  if (minStatus === "info") return true;
  if (minStatus === "warning") return status === "warning" || status === "error";
  return status === "error";
}

function statusLabel(status: AdminAuditStatus) {
  if (status === "success") return "Успішно";
  if (status === "warning") return "Попередження";
  if (status === "error") return "Помилка";
  return "Інфо";
}

function statusColor(status: AdminAuditStatus) {
  if (status === "success") return 0x5fd380;
  if (status === "warning") return 0xffbe58;
  if (status === "error") return 0xed4245;
  return 0x669fff;
}

function actionTitle(action: string) {
  const map: Record<string, string> = {
    "applications.status.update": "Заявка: зміна статусу",
    "applications.status.update_failed": "Заявка: помилка зміни статусу",
    "applications.bulk_status.update": "Заявки: масова зміна статусів",
    "applications.bulk_status.update_failed": "Заявки: помилка масової зміни",
    "content.create": "Контент: створено матеріал",
    "content.create_failed": "Контент: помилка створення",
    "content.update": "Контент: оновлено матеріал",
    "content.update_failed": "Контент: помилка оновлення",
    "content.delete": "Контент: видалено матеріал",
    "content.delete_failed": "Контент: помилка видалення",
    "raids.save": "Рейд: збережено",
    "raids.save_failed": "Рейд: помилка збереження",
    "raids.discord.publish": "Рейд: Discord-публікація",
    "raids.discord.publish_failed": "Рейд: помилка Discord-публікації",
    "raids.close": "Рейд: закрито",
    "raids.close_failed": "Рейд: помилка закриття",
    "raids.delete": "Рейд: видалено",
    "raids.delete_failed": "Рейд: помилка видалення",
    "access_group.upsert": "Права: групу збережено",
    "access_group.delete": "Права: групу видалено",
    "access_group.impersonate": "Права: перегляд як група",
    "access_group.impersonate.end": "Права: перегляд завершено",
    "discord.member.roles.manual_add_blocked": "Discord: ручну видачу ролі заблоковано",
    "discord.member.roles.manual_remove_blocked": "Discord: ручне зняття ролі заблоковано",
    "admin.logs.discord_settings.update": "Журнал: Discord-дублювання оновлено",
    "admin.logs.discord_settings.update_failed": "Журнал: помилка Discord-дублювання",
  };
  return map[action] || action.replace(/[._-]+/g, " ").trim();
}

function markdownEscape(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "ʼ")
    .replace(/\*/g, "﹡")
    .replace(/_/g, "﹍")
    .replace(/~/g, "∼")
    .replace(/\|/g, "¦")
    .replace(/>/g, "›")
    .replace(/@/g, "＠")
    .trim();
}

function redactAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 3) return "[max-depth]";
  if (typeof value === "string") {
    return value
      .replace(/ghp_[A-Za-z0-9_]+/g, "[redacted]")
      .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
      .replace(/Bot\s+[A-Za-z0-9._-]+/g, "Bot [redacted]")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
      .slice(0, 320);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => redactAuditValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 12).map(([key, item]) => {
      if (/token|secret|password|authorization|cookie|signature|private/i.test(key)) return [key, "[redacted]"];
      return [key, redactAuditValue(item, depth + 1)];
    }));
  }
  return String(value).slice(0, 180);
}

function compactValue(value: unknown) {
  const redacted = redactAuditValue(value);
  if (Array.isArray(redacted)) return redacted.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ");
  if (redacted && typeof redacted === "object") return JSON.stringify(redacted);
  return String(redacted ?? "");
}

function detailFields(details: Record<string, unknown>) {
  const preferred = [
    "checked", "checkedProfiles", "checkedDiscordProfiles", "checkedDiscordMembers", "targets", "targetProfilesTotal",
    "changed", "deletedProfilesTotal", "removedRoles", "addedRoles", "failed", "errorsTotal", "raidId", "issueNumber",
    "issueNumbers", "status", "path", "kind", "channelId", "messageId", "durationMs", "concurrency",
  ];
  const used = new Set<string>();
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  for (const key of preferred) {
    if (!(key in details)) continue;
    const rawValue = details[key];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const value = compactValue(rawValue).slice(0, 900);
    if (!value) continue;
    fields.push({ name: key, value: `\`${markdownEscape(value).slice(0, 900)}\``, inline: true });
    used.add(key);
    if (fields.length >= 8) return fields;
  }

  const previewKeys = Object.keys(details).filter((key) => !used.has(key) && !/token|secret|password|authorization|cookie|signature/i.test(key));
  for (const key of previewKeys.slice(0, 4)) {
    const rawValue = details[key];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const value = compactValue(rawValue).slice(0, 900);
    if (!value) continue;
    fields.push({ name: key, value: `\`${markdownEscape(value).slice(0, 900)}\``, inline: true });
    if (fields.length >= 8) break;
  }
  return fields;
}

function dashboardLogUrl() {
  const base = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.ADMIN_DASHBOARD_URL || process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || process.env.NEXTAUTH_URL || "";
  if (!base) return "";
  try {
    return new URL("/admin/logs", base).toString();
  } catch {
    return "";
  }
}

function auditEmbed(item: AdminAuditNotificationInput) {
  const actor = [item.actorName || item.actorId || "невідомо", item.actorGroupId ? `група ${item.actorGroupId}` : null, item.isServerOwner ? "власник сервера" : null]
    .filter(Boolean)
    .join(" • ");
  const summary = markdownEscape(item.summary || "Дію виконано.").slice(0, 1200);
  const logUrl = dashboardLogUrl();

  return {
    title: `🧾 ${actionTitle(item.action)}`.slice(0, 256),
    description: [
      `**Статус:** ${statusLabel(item.status)}`,
      `**Дія:** \`${markdownEscape(item.action).slice(0, 110)}\``,
      `**Автор:** ${markdownEscape(actor || "невідомо")}`,
      `**Підсумок:** ${summary}`,
      logUrl ? `**Журнал:** ${logUrl}` : "",
    ].filter(Boolean).join("\n"),
    color: statusColor(item.status),
    fields: detailFields(item.details).slice(0, 10),
    footer: { text: `Mistblossom Vanguard • /admin/logs • ${item.id.slice(0, 36)}` },
    timestamp: item.createdAt || new Date().toISOString(),
  };
}

export async function publishAdminAuditToDiscord(item: AdminAuditNotificationInput) {
  const policy = await getAdminAuditDiscordPolicy();
  if (!policy.enabled || !policy.channelId) return { skipped: true, reason: "disabled" };
  if (!policy.includeSystemLogs && item.actorId === "system") return { skipped: true, reason: "system_logs_disabled" };
  if (!shouldPublishStatus(item.status, policy.minStatus)) return { skipped: true, reason: "below_min_status" };

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { skipped: true, reason: "DISCORD_BOT_TOKEN is missing" };

  const response = await fetch(`${DISCORD_API_BASE}/channels/${policy.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [auditEmbed(item)],
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return { ok: false, status: response.status, error: raw || `Discord API error ${response.status}` };
  }

  const payload = await response.json().catch(() => null);
  return { ok: true, channelId: policy.channelId, messageId: payload?.id || null };
}

export function summarizeAdminAuditDiscordPolicy(policy: AdminAuditDiscordPolicy) {
  if (!policy.enabled) return "Discord-дублювання журналу вимкнено.";
  const statusText = policy.minStatus === "info" ? "усі записи" : policy.minStatus === "warning" ? "warning/error" : "тільки error";
  const systemText = policy.includeSystemLogs ? "системні записи увімкнені" : "системні записи вимкнені";
  return `Discord-дублювання увімкнено: канал ${policy.channelId}, ${statusText}, ${systemText}.`;
}

export function statusOptions() {
  return [
    { value: "info", label: "Усі записи: info / success / warning / error" },
    { value: "warning", label: "Тільки важливі: warning / error" },
    { value: "error", label: "Тільки помилки: error" },
  ] as const;
}
