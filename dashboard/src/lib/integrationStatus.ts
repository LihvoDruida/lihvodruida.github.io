import { checkBattleNetApplicationAccess, getDefaultBattleNetRegion } from "@/lib/battlenet";
import { discordApi, getDiscordGuildId, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { hasFirebaseProfileConfig, getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { githubFetch } from "@/lib/github";

export type IntegrationState = "ok" | "warning" | "error" | "unconfigured";

export type IntegrationStatusItem = {
  key: "discord" | "battlenet" | "github" | "firebase";
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
    return item("discord", "Discord", "unconfigured", "не налаштовано", checkedAt);
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
      return item("discord", "Discord", "warning", "підключено через Worker або без прямої перевірки", checkedAt);
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
      return item("battlenet", "Battle.net", "unconfigured", "не налаштовано", checkedAt);
    }
    return item("battlenet", "Battle.net", "error", message, checkedAt);
  }
}

async function checkGitHub(checkedAt: string): Promise<IntegrationStatusItem> {
  try {
    await githubFetch("/issues?per_page=1&state=all");
    return item("github", "GitHub Issues", "ok", "працює", checkedAt);
  } catch (error) {
    const message = safeMessage(error, "GitHub Issues тимчасово недоступний");
    if (/env is not configured|not configured/i.test(message)) {
      return item("github", "GitHub Issues", "unconfigured", "не налаштовано", checkedAt);
    }
    return item("github", "GitHub Issues", "error", message, checkedAt);
  }
}

async function checkFirebase(checkedAt: string): Promise<IntegrationStatusItem> {
  if (!hasFirebaseProfileConfig()) {
    return item("firebase", "Firebase", "unconfigured", "не налаштовано", checkedAt);
  }

  try {
    const db = getFirebaseAdminDb();
    await db.collection("profiles").limit(1).get();
    return item("firebase", "Firebase", "ok", "працює", checkedAt);
  } catch (error) {
    return item("firebase", "Firebase", "error", safeMessage(error, "Firebase тимчасово недоступний"), checkedAt);
  }
}

export async function getIntegrationStatusSummary(): Promise<IntegrationStatusSummary> {
  const checkedAt = new Date().toISOString();
  const results = await Promise.allSettled([
    checkDiscord(checkedAt),
    checkBattleNet(checkedAt),
    checkGitHub(checkedAt),
    checkFirebase(checkedAt),
  ]);

  const fallbackKeys: Array<[IntegrationStatusItem["key"], string]> = [
    ["discord", "Discord"],
    ["battlenet", "Battle.net"],
    ["github", "GitHub Issues"],
    ["firebase", "Firebase"],
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
