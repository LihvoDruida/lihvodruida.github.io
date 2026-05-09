import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import type { DashboardSession } from "@/lib/auth";

export const DEFAULT_NICKNAME_TEMPLATE = "{name} [{characters}]";
const SETTINGS_COLLECTION = "dashboardSettings";
const POLICY_DOC_ID = "discordNicknamePolicy";
const TOKEN_PATTERN = /\{(name|main|alts|characters)\}/gi;

export type GuildNicknamePolicy = {
  template: string;
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

export function cleanNicknameTemplate(value: unknown) {
  const template = cleanTemplateText(value) || DEFAULT_NICKNAME_TEMPLATE;
  if (!/\{name\}/i.test(template)) {
    throw new Error("Шаблон ніку має містити {name}.");
  }
  if (!/(\{main\}|\{characters\})/i.test(template)) {
    throw new Error("Шаблон ніку має містити {main} або {characters}, щоб було видно мейна.");
  }
  const unknownTokens = Array.from(template.matchAll(/\{([^}]+)\}/g))
    .map((match) => match[1]?.toLowerCase())
    .filter((token) => token && !["name", "main", "alts", "characters"].includes(token));
  if (unknownTokens.length) {
    throw new Error(`Невідомі змінні шаблону: ${Array.from(new Set(unknownTokens)).join(", ")}. Доступні: {name}, {main}, {alts}, {characters}.`);
  }
  return template;
}

export function nicknameTemplateExample(templateInput: unknown = DEFAULT_NICKNAME_TEMPLATE) {
  const template = cleanTemplateText(templateInput) || DEFAULT_NICKNAME_TEMPLATE;
  return renderNicknameFromTemplate(template, {
    name: "Дмитро",
    characters: ["Khayen", "Krouli", "Sebas"],
  });
}

export async function getGuildNicknamePolicy(): Promise<GuildNicknamePolicy> {
  const envTemplate = process.env.DISCORD_NICKNAME_TEMPLATE || process.env.NEXT_PUBLIC_DISCORD_NICKNAME_TEMPLATE || "";
  const fallback = cleanTemplateText(envTemplate) || DEFAULT_NICKNAME_TEMPLATE;

  if (!hasFirebaseProfileConfig()) return { template: fallback, updatedAt: null, updatedBy: null };

  const snapshot = await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(POLICY_DOC_ID).get().catch(() => null);
  if (!snapshot?.exists) return { template: fallback, updatedAt: null, updatedBy: null };
  const data = snapshot.data() || {};
  const template = cleanTemplateText(data.template) || fallback;
  return {
    template,
    updatedAt: timestampToIso(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

export async function setGuildNicknamePolicy(templateInput: unknown, actor?: DashboardSession | null) {
  const template = cleanNicknameTemplate(templateInput);
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase не налаштований для збереження шаблону ніку.");
  await getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(POLICY_DOC_ID).set({
    template,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor?.name || actor?.login || actor?.id || null,
  }, { merge: true });
  return { template } satisfies GuildNicknamePolicy;
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

function applyTemplate(template: string, parts: { name: string; main: string; alts: string[]; characters: string[] }) {
  const replacements: Record<string, string> = {
    name: parts.name,
    main: parts.main,
    alts: parts.alts.join(", "),
    characters: parts.characters.join(", "),
  };

  return template.replace(TOKEN_PATTERN, (_, key: string) => replacements[key.toLowerCase()] || "")
    .replace(/,\s*\]/g, "]")
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderNicknameFromTemplate(templateInput: unknown, input: { name: string; characters: string[]; maxLength?: number }) {
  const template = cleanTemplateText(templateInput) || DEFAULT_NICKNAME_TEMPLATE;
  const maxLength = Math.max(16, Math.min(32, Math.floor(Number(input.maxLength || 32))));
  const baseName = cleanNicknamePart(input.name, 32) || "Учасник";
  const allCharacters = normalizeCharacterNames(input.characters);
  const main = allCharacters[0] || "";
  const alts = allCharacters.slice(1, 3);

  for (let count = alts.length; count >= 0; count -= 1) {
    const currentAlts = alts.slice(0, count);
    const characters = [main, ...currentAlts].filter(Boolean);
    const candidate = applyTemplate(template, { name: baseName, main, alts: currentAlts, characters });
    if (candidate && codePointLength(candidate) <= maxLength) return candidate;
  }

  const minimal = applyTemplate(template, { name: baseName, main, alts: [], characters: main ? [main] : [] });
  if (minimal && codePointLength(minimal) <= maxLength) return minimal;
  return sliceCodePoints(baseName, maxLength).trim() || "Учасник";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function nicknameTemplateToRegex(templateInput: unknown) {
  const template = cleanTemplateText(templateInput) || DEFAULT_NICKNAME_TEMPLATE;
  let output = "";
  let lastIndex = 0;
  const pattern = /\{(name|main|alts|characters)\}/gi;
  for (const match of template.matchAll(pattern)) {
    output += escapeRegex(template.slice(lastIndex, match.index));
    const token = match[1].toLowerCase();
    if (token === "name") output += "[^\\[\\]\\n]{2,32}";
    if (token === "main") output += "[^\\[\\],\\n]{2,16}";
    if (token === "alts") output += "(?:[^\\[\\],\\n]{2,16}(?:,\\s*[^\\[\\],\\n]{2,16}){0,1})?";
    if (token === "characters") output += "[^\\[\\]\\n]{2,80}";
    lastIndex = (match.index || 0) + match[0].length;
  }
  output += escapeRegex(template.slice(lastIndex));
  return new RegExp(`^\\s*${output}\\s*$`, "iu");
}

export function nicknameMatchesTemplate(nicknameInput: unknown, templateInput: unknown) {
  const nickname = String(nicknameInput || "").replace(/\s+/g, " ").trim();
  if (!nickname) return false;
  return nicknameTemplateToRegex(templateInput).test(nickname);
}
