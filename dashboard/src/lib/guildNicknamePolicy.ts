import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import type { DashboardSession } from "@/lib/auth";

export const DEFAULT_NICKNAME_TEMPLATE = "{name} [{main}, {alt}, {alt}]";
export const DEFAULT_ROLE_REMOVE_CONCURRENCY = 0;
export const DEFAULT_ROLE_REMOVE_MAX_CONCURRENCY = 5;
export const DEFAULT_NICKNAME_CLEANUP_CONCURRENCY = 0;
export const DEFAULT_NICKNAME_CLEANUP_MAX_CONCURRENCY = 4;

const SETTINGS_COLLECTION = "dashboardSettings";
const POLICY_DOC_ID = "discordNicknamePolicy";
const TOKEN_PATTERN = /\{(name|main|alt)\}/gi;

export type GuildNicknamePolicy = {
  template: string;
  roleRemoveConcurrency: number;
  roleRemoveMaxConcurrency: number;
  nicknameCleanupConcurrency: number;
  nicknameCleanupMaxConcurrency: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") return maybeTimestamp.toDate().toISOString();
  return null;
}

function sliceCodePoints(value: string, maxLength: number) {
  return Array.from(value || "").slice(0, Math.max(0, maxLength)).join("");
}

function codePointLength(value: string) {
  return Array.from(value || "").length;
}

function cleanTemplateText(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

function isSupportedNicknameTemplate(template: string) {
  if (!template || !/\{name\}/i.test(template) || !/\{main\}/i.test(template)) return false;
  const unknownTokens = Array.from(template.matchAll(/\{([^}]+)\}/g))
    .map((match) => match[1]?.toLowerCase())
    .filter((token) => token && !["name", "main", "alt"].includes(token));
  return unknownTokens.length === 0;
}

function normalizeStoredTemplate(value: unknown, fallbackTemplate = DEFAULT_NICKNAME_TEMPLATE) {
  const template = cleanTemplateText(value);
  return isSupportedNicknameTemplate(template) ? template : fallbackTemplate;
}

function cleanIntegerSetting(value: unknown, fallback: number, min: number, max: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizePolicyData(data: Record<string, unknown> | null | undefined, fallbackTemplate = DEFAULT_NICKNAME_TEMPLATE): GuildNicknamePolicy {
  return {
    template: normalizeStoredTemplate(data?.template, fallbackTemplate),
    roleRemoveConcurrency: cleanIntegerSetting(data?.roleRemoveConcurrency, DEFAULT_ROLE_REMOVE_CONCURRENCY, 0, 5),
    roleRemoveMaxConcurrency: cleanIntegerSetting(data?.roleRemoveMaxConcurrency, DEFAULT_ROLE_REMOVE_MAX_CONCURRENCY, 1, 5),
    nicknameCleanupConcurrency: cleanIntegerSetting(data?.nicknameCleanupConcurrency, DEFAULT_NICKNAME_CLEANUP_CONCURRENCY, 0, 4),
    nicknameCleanupMaxConcurrency: cleanIntegerSetting(data?.nicknameCleanupMaxConcurrency, DEFAULT_NICKNAME_CLEANUP_MAX_CONCURRENCY, 1, 4),
    updatedAt: timestampToIso(data?.updatedAt),
    updatedBy: typeof data?.updatedBy === "string" ? data.updatedBy : null,
  };
}

export function cleanNicknameTemplate(value: unknown) {
  const template = cleanTemplateText(value) || DEFAULT_NICKNAME_TEMPLATE;
  if (!/\{name\}/i.test(template)) {
    throw new Error("Шаблон ніку має містити {name}.");
  }
  if (!/\{main\}/i.test(template)) {
    throw new Error("Шаблон ніку має містити {main}, щоб було видно мейна.");
  }
  const unknownTokens = Array.from(template.matchAll(/\{([^}]+)\}/g))
    .map((match) => match[1]?.toLowerCase())
    .filter((token) => token && !["name", "main", "alt"].includes(token));
  if (unknownTokens.length) {
    throw new Error(`Невідомі змінні шаблону: ${Array.from(new Set(unknownTokens)).join(", ")}. Доступні: {name}, {main}, {alt}.`);
  }
  return template;
}

export function nicknameTemplateExample(templateInput: unknown = DEFAULT_NICKNAME_TEMPLATE) {
  const template = normalizeStoredTemplate(templateInput);
  return renderNicknameFromTemplate(template, {
    name: "Дмитро",
    characters: ["Khayen", "Krouli", "Sebas"],
  });
}

export async function getGuildNicknamePolicy(): Promise<GuildNicknamePolicy> {
  if (!hasFirebaseProfileConfig()) return normalizePolicyData(null);

  const snapshot = await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(POLICY_DOC_ID).get().catch(() => null);
  if (!snapshot?.exists) return normalizePolicyData(null);
  return normalizePolicyData(snapshot.data() || null);
}

export async function setGuildNicknamePolicy(templateInput: unknown, actor?: DashboardSession | null) {
  const template = cleanNicknameTemplate(templateInput);
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase не налаштований для збереження шаблону ніку.");
  await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(POLICY_DOC_ID).set({
    template,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor?.name || actor?.login || actor?.id || null,
  }, { merge: true });
  return getGuildNicknamePolicy();
}

