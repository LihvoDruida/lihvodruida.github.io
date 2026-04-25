const DISCORD_API_BASE = "https://discord.com/api/v10";
const DASHBOARD_CUSTOM_ID_PREFIX = "mbv1";

export type DiscordTextChannel = {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id?: string | null;
};

export type DiscordRoleOption = {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
};

export type DiscordGuildSnapshot = {
  id: string;
  name: string;
  rules_channel_id?: string | null;
};

export type DiscordMessageRef = {
  guildId?: string;
  channelId: string;
  messageId: string;
};

type DiscordEmbedInput = Record<string, unknown>;

type DiscordRequestInit = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
  auditReason?: string;
};

function getBotToken() {
  return String(process.env.DISCORD_BOT_TOKEN || "").trim();
}

export function getDiscordGuildId() {
  return String(process.env.DISCORD_GUILD_ID || "").trim();
}

export function getDiscordPublicKey() {
  return String(process.env.DISCORD_PUBLIC_KEY || "").trim();
}

export function hasDiscordEmbedConfig() {
  return Boolean(getBotToken() && getDiscordGuildId());
}

function encodeAuditReason(reason?: string) {
  const value = String(reason || "").trim();
  if (!value) return undefined;
  return encodeURIComponent(value.slice(0, 512));
}

export async function discordApi<T = any>(path: string, init: DiscordRequestInit = {}): Promise<T> {
  const token = getBotToken();
  if (!token) throw new Error("DISCORD_BOT_TOKEN не налаштовано.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bot ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  const auditReason = encodeAuditReason(init.auditReason);
  if (auditReason) headers.set("X-Audit-Log-Reason", auditReason);

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;

  const raw = await response.text().catch(() => "");
  const json = raw ? tryParseJson(raw) : null;

  if (!response.ok) {
    const detail = typeof json?.message === "string" ? json.message : raw;
    throw new Error(`Discord API ${response.status}: ${String(detail || "невідома помилка").slice(0, 220)}`);
  }

  return (json ?? raw) as T;
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function snowflake(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{16,25}$/.test(text) ? text : "";
}

function cleanText(value: unknown, max: number) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function cleanUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

function cleanColor(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(0xffffff, Math.floor(parsed)));
}

function cleanImageObject(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const url = cleanUrl((value as Record<string, unknown>).url);
  return url ? { url } : undefined;
}

function cleanAuthor(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const name = cleanText(item.name, 256);
  if (!name) return undefined;
  return {
    name,
    url: cleanUrl(item.url),
    icon_url: cleanUrl(item.icon_url),
  };
}

function cleanFooter(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const text = cleanText(item.text, 2048);
  if (!text) return undefined;
  return {
    text,
    icon_url: cleanUrl(item.icon_url),
  };
}

function cleanFields(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const fields = value
    .slice(0, 25)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const field = item as Record<string, unknown>;
      const name = cleanText(field.name, 256);
      const fieldValue = cleanText(field.value, 1024);
      if (!name || !fieldValue) return null;
      return { name, value: fieldValue, inline: Boolean(field.inline) };
    })
    .filter(Boolean);

  return fields.length ? fields : undefined;
}

export function normalizeDiscordEmbed(input: DiscordEmbedInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Embed має бути JSON-обʼєктом.");
  }

  const embed = {
    title: cleanText(input.title, 256) || undefined,
    description: cleanText(input.description, 4096) || undefined,
    url: cleanUrl(input.url),
    color: cleanColor(input.color),
    thumbnail: cleanImageObject(input.thumbnail),
    image: cleanImageObject(input.image),
    author: cleanAuthor(input.author),
    footer: cleanFooter(input.footer),
    fields: cleanFields(input.fields),
    timestamp: input.timestamp === true ? new Date().toISOString() : typeof input.timestamp === "string" ? cleanText(input.timestamp, 80) : undefined,
  };

  const normalized = Object.fromEntries(
    Object.entries(embed).filter(([, value]) => value !== undefined && value !== null)
  );

  if (!normalized.title && !normalized.description && !normalized.image && !normalized.thumbnail && !normalized.fields) {
    throw new Error("Embed порожній: додай title, description, image, thumbnail або fields.");
  }

  return normalized;
}

export function parseEmbedJson(raw: FormDataEntryValue | null) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("JSON embed порожній.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Невалідний JSON embed: ${error instanceof Error ? error.message : "помилка парсингу"}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON embed має бути одним обʼєктом, не масивом.");
  }

  return normalizeDiscordEmbed(parsed as DiscordEmbedInput);
}

