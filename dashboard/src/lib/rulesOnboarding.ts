import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDashboardUrl } from "@/lib/oauth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { firebaseWrite } from "@/lib/firebaseAccess";
import {
  buildProfileDiscordNicknamePlan,
  cleanProfileGrammaticalGender,
  getMainCharacter,
  type DashboardProfile,
} from "@/lib/profiles";
import { resolveWowCharacterRole, wowRoleLabel } from "@/lib/wowRoles";

export type RulesOnboardingStepKey =
  | "profile_name"
  | "profile_gender"
  | "battlenet_characters"
  | "main_character"
  | "raid_role"
  | "discord_nickname";

export type RulesOnboardingStep = {
  key: RulesOnboardingStepKey;
  title: string;
  description: string;
  complete: boolean;
  href?: string;
};

const TOKEN_VERSION = 1;

function secret() {
  return String(
    process.env.DASHBOARD_RULES_TOKEN_SECRET ||
    process.env.DASHBOARD_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "mistblossom-rules-onboarding-dev-secret"
  );
}

function cleanRoleIds(roleIds: unknown) {
  const values = Array.isArray(roleIds) ? roleIds : String(roleIds || "").split(/[,\.\s;]+/g);
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter((item) => /^\d{16,25}$/.test(item)))).slice(0, 10);
}