export async function setGuildDiscordManagementSettings(input: {
  template?: unknown;
  roleRemoveConcurrency?: unknown;
  roleRemoveMaxConcurrency?: unknown;
  nicknameCleanupConcurrency?: unknown;
  nicknameCleanupMaxConcurrency?: unknown;
}, actor?: DashboardSession | null) {
  const template = cleanNicknameTemplate(input.template);
  const roleRemoveMaxConcurrency = cleanIntegerSetting(input.roleRemoveMaxConcurrency, DEFAULT_ROLE_REMOVE_MAX_CONCURRENCY, 1, 5);
  const nicknameCleanupMaxConcurrency = cleanIntegerSetting(input.nicknameCleanupMaxConcurrency, DEFAULT_NICKNAME_CLEANUP_MAX_CONCURRENCY, 1, 4);
  const roleRemoveConcurrency = cleanIntegerSetting(input.roleRemoveConcurrency, DEFAULT_ROLE_REMOVE_CONCURRENCY, 0, roleRemoveMaxConcurrency);
  const nicknameCleanupConcurrency = cleanIntegerSetting(input.nicknameCleanupConcurrency, DEFAULT_NICKNAME_CLEANUP_CONCURRENCY, 0, nicknameCleanupMaxConcurrency);

  if (!hasFirebaseProfileConfig()) throw new Error("Firebase не налаштований для збереження Discord-налаштувань.");
  await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(POLICY_DOC_ID).set({
    template,
    roleRemoveConcurrency,
    roleRemoveMaxConcurrency,
    nicknameCleanupConcurrency,
    nicknameCleanupMaxConcurrency,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor?.name || actor?.login || actor?.id || null,
  }, { merge: true });

  return getGuildNicknamePolicy();
}

function cleanNicknamePart(value: unknown, maxLength: number) {
  return sliceCodePoints(String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>@#`*_~|{}[\]\\]/g, "")
    .replace(/\s+/g, " ")
    .trim(), maxLength).trim();
}

function normalizeCharacterNames(values: unknown) {
  const items = Array.isArray(values) ? values : String(values || "").split(/[,;]+/g);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const name = cleanNicknamePart(item, 16);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= 3) break;
  }
  return result;
}

function applyTemplate(template: string, parts: { name: string; main: string; alts: string[] }) {
  let altIndex = 0;
  const rendered = template.replace(TOKEN_PATTERN, (_, key: string) => {
    const token = key.toLowerCase();
    if (token === "name") return parts.name;
    if (token === "main") return parts.main;
    if (token === "alt") {
      const value = parts.alts[altIndex] || "";
      altIndex += 1;
      return value;
    }
    return "";
  });

  return rendered
    .replace(/,\s*(?=,|\]|\))/g, "")
    .replace(/\[\s*,\s*/g, "[")
    .replace(/\(\s*,\s*/g, "(")
    .replace(/,\s*\]/g, "]")
    .replace(/,\s*\)/g, ")")
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .trim();
}

export function renderNicknameFromTemplate(templateInput: unknown, input: { name: string; characters: string[]; maxLength?: number }) {
  const template = normalizeStoredTemplate(templateInput);
  const maxLength = Math.max(16, Math.min(32, Math.floor(Number(input.maxLength || 32))));
  const baseName = cleanNicknamePart(input.name, 32) || "Учасник";
  const allCharacters = normalizeCharacterNames(input.characters);
  const main = allCharacters[0] || "";
  const alts = allCharacters.slice(1, 3);

  for (let count = alts.length; count >= 0; count -= 1) {
    const currentAlts = alts.slice(0, count);
    const candidate = applyTemplate(template, { name: baseName, main, alts: currentAlts });
    if (candidate && codePointLength(candidate) <= maxLength) return candidate;
  }

  const minimal = applyTemplate(template, { name: baseName, main, alts: [] });
  if (minimal && codePointLength(minimal) <= maxLength) return minimal;
  return sliceCodePoints(baseName, maxLength).trim() || "Учасник";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function nicknameTemplateToRegex(templateInput: unknown) {
  const template = normalizeStoredTemplate(templateInput);
  let output = "";
  let lastIndex = 0;
  const pattern = /\{(name|main|alt)\}/gi;
  for (const match of template.matchAll(pattern)) {
    const token = match[1].toLowerCase();
    const literal = template.slice(lastIndex, match.index);
    if (token === "alt") {
      output += `(?:${escapeRegex(literal)}[^\\[\\],\\n]{2,16})?`;
    } else {
      output += escapeRegex(literal);
      if (token === "name") output += "[^\\[\\]\\n]{2,32}";
      if (token === "main") output += "[^\\[\\],\\n]{2,16}";
    }
    lastIndex = (match.index || 0) + match[0].length;
  }
  output += escapeRegex(template.slice(lastIndex));
  return new RegExp(`^\s*${output}\s*$`, "iu");
}

export function nicknameMatchesTemplate(nicknameInput: unknown, templateInput: unknown) {
  const nickname = String(nicknameInput || "").replace(/\s+/g, " ").trim();
  if (!nickname) return false;
  return nicknameTemplateToRegex(templateInput).test(nickname);
}
