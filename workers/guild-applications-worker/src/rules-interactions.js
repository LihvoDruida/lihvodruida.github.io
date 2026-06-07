import { isKvRateLimited } from "./kv-utils.js";
import { getDiscordUserId } from "./discord-utils.js";

export async function isRulesInteractionRateLimited(env, interaction, scope = "rules", windowMs = 2500) {
  return isKvRateLimited(env, `${scope}:${getDiscordUserId(interaction)}`, windowMs);
}
