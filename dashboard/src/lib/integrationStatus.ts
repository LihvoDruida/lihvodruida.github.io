import { checkBattleNetApplicationAccess, getDefaultBattleNetRegion } from "@/lib/battlenet";
import { discordApi, getDiscordGuildId, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { hasFirebaseProfileConfig, getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { firebaseCapability } from "@/lib/firebaseAccess";
import { githubFetch } from "@/lib/github";

export type IntegrationState = "ok" | "warning" | "error" | "unconfigured";

export type IntegrationStatusItem = {
  key: "discord" | "battlenet" | "github" | "firebase" | "firebase-write";
  label: string;
  state: IntegrationState;
  message: string;
  checkedAt: string;
};

export type IntegrationStatusSummary = {
  checkedAt: string;
  items: IntegrationStatusItem[];
};

function item(key: IntegrationStatusItem["key"], label: string, state: IntegrationState, message: string, checkedAt: string): IntegrationStatusItem {
  return { key, label, state, message, checkedAt };
}

function safeMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (message || fallback).replace(/\s+/g, " ").trim().slice(0, 160) || fallback;
}

async function checkDiscord(checkedAt: string): Promise<IntegrationStatusItem> {
  if (!hasDiscordEmbedConfig()) {
    return item("discord", "Discord", "unconfigured", "потребує уваги", checkedAt);
  }

  const guildId = getDiscordGuildId();
  if (!guildId) {
    return item("discord", "Discord", "warning", "бот є, але guild id не заданий", checkedAt);
  }

  try {
    await discordApi(`/guilds/${guildId}`);
    return item("discord", "Discord", "ok", "працює", checkedAt);
  } catch (error) {
    const message = safeMessage(error, "Discord тимчасово недоступний");
    if (/тимчасово недоступна|bot token|публікація/i.test(message)) {
      return item("discord", "Discord", "warning", "підключено, але потрібна ручна перевірка", checkedAt);
    }
    return item("discord", "Discord", "error", message, checkedAt);
  }
}

async function checkBattleNet(checkedAt: string): Promise<IntegrationStatusItem> {
  try {
    await checkBattleNetApplicationAccess(getDefaultBattleNetRegion());
    return item("battlenet", "Battle.net", "ok", "працює", checkedAt);
  } catch (error) {
    const message = safeMessage(error, "Battle.net тимчасово недоступний");
    if (/not configured|env is not configured|oauth env/i.test(message)) {
      return item("battlenet", "Battle.net", "unconfigured", "потребує уваги", checkedAt);
    }
    return item("battlenet", "Battle.net", "error", message, checkedAt);
  }
}

async function checkGitHub(checkedAt: string): Promise<IntegrationStatusItem> {
  try {
    await githubFetch("/issues?per_page=1&state=all");
    return item("github", "Заявки", "ok", "працює", checkedAt);
  } catch (error) {
    const message = safeMessage(error, "Заявки тимчасово недоступні");
    if (/env is not configured|not configured/i.test(message)) {
      return item("github", "Заявки", "unconfigured", "потребує уваги", checkedAt);
    }
    return item("github", "Заявки", "error", message, checkedAt);
  }
}

async function checkFirebaseProfiles(checkedAt: string): Promise<IntegrationStatusItem> {
  if (!hasFirebaseProfileConfig()) {
    return item("firebase", "Профілі", "unconfigured", "потребує уваги", checkedAt);
  }

  try {
    const db = getFirebaseAdminDb();
    await db.collection("dashboardProfiles").limit(1).get();
    return item("firebase", "Профілі", "ok", "працює", checkedAt);
  } catch (error) {
    return item("firebase", "Профілі", "error", safeMessage(error, "Профілі тимчасово недоступні"), checkedAt);
  }
}

async function checkFirebaseWrites(checkedAt: string): Promise<IntegrationStatusItem> {
  const capability = firebaseCapability("profile", "write");
  if (!capability.configured) {
    return item("firebase-write", "Запис Firebase", "unconfigured", "потребує уваги", checkedAt);
  }
  if (!capability.available) {
    return item("firebase-write", "Запис Firebase", "warning", "режим тільки читання", checkedAt);
  }
  return item("firebase-write", "Запис Firebase", "ok", "доступний", checkedAt);
}

export async function getIntegrationStatusSummary(): Promise<IntegrationStatusSummary> {
  const checkedAt = new Date().toISOString();
  const results = await Promise.allSettled([
    checkDiscord(checkedAt),
    checkBattleNet(checkedAt),
    checkGitHub(checkedAt),
    checkFirebaseProfiles(checkedAt),
    checkFirebaseWrites(checkedAt),
  ]);

  const fallbackKeys: Array<[IntegrationStatusItem["key"], string]> = [
    ["discord", "Discord"],
    ["battlenet", "Battle.net"],
    ["github", "Заявки"],
    ["firebase", "Профілі"],
    ["firebase-write", "Запис Firebase"],
  ];

  return {
    checkedAt,
    items: results.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      const [key, label] = fallbackKeys[index] || ["discord", "Інтеграція"];
      return item(key, label, "error", "перевірка не виконалась", checkedAt);
    }),
  };
}