function cleanDiscordUserId(value: unknown) {
  const userId = String(value || "").trim();
  return /^\d{16,25}$/.test(userId) ? userId : "";
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function verifySignature(payload: string, signature: string) {
  try {
    const expected = signPayload(payload);
    const left = Buffer.from(signature, "base64url");
    const right = Buffer.from(expected, "base64url");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function createRulesRoleToken(
  roleIdsInput: string[],
  options: { discordUserId?: string | null } = {},
) {
  const roleIds = cleanRoleIds(roleIdsInput);
  if (!roleIds.length) throw new Error("Для правил потрібно вибрати роль, яка буде видана після реєстрації.");
  const discordUserId = cleanDiscordUserId(options.discordUserId);
  const payload = base64UrlJson({
    v: TOKEN_VERSION,
    r: roleIds,
    ...(discordUserId ? { u: discordUserId } : {}),
  });
  return `${payload}.${signPayload(payload)}`;
}

export type ParsedRulesRoleToken = {
  roleIds: string[];
  discordUserId: string | null;
};

export function parseRulesRoleTokenDetails(tokenInput: unknown): ParsedRulesRoleToken {
  const token = String(tokenInput || "").trim();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !verifySignature(payload, signature)) {
    return { roleIds: [], discordUserId: null };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Number(parsed?.v) !== TOKEN_VERSION) {
      return { roleIds: [], discordUserId: null };
    }
    return {
      roleIds: cleanRoleIds(parsed?.r),
      discordUserId: cleanDiscordUserId(parsed?.u) || null,
    };
  } catch {
    return { roleIds: [], discordUserId: null };
  }
}

export function parseRulesRoleToken(tokenInput: unknown) {
  return parseRulesRoleTokenDetails(tokenInput).roleIds;
}

export function rulesAcceptPath(roleIds: string[]) {
  return `/rules/accept?rt=${encodeURIComponent(createRulesRoleToken(roleIds))}`;
}

export function rulesAcceptPathForDiscordUser(roleIds: string[], discordUserId: string) {
  return `/rules/accept?rt=${encodeURIComponent(createRulesRoleToken(roleIds, { discordUserId }))}`;
}

export function rulesAcceptUrl(roleIds: string[]) {
  return `${getDashboardUrl()}${rulesAcceptPath(roleIds)}`;
}

export function rulesAcceptUrlForDiscordUser(roleIds: string[], discordUserId: string) {
  return `${getDashboardUrl()}${rulesAcceptPathForDiscordUser(roleIds, discordUserId)}`;
}

export function rulesLoginPath(roleToken: string) {
  const safeToken = String(roleToken || "").trim();
  const next = safeToken ? `/rules/accept?rt=${encodeURIComponent(safeToken)}` : "/rules/accept";
  return `/api/auth/discord/start?force=1&next=${encodeURIComponent(next)}`;
}

export function rulesLoginUrl(roleIds: string[]) {
  const token = createRulesRoleToken(roleIds);
  return `${getDashboardUrl()}${rulesLoginPath(token)}`;
}

export function parseRulesRoleIdsFromUrl(urlInput: unknown) {
  const raw = String(urlInput || "").trim();
  if (!raw) return [] as string[];

  function roleIdsFromMaybeUrl(value: string) {
    try {
      const url = new URL(value, getDashboardUrl());
      const directToken = url.searchParams.get("rt");
      if (directToken) return parseRulesRoleToken(directToken);
      const next = url.searchParams.get("next");
      if (!next) return [] as string[];
      const nested = new URL(next, getDashboardUrl());
      return parseRulesRoleToken(nested.searchParams.get("rt"));
    } catch {
      return [] as string[];
    }
  }

  return roleIdsFromMaybeUrl(raw);
}

export function isRulesAcceptPath(value: unknown) {
  const path = String(value || "").trim();
  return /^\/rules\/accept(?:[/?#]|$)/.test(path);
}

export function normalizeRulesAcceptPath(value: unknown, status?: "incomplete" | "completed" | "completed_owner_nickname_manual" | "completed_nickname_manual") {
  const path = String(value || "").trim();
  if (!isRulesAcceptPath(path)) return "";

  try {
    const url = new URL(path, getDashboardUrl());
    if (url.pathname !== "/rules/accept") return "";
    if (status) url.searchParams.set("status", status);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return status ? `/rules/accept?status=${encodeURIComponent(status)}` : "/rules/accept";
  }
}


export function rulesOnboardingStatus(profile: DashboardProfile | null | undefined, nicknameTemplate?: string) {
  const profileHref = profile?.profileId ? `/profile/${profile.profileId}` : "/profile";
  const settingsHref = profile?.profileId ? `/profile/${profile.profileId}/settings?setup=1` : "/profile";
  const main = profile ? getMainCharacter(profile) : null;
  const hasName = Boolean(profile?.preferredName && profile.preferredName.trim().length >= 2);
  const hasGender = Boolean(profile && cleanProfileGrammaticalGender(profile.grammaticalGender) !== "unspecified");
  const hasCharacters = Boolean(profile?.characters?.length);
  const hasMain = Boolean(main?.key && profile?.mainCharacterKey);
  const manualRaidRole = profile?.raidRolePreference?.characterKey === main?.key ? profile?.raidRolePreference?.role : null;
  const autoRaidRole = main ? resolveWowCharacterRole({
    className: main.className,
    activeSpecName: main.activeSpecName,
    activeSpecId: main.activeSpecId,
    activeSpecRole: main.activeSpecRole,
  }) : null;
  // Auto is a valid choice: once the main exists, the default raid role can be
  // derived from the main character spec. A manual override is optional.
  const hasRaidRole = Boolean(hasMain && (manualRaidRole || autoRaidRole));
  const nicknamePlan = buildProfileDiscordNicknamePlan(profile, nicknameTemplate);
  const hasNicknameTemplate = Boolean(nicknamePlan.value && nicknamePlan.hasRequiredName && hasMain);

  const steps: RulesOnboardingStep[] = [
    {
      key: "profile_name",
      title: "Імʼя",
      description: hasName ? `Вказано: ${profile?.preferredName}` : "Вкажи імʼя, яке буде основою серверного ніку.",
      complete: hasName,
      href: settingsHref,
    },
    {
      key: "profile_gender",
      title: "Стать / звертання",
      description: hasGender ? "Звертання вибрано." : "Вибери, як система має формувати персональні повідомлення.",
      complete: hasGender,
      href: settingsHref,
    },
    {
      key: "battlenet_characters",
      title: "Персонажі Battle.net",
      description: hasCharacters ? `Додано персонажів: ${profile?.characters.length}` : "Підключи Battle.net і додай персонажів до профілю.",
      complete: hasCharacters,
      href: profileHref,
    },
    {
      key: "main_character",
      title: "Мейн-персонаж",
      description: hasMain ? `Мейн: ${main?.name}` : "Вибери основного персонажа.",
      complete: hasMain,
      href: profileHref,
    },
    {
      key: "raid_role",
      title: "Роль у рейді для мейна",
      description: hasRaidRole
        ? manualRaidRole
          ? `Вручну: ${wowRoleLabel(manualRaidRole)}.`
          : `Авто зі спеки мейна: ${wowRoleLabel(autoRaidRole)}.`
        : "Вибери мейна або роль у рейді для мейна: авто, танк, хіл або ДД.",
      complete: hasRaidRole,
      href: settingsHref,
    },
    {
      key: "discord_nickname",
      title: "Серверний нік Discord",
      description: hasNicknameTemplate
        ? `Буде встановлено: ${nicknamePlan.value}`
        : "Після завершення система автоматично поставить нік за глобальним шаблоном із налаштувань керування.",
      complete: hasNicknameTemplate,
      href: settingsHref,
    },
  ];

  return {
    complete: steps.every((step) => step.complete),
    steps,
    mainCharacter: main,
    nicknamePlan,
    missing: steps.filter((step) => !step.complete),
  };
}

export async function markRulesOnboardingCompleted(profileId: string, input: { roleIds: string[]; nickname?: string | null }) {
  if (!hasFirebaseProfileConfig()) return;
  const cleanProfileId = String(profileId || "").trim();
  if (!/^id[a-f0-9]{16,40}$/.test(cleanProfileId)) return;
  await firebaseWrite(
    "rules",
    `profile:${cleanProfileId}:rules-onboarding`,
    () => getFirebaseAdminDb().collection("dashboardProfiles").doc(cleanProfileId).set({
      rulesOnboarding: {
        completedAt: FieldValue.serverTimestamp(),
        roleIds: cleanRoleIds(input.roleIds),
        nickname: input.nickname || null,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    {
      timeoutMs: 3_000,
      logEvent: "rules.onboarding_write_failed",
      fallback: () => undefined,
    },
  );
}