export async function fetchDiscordGuildSnapshot(): Promise<DiscordGuildSnapshot> {
  const guildId = getDiscordGuildId();
  if (!guildId) throw new Error("DISCORD_GUILD_ID не налаштовано.");
  const guild = await discordApi<any>(`/guilds/${guildId}`);
  return {
    id: String(guild.id || guildId),
    name: String(guild.name || "Discord guild"),
    rules_channel_id: guild.rules_channel_id ? String(guild.rules_channel_id) : null,
  };
}

export async function fetchDiscordTextChannels() {
  const guildId = getDiscordGuildId();
  if (!guildId) throw new Error("DISCORD_GUILD_ID не налаштовано.");

  const [guild, channels] = await Promise.all([
    fetchDiscordGuildSnapshot().catch(() => null),
    discordApi<any[]>(`/guilds/${guildId}/channels`),
  ]);

  const textChannels: DiscordTextChannel[] = channels
    .filter((channel) => channel && (channel.type === 0 || channel.type === 5))
    .map((channel) => ({
      id: String(channel.id),
      name: String(channel.name || "channel"),
      type: Number(channel.type || 0),
      position: Number(channel.position || 0),
      parent_id: channel.parent_id ? String(channel.parent_id) : null,
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "uk"));

  const rulesByGuild = guild?.rules_channel_id
    ? textChannels.find((channel) => channel.id === guild.rules_channel_id)
    : undefined;

  const rulesByName = textChannels.find((channel) => {
    const name = channel.name.toLowerCase();
    return name.includes("rules") || name.includes("rule") || name.includes("правил") || name.includes("pravyl") || name.includes("правила");
  });

  return {
    guild,
    channels: textChannels,
    suggestedRulesChannelId: rulesByGuild?.id || rulesByName?.id || textChannels[0]?.id || "",
  };
}

export async function fetchDiscordRoles() {
  const guildId = getDiscordGuildId();
  if (!guildId) throw new Error("DISCORD_GUILD_ID не налаштовано.");
  const roles = await discordApi<any[]>(`/guilds/${guildId}/roles`);

  return roles
    .filter((role) => role && String(role.id) !== guildId && !role.managed)
    .map((role) => ({
      id: String(role.id),
      name: String(role.name || "role"),
      color: Number(role.color || 0),
      position: Number(role.position || 0),
      managed: Boolean(role.managed),
    } satisfies DiscordRoleOption))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name, "uk"));
}

function snowflakeToBase36(id: string) {
  return BigInt(id).toString(36);
}

function base36ToSnowflake(value: string) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = 0n;
  for (const raw of value.toLowerCase()) {
    const digit = alphabet.indexOf(raw);
    if (digit < 0) throw new Error("Некоректний custom_id кнопки.");
    result = result * 36n + BigInt(digit);
  }
  return result.toString(10);
}

export function buildRulesAcceptCustomId(roleIds: string[]) {
  const cleaned = Array.from(new Set(roleIds.map(snowflake).filter(Boolean)));
  if (cleaned.length === 0) throw new Error("Для кнопки “Прийняти” потрібно вибрати хоча б одну роль.");

  const encoded = cleaned.map(snowflakeToBase36).join(".");
  const customId = `${DASHBOARD_CUSTOM_ID_PREFIX}:a:${encoded}`;
  if (customId.length > 100) {
    throw new Error("Вибрано забагато ролей для однієї Discord-кнопки. Зменш кількість ролей або створи одну збірну роль.");
  }
  return customId;
}

export function buildRulesDeclineCustomId() {
  return `${DASHBOARD_CUSTOM_ID_PREFIX}:d`;
}

export function decodeRulesCustomId(customId: string) {
  const value = String(customId || "").trim();
  if (value === buildRulesDeclineCustomId()) return { action: "decline" as const, roleIds: [] as string[] };

  const prefix = `${DASHBOARD_CUSTOM_ID_PREFIX}:a:`;
  if (!value.startsWith(prefix)) return null;

  try {
    const roleIds = value
      .slice(prefix.length)
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(base36ToSnowflake)
      .filter((id) => /^\d{16,25}$/.test(id));

    if (roleIds.length === 0) return null;
    return { action: "accept" as const, roleIds };
  } catch {
    return null;
  }
}

