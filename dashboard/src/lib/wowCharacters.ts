import { createHash } from "crypto";

export function cleanWowText(value: unknown, maxLength = 160) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeBattleNetNameSlug(value: unknown, maxLength = 80) {
  return cleanWowText(value, maxLength)
    .toLocaleLowerCase()
    .replace(/\s+/g, "-");
}

export function normalizeBattleNetRealmSlug(value: unknown, maxLength = 120) {
  return cleanWowText(value, maxLength)
    .toLocaleLowerCase()
    .replace(/\s+/g, "-");
}

function isSafeKeySegment(value: string) {
  return /^[a-z0-9-]+$/.test(value);
}

function hashUnicodeSegment(value: string, prefix: "u" | "r") {
  const digest = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

function normalizeKeySegment(value: unknown, prefix: "u" | "r") {
  const clean = cleanWowText(value, 160).toLocaleLowerCase().replace(/\s+/g, "-");
  if (!clean) return "";

  // Already encoded segments are accepted as-is. This keeps existing saved
  // characters stable and makes form actions idempotent.
  if (/^[ur]_[a-f0-9]{12,64}$/.test(clean)) return clean;

  if (isSafeKeySegment(clean)) return clean.slice(0, 120);

  return hashUnicodeSegment(clean, prefix);
}

export function buildBattleNetCharacterKey(regionInput: unknown, realmSlugInput: unknown, nameInput: unknown) {
  const region = cleanWowText(regionInput, 12).toLocaleLowerCase();
  const safeRegion = /^[a-z]{2}$/.test(region) ? region : "eu";
  const realmSegment = normalizeKeySegment(realmSlugInput, "r");
  const nameSegment = normalizeKeySegment(nameInput, "u");
  if (!realmSegment || !nameSegment) return "";
  return `${safeRegion}:${realmSegment}:${nameSegment}`;
}

export function normalizeCharacterKey(value: unknown) {
  const raw = cleanWowText(value, 260).toLocaleLowerCase();
  if (!raw) return "";

  const parts = raw.split(":");
  if (parts.length !== 3) return "";

  const [regionInput, realmInput, nameInput] = parts;
  return buildBattleNetCharacterKey(regionInput, realmInput, nameInput);
}

export function normalizeWowAvatarImageUrl(value: unknown) {
  const text = cleanWowText(value, 700);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const path = url.pathname;
    const avatarPath = path.replace(/-(?:main-raw|main)\.png$/i, "-avatar.jpg");
    if (avatarPath !== path) {
      url.pathname = avatarPath;
      return url.toString();
    }

    if (/\.(?:png|jpe?g|webp)$/i.test(path)) return url.toString();
    return null;
  } catch {
    return null;
  }
}

export function pickWowAvatarImageUrl(...values: unknown[]) {
  for (const value of values) {
    const avatarUrl = normalizeWowAvatarImageUrl(value);
    if (avatarUrl) return avatarUrl;
  }
  return null;
}
