import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDashboardUrl } from "@/lib/oauth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import {
  buildProfileDiscordNicknamePlan,
  cleanProfileGrammaticalGender,
  getMainCharacter,
  type DashboardProfile,
} from "@/lib/profiles";

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
  const values = Array.isArray(roleIds) ? roleIds : String(roleIds || "").split(/[,.\s;]+/g);
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter((item) => /^\d{16,25}$/.test(item)))).slice(0, 10);
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

export function createRulesRoleToken(roleIdsInput: string[]) {
  const roleIds = cleanRoleIds(roleIdsInput);
  if (!roleIds.length) throw new Error("Для правил потрібно вибрати роль, яка буде видана після реєстрації.");
  const payload = base64UrlJson({ v: TOKEN_VERSION, r: roleIds });
  return `${payload}.${signPayload(payload)}`;
}

export function parseRulesRoleToken(tokenInput: unknown) {
  const token = String(tokenInput || "").trim();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !verifySignature(payload, signature)) return [] as string[];
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Number(parsed?.v) !== TOKEN_VERSION) return [] as string[];
    return cleanRoleIds(parsed?.r);
  } catch {
    return [] as string[];
  }
}

export function rulesAcceptPath(roleIds: string[]) {
  return `/rules/accept?rt=${encodeURIComponent(createRulesRoleToken(roleIds))}`;
}

export function rulesAcceptUrl(roleIds: string[]) {
  return `${getDashboardUrl()}${rulesAcceptPath(roleIds)}`;
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

export function rulesOnboardingStatus(profile: DashboardProfile | null | undefined, nicknameTemplate?: string) {
  const profileHref = profile?.profileId ? `/profile/${profile.profileId}` : "/profile";
  const settingsHref = profile?.profileId ? `/profile/${profile.profileId}/settings?setup=1` : "/profile";
  const main = profile ? getMainCharacter(profile) : null;
  const hasName = Boolean(profile?.preferredName && profile.preferredName.trim().length >= 2);
  const hasGender = Boolean(profile && cleanProfileGrammaticalGender(profile.grammaticalGender) !== "unspecified");
  const hasCharacters = Boolean(profile?.characters?.length);
  const hasMain = Boolean(main?.key && profile?.mainCharacterKey);
  const hasRaidRole = Boolean(profile?.raidRolePreference?.characterKey && profile.raidRolePreference.characterKey === main?.key && profile.raidRolePreference.role);
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
      description: hasRaidRole ? "Роль у рейді вибрано вручну." : "Вибери роль у рейді для мейна: танк, хіл або ДД.",
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
  await getFirebaseAdminDb().collection("dashboardProfiles").doc(cleanProfileId).set({
    rulesOnboarding: {
      completedAt: FieldValue.serverTimestamp(),
      roleIds: cleanRoleIds(input.roleIds),
      nickname: input.nickname || null,
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