export function buildRulesComponents(roleIds: string[]) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Прийняти правила",
          custom_id: buildRulesAcceptCustomId(roleIds),
        },
        {
          type: 2,
          style: 4,
          label: "Відмовитися",
          custom_id: buildRulesDeclineCustomId(),
        },
      ],
    },
  ];
}

export function parseDiscordMessageRef(value: string): DiscordMessageRef | null {
  const text = String(value || "").trim();
  if (!text) return null;

  const link = text.match(/discord(?:app)?\.com\/channels\/(\d{16,25}|@me)\/(\d{16,25})\/(\d{16,25})/i);
  if (link) {
    return {
      guildId: link[1] === "@me" ? undefined : link[1],
      channelId: link[2],
      messageId: link[3],
    };
  }

  const ids = text.match(/^(\d{16,25})[\s,/|:]+(\d{16,25})$/);
  if (ids) return { channelId: ids[1], messageId: ids[2] };

  return null;
}

export async function createDiscordEmbedMessage(params: {
  channelId: string;
  content?: string;
  embed: Record<string, unknown>;
  roleIds?: string[];
  withRulesButtons?: boolean;
  auditReason?: string;
}) {
  const channelId = snowflake(params.channelId);
  if (!channelId) throw new Error("Канал Discord не вибрано або ID невалідний.");

  const body: Record<string, unknown> = {
    content: cleanText(params.content, 2000) || undefined,
    embeds: [params.embed],
    allowed_mentions: { parse: [] },
  };

  if (params.withRulesButtons) {
    body.components = buildRulesComponents(params.roleIds || []);
  }

  return discordApi<any>(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
    auditReason: params.auditReason,
  });
}

export async function editDiscordEmbedMessage(params: {
  ref: DiscordMessageRef;
  content?: string;
  embed: Record<string, unknown>;
  roleIds?: string[];
  withRulesButtons?: boolean;
  auditReason?: string;
}) {
  if (!params.ref.channelId || !params.ref.messageId) throw new Error("Посилання на Discord-повідомлення невалідне.");

  const body: Record<string, unknown> = {
    content: cleanText(params.content, 2000) || undefined,
    embeds: [params.embed],
    components: params.withRulesButtons ? buildRulesComponents(params.roleIds || []) : [],
    allowed_mentions: { parse: [] },
  };

  return discordApi<any>(`/channels/${params.ref.channelId}/messages/${params.ref.messageId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    auditReason: params.auditReason,
  });
}

export async function addGuildMemberRoles(params: {
  guildId: string;
  userId: string;
  roleIds: string[];
  reason?: string;
}) {
  const guildId = snowflake(params.guildId);
  const userId = snowflake(params.userId);
  const roleIds = Array.from(new Set(params.roleIds.map(snowflake).filter(Boolean)));

  if (!guildId || !userId || roleIds.length === 0) throw new Error("Не вистачає guild/user/role ID для видачі ролі.");

  for (const roleId of roleIds) {
    await discordApi<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: "PUT",
      auditReason: params.reason,
    });
  }
}

export async function kickGuildMember(params: {
  guildId: string;
  userId: string;
  reason?: string;
}) {
  const guildId = snowflake(params.guildId);
  const userId = snowflake(params.userId);
  if (!guildId || !userId) throw new Error("Не вистачає guild/user ID для кіку.");

  await discordApi<void>(`/guilds/${guildId}/members/${userId}`, {
    method: "DELETE",
    auditReason: params.reason,
  });
}

export async function verifyDiscordInteractionSignature(request: Request, rawBody: string) {
  const publicKey = getDiscordPublicKey();
  if (!publicKey) throw new Error("DISCORD_PUBLIC_KEY не налаштовано.");

  const signature = request.headers.get("x-signature-ed25519") || "";
  const timestamp = request.headers.get("x-signature-timestamp") || "";
  if (!signature || !timestamp) return false;

  const keyBytes = hexToBytes(publicKey);
  const signatureBytes = hexToBytes(signature);
  const bodyBytes = new TextEncoder().encode(`${timestamp}${rawBody}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "Ed25519" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify({ name: "Ed25519" }, cryptoKey, signatureBytes, bodyBytes);
}

function hexToBytes(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Некоректний hex-ключ або підпис Discord.");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

export function discordMessageUrl(channelId: string, messageId: string) {
  const guildId = getDiscordGuildId() || "@me";
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}
