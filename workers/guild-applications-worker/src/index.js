const DEFAULT_CACHE_SECONDS = 60;
const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 24;

const PATHS = new Set(["/", "/api/guild-applications"]);
const DEFAULT_LABEL = "guild-application";
const DEFAULT_REVIEW_LABEL = "status:review";

const STATUS_KEYS = new Set(["pending", "approved", "declined"]);

const ISSUE_STATUS = {
  PENDING: "На розгляді",
  APPROVED: "Прийнято",
  DECLINED: "Відхилено",
};

const DISCORD_COLORS = {
  PENDING: 0xd4a63a,
  APPROVED: 0x3ba55d,
  DECLINED: 0xed4245,
};

function buildCorsHeaders(corsOrigin, status = 200) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": status === 200 ? `public, max-age=${DEFAULT_CACHE_SECONDS}` : "no-store",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200, corsOrigin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: buildCorsHeaders(corsOrigin, status),
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configured.length) return origin || "*";
  if (!origin) return configured[0];
  return configured.includes(origin) ? origin : "";
}

function cleanText(value, maxLength = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultilineText(value, maxLength = 400) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeDiscordMarkdown(value) {
  return String(value || "")
    .replace(/@/g, "@​")
    .replace(/([*_`~|>])/g, "\\$1")
    .trim();
}

function formatCopyableValue(value, fallback = "Не вказано") {
  const clean = escapeDiscordMarkdown(String(value || "").trim());
  return `\`${clean || fallback}\``;
}

function limitText(value, maxLength, fallback = "Не вказано") {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, maxLength);
}

function buildCharacterRealmTag(characterName, realm) {
  const character = cleanText(characterName, 60);
  const compactRealm = cleanText(realm, 60).replace(/\s+/g, "");
  return [character, compactRealm].filter(Boolean).join("-");
}

function composeSourceValue(sourceCreator, sourcePlatform, sourceOther, sourceFallback) {
  const creator = cleanText(sourceCreator, 80);
  const platform = cleanText(sourcePlatform, 40);
  const other = cleanText(sourceOther, 120);
  const fallback = cleanText(sourceFallback, 120);

  if (creator === "Інше") {
    return other ? `Інше — ${other}` : "";
  }

  if (creator && platform) {
    return `${creator} — ${platform}`;
  }

  return fallback;
}

function sanitizePayload(payload) {
  return {
    region: cleanText(payload.region, 8).toLowerCase(),
    characterName: cleanText(payload.characterName, 60),
    faction: cleanText(payload.faction, 24),
    realm: cleanText(payload.realm, 60),
    className: cleanText(payload.className, 60),
    discord: cleanText(payload.discord, 80),
    battleTag: cleanText(payload.battleTag, 80),
    sourceCreator: cleanText(payload.sourceCreator, 80),
    sourcePlatform: cleanText(payload.sourcePlatform, 40),
    sourceOther: cleanText(payload.sourceOther, 120),
    source: composeSourceValue(
      payload.sourceCreator,
      payload.sourcePlatform,
      payload.sourceOther,
      payload.source
    ),
    availability: cleanMultilineText(payload.availability, 400),
  };
}

function validateApplication(payload) {
  if (
    !payload.region ||
    !payload.characterName ||
    !payload.faction ||
    !payload.realm ||
    !payload.availability
  ) {
    return "Будь ласка, заповни всі обов’язкові поля.";
  }

  const hasStructuredSource = !!payload.sourceCreator;

  if (hasStructuredSource) {
    if (payload.sourceCreator === "Інше" && !payload.sourceOther) {
      return "Вкажи, звідки саме ти дізнався про нас.";
    }

    if (payload.sourceCreator !== "Інше" && !payload.sourcePlatform) {
      return "Будь ласка, обери платформу.";
    }
  }

  if (payload.faction.toLowerCase() === "horde" && !payload.battleTag) {
    return "Для фракції Horde поле BattleTag є обов’язковим.";
  }

  return null;
}

function buildIssueBody(payload) {
  return [
    "### Персонаж",
    `- Регіон: ${payload.region}`,
    `- Ім’я персонажа: ${payload.characterName}`,
    `- Фракція: ${payload.faction}`,
    `- Реалм: ${payload.realm}`,
    `- Клас: ${payload.className || "Не вказано"}`,
    "",
    "### Контакти",
    "- Discord: Приховано",
    "- BattleTag: Приховано",
    `- Звідки дізнався: ${payload.source || "Не вказано"}`,
    "",
    "### Коли зазвичай грає",
    payload.availability,
  ].join("\n");
}

function extractApplicationDetails(body) {
  const text = String(body || "");
  const read = (pattern) => cleanText((text.match(pattern) || [])[1] || "", 120);

  return {
    region: read(/- Регіон: (.+)/),
    faction: read(/- Фракція: (.+)/),
    character: read(/- Ім’я персонажа: (.+)/),
    realm: read(/- Реалм: (.+)/),
    class_name: read(/- Клас: (.+)/),
  };
}

function extractSummary(body) {
  const details = extractApplicationDetails(body);
  return [details.character, details.realm, details.region, details.faction, details.class_name]
    .filter(Boolean)
    .join(" • ");
}

function normalizeLabels(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels.map((label) => String(label?.name || "").toLowerCase())
    : [];
}

function getIssueStatusKey(issue) {
  const labels = normalizeLabels(issue);

  if (labels.includes("status:approved") || labels.includes("status:accepted")) return "approved";
  if (labels.includes("status:declined") || labels.includes("status:rejected")) return "declined";
  return "pending";
}

function getIssueStatus(issue) {
  const key = getIssueStatusKey(issue);
  return ISSUE_STATUS[key.toUpperCase()] || ISSUE_STATUS.PENDING;
}

function resolveDiscordColor(statusText) {
  if (statusText === ISSUE_STATUS.APPROVED) return DISCORD_COLORS.APPROVED;
  if (statusText === ISSUE_STATUS.DECLINED) return DISCORD_COLORS.DECLINED;
  return DISCORD_COLORS.PENDING;
}

function slugifyRaiderIoValue(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function hasPositiveScore(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function formatMPlusSection(seasonData) {
  if (!seasonData || typeof seasonData !== "object" || !seasonData.scores) {
    return "Дані відсутні";
  }

  const scores = seasonData.scores;
  const lines = [];

  if (hasPositiveScore(scores.all)) {
    lines.push(`**Raider.IO M+:** ${formatScore(scores.all)}`);
  }
  if (hasPositiveScore(scores.tank)) {
    lines.push(`**Танк:** ${formatScore(scores.tank)}`);
  }
  if (hasPositiveScore(scores.healer)) {
    lines.push(`**Хіл:** ${formatScore(scores.healer)}`);
  }
  if (hasPositiveScore(scores.dps)) {
    lines.push(`**DPS:** ${formatScore(scores.dps)}`);
  }

  return lines.length ? lines.join("\n") : "Дані відсутні";
}

function prettifyRaidKey(key) {
  return String(key || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasRaidProgressData(raid) {
  if (!raid || typeof raid !== "object") return false;
  if (cleanText(raid.summary, 80)) return true;

  return (
    Number(raid.normal_bosses_killed || 0) > 0 ||
    Number(raid.heroic_bosses_killed || 0) > 0 ||
    Number(raid.mythic_bosses_killed || 0) > 0
  );
}

function formatRaidSummary(raid) {
  const summary = cleanText(raid?.summary, 80);
  if (summary) return summary;

  const total = Number(raid?.total_bosses || 0);
  const normal = Number(raid?.normal_bosses_killed || 0);
  const heroic = Number(raid?.heroic_bosses_killed || 0);
  const mythic = Number(raid?.mythic_bosses_killed || 0);

  const parts = [];
  if (mythic > 0) parts.push(`${mythic}/${total || "?"} M`);
  if (heroic > 0) parts.push(`${heroic}/${total || "?"} H`);
  if (normal > 0) parts.push(`${normal}/${total || "?"} N`);

  return parts.join(" • ");
}

function splitRaidProgressionByExpansion(raidProgression) {
  const entries = Object.entries(raidProgression || {})
    .map(([key, value]) => ({
      key,
      ...(value || {}),
    }))
    .filter((item) => Number.isFinite(Number(item.expansion_id)));

  const grouped = new Map();

  for (const raid of entries) {
    const expansionId = Number(raid.expansion_id);
    if (!grouped.has(expansionId)) {
      grouped.set(expansionId, []);
    }
    grouped.get(expansionId).push(raid);
  }

  const expansionIds = Array.from(grouped.keys()).sort((a, b) => b - a);

  return {
    current: expansionIds.length ? grouped.get(expansionIds[0]) || [] : [],
    previous: expansionIds.length > 1 ? grouped.get(expansionIds[1]) || [] : [],
  };
}

function formatRaidSection(raids) {
  const usefulRaids = (Array.isArray(raids) ? raids : []).filter(hasRaidProgressData);

  if (!usefulRaids.length) {
    return "Дані відсутні";
  }

  return usefulRaids
    .slice(0, 8)
    .map((raid) => {
      const summary = formatRaidSummary(raid);
      const name = prettifyRaidKey(raid.key);
      return summary ? `• **${name}:** ${summary}` : `• **${name}:** Дані відсутні`;
    })
    .join("\n");
}

async function fetchRaiderIoProfile(payload) {
  const region = cleanText(payload.region, 8).toLowerCase();
  const realmSlug = slugifyRaiderIoValue(payload.realm);
  const characterSlug = slugifyRaiderIoValue(payload.characterName);

  if (!region || !realmSlug || !characterSlug) {
    return {
      ok: false,
      error: "Не вдалося підготувати параметри Raider.IO.",
    };
  }

  const url = new URL("https://raider.io/api/v1/characters/profile");
  url.searchParams.set("region", region);
  url.searchParams.set("realm", realmSlug);
  url.searchParams.set("name", characterSlug);
  url.searchParams.set(
    "fields",
    "mythic_plus_scores_by_season:current:previous,raid_progression:current-expansion:previous-expansion"
  );

  try {
    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
      },
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const apiMessage =
        cleanText(data?.message || data?.error || "", 160) ||
        `HTTP ${response.status}`;
      return {
        ok: false,
        error: `Не вдалося отримати дані Raider.IO: ${apiMessage}.`,
      };
    }

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Не вдалося отримати дані Raider.IO: ${error.message}`
          : "Не вдалося отримати дані Raider.IO.",
    };
  }
}

function buildRaiderIoEmbedFields(raiderIoResult) {
  if (!raiderIoResult?.ok) {
    const errorText = limitText(
      raiderIoResult?.error || "Не вдалося отримати дані Raider.IO.",
      1024,
      "Не вдалося отримати дані Raider.IO."
    );

    return [
      {
        name: "Raider.IO • Mythic+ (current)",
        value: errorText,
        inline: false,
      },
      {
        name: "Raider.IO • Mythic+ (previous)",
        value: errorText,
        inline: false,
      },
      {
        name: "Raider.IO • Рейди (current expansion)",
        value: errorText,
        inline: false,
      },
      {
        name: "Raider.IO • Рейди (previous expansion)",
        value: errorText,
        inline: false,
      },
    ];
  }

  const data = raiderIoResult.data || {};
  const seasons = Array.isArray(data.mythic_plus_scores_by_season)
    ? data.mythic_plus_scores_by_season
    : [];
  const currentSeason = seasons[0] || null;
  const previousSeason = seasons[1] || null;

  const raidGroups = splitRaidProgressionByExpansion(data.raid_progression);

  return [
    {
      name: "Raider.IO • Mythic+ (current)",
      value: limitText(formatMPlusSection(currentSeason), 1024, "Дані відсутні"),
      inline: false,
    },
    {
      name: "Raider.IO • Mythic+ (previous)",
      value: limitText(formatMPlusSection(previousSeason), 1024, "Дані відсутні"),
      inline: false,
    },
    {
      name: "Raider.IO • Рейди (current expansion)",
      value: limitText(formatRaidSection(raidGroups.current), 1024, "Дані відсутні"),
      inline: false,
    },
    {
      name: "Raider.IO • Рейди (previous expansion)",
      value: limitText(formatRaidSection(raidGroups.previous), 1024, "Дані відсутні"),
      inline: false,
    },
  ];
}

function buildDiscordEmbeds(payload, issue, env, raiderIoResult) {
  const statusText = getIssueStatus(issue);
  const issueUrl = issue?.html_url ? String(issue.html_url) : "";
  const characterTag =
    buildCharacterRealmTag(payload.characterName, payload.realm) || payload.characterName;

  const description = [
    `**Статус:** ${escapeDiscordMarkdown(statusText)}`,
    issueUrl ? `**Issue:** ${issueUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4096);

  return [
    {
      title: limitText(`Нова заявка • ${characterTag}`, 256, "Нова заявка до гільдії"),
      description,
      color: resolveDiscordColor(statusText),
      fields: [
        {
          name: "Дані про персонажа",
          value: limitText(
            [
              `**Ім’я персонажа:** ${formatCopyableValue(characterTag)}`,
              `**Регіон:** ${formatCopyableValue(payload.region)}`,
              `**Фракція:** ${escapeDiscordMarkdown(payload.faction || "Не вказано")}`,
              `**Реалм:** ${escapeDiscordMarkdown(payload.realm || "Не вказано")}`,
              `**Клас:** ${escapeDiscordMarkdown(payload.className || "Не вказано")}`,
            ].join("\n"),
            1024
          ),
          inline: false,
        },
        {
          name: "Контакти",
          value: limitText(
            [
              `**Discord:** ${formatCopyableValue(payload.discord)}`,
              `**BattleTag:** ${formatCopyableValue(payload.battleTag)}`,
            ].join("\n"),
            1024
          ),
          inline: false,
        },
        {
          name: "Додатково",
          value: limitText(
            `**Звідки дізнався:** ${escapeDiscordMarkdown(payload.source || "Не вказано")}`,
            1024
          ),
          inline: false,
        },
        {
          name: "Коли зазвичай грає",
          value: limitText(
            escapeDiscordMarkdown(payload.availability || "Не вказано"),
            1024
          ),
          inline: false,
        },
        ...buildRaiderIoEmbedFields(raiderIoResult),
      ],
      footer: {
        text: limitText(env.DISCORD_GUILD_NAME || "Mistblossom Vanguard", 2048),
      },
      timestamp: new Date().toISOString(),
    },
  ];
}

async function githubFetch(env, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": env.GITHUB_USER_AGENT || "guild-applications-worker",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

async function parseJsonResponse(response) {
  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  return { raw, data };
}

async function createGithubIssue(env, payload) {
  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
    {
      method: "POST",
      body: JSON.stringify({
        title: `Заявка до гільдії: ${payload.characterName}`,
        body: buildIssueBody(payload),
        labels: [env.GUILD_APPLICATIONS_LABEL || DEFAULT_LABEL, DEFAULT_REVIEW_LABEL],
      }),
    }
  );

  const { raw, data } = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      data?.message ||
        raw ||
        "Не вдалося створити заявку. Спробуй ще раз трохи пізніше."
    );
  }

  return data;
}

async function sendDiscordNotification(env, payload, issue) {
  const webhookUrl = String(env.DISCORD_WEBHOOK_URL || "").trim();
  if (!webhookUrl) {
    return { skipped: true };
  }

  const raiderIoResult = await fetchRaiderIoProfile(payload);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      username: env.DISCORD_WEBHOOK_USERNAME || "Mistblossom Vanguard • Applications",
      avatar_url: env.DISCORD_WEBHOOK_AVATAR_URL || undefined,
      embeds: buildDiscordEmbeds(payload, issue, env, raiderIoResult),
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(raw || `Discord webhook error ${response.status}`);
  }

  return {
    ok: true,
    raider_io: raiderIoResult.ok
      ? { ok: true }
      : { ok: false, error: raiderIoResult.error || "Не вдалося отримати дані Raider.IO." },
  };
}

function mapIssueListItem(issue) {
  const details = extractApplicationDetails(issue.body);
  const statusKey = getIssueStatusKey(issue);

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    status_key: statusKey,
    status_text: getIssueStatus(issue),
    html_url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    closed_at: issue.closed_at,
    summary: extractSummary(issue.body),
    character_name: details.character,
    realm: details.realm,
    region: details.region,
    faction: details.faction,
    class_name: details.class_name,
    labels: Array.isArray(issue.labels) ? issue.labels.map((label) => label.name) : [],
  };
}

async function listApplications(request, env) {
  const origin = allowedOrigin(request, env) || "*";
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || String(DEFAULT_LIST_LIMIT), 10), 1),
    MAX_LIST_LIMIT
  );
  const sort = ["created", "updated"].includes(url.searchParams.get("sort"))
    ? url.searchParams.get("sort")
    : "created";
  const direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
  const label = encodeURIComponent(env.GUILD_APPLICATIONS_LABEL || DEFAULT_LABEL);

  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=all&per_page=${limit}&sort=${sort}&direction=${direction}&labels=${label}`
  );

  const { raw, data } = await parseJsonResponse(response);

  if (!response.ok) {
    return json(
      {
        error: "Список заявок тимчасово недоступний.",
        github_status: response.status,
        github_response: raw || null,
      },
      502,
      origin
    );
  }

  let items = (Array.isArray(data) ? data : [])
    .filter((issue) => !issue.pull_request)
    .map(mapIssueListItem);

  const status = cleanText(url.searchParams.get("status"), 24).toLowerCase();
  const className = cleanText(url.searchParams.get("class"), 60).toLowerCase();
  const query = cleanText(url.searchParams.get("q"), 120).toLowerCase();

  if (status && status !== "all" && STATUS_KEYS.has(status)) {
    items = items.filter((item) => item.status_key === status);
  }
  if (className && className !== "all") {
    items = items.filter((item) => String(item.class_name || "").toLowerCase() === className);
  }
  if (query) {
    items = items.filter((item) =>
      [item.title, item.summary, item.character_name, item.realm, item.region, item.faction, item.class_name]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }

  return json({ items, total: items.length }, 200, origin);
}

async function createApplication(request, env) {
  const origin = allowedOrigin(request, env);

  if (!origin) {
    return json({ error: "Надсилання заявок зараз недоступне." }, 403, "*");
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Не вдалося обробити заявку. Спробуй ще раз." }, 400, origin);
  }

  if (cleanText(payload.website, 200)) {
    return json({ error: "Не вдалося надіслати заявку. Спробуй ще раз." }, 400, origin);
  }

  const cleanPayload = sanitizePayload(payload);
  const validationError = validateApplication(cleanPayload);

  if (validationError) {
    return json({ error: validationError }, 400, origin);
  }

  try {
    const issue = await createGithubIssue(env, cleanPayload);

    let discord = { skipped: true };
    try {
      discord = await sendDiscordNotification(env, cleanPayload, issue);
    } catch (error) {
      discord = {
        ok: false,
        error: error instanceof Error ? error.message : "Discord notification failed.",
      };
    }

    return json(
      {
        ok: true,
        number: issue.number,
        html_url: issue.html_url,
        state: issue.state,
        status_text: getIssueStatus(issue),
        title: issue.title,
        discord,
      },
      201,
      origin
    );
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Невідома помилка.",
      },
      500,
      origin
    );
  }
}

export default {
  async fetch(request, env) {
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return json({ error: "Прийом заявок тимчасово недоступний." }, 500, "*");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin(request, env) || "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    if (!PATHS.has(url.pathname)) {
      return json(
        { error: "Сторінку не знайдено." },
        404,
        allowedOrigin(request, env) || "*"
      );
    }

    if (request.method === "GET") {
      return listApplications(request, env);
    }

    if (request.method === "POST") {
      return createApplication(request, env);
    }

    return json(
      { error: "Ця дія зараз недоступна." },
      405,
      allowedOrigin(request, env) || "*"
    );
  },
};