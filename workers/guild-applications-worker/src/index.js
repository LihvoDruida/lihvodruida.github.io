const DEFAULT_CACHE_SECONDS = 60;
const MAX_LIST_LIMIT = 50;
const DEFAULT_LIST_LIMIT = 12;

const PATHS = new Set(["/", "/api/guild-applications"]);
const DEFAULT_LABEL = "guild-application";
const DEFAULT_REVIEW_LABEL = "status:review";

const ISSUE_STATUS = {
  REVIEW: "На розгляді",
  ACCEPTED: "Прийнято",
  REJECTED: "Відхилено",
  CLOSED: "Закрито",
};

const DISCORD_COLORS = {
  REVIEW: 0xd4a63a,
  ACCEPTED: 0x3ba55d,
  REJECTED: 0xed4245,
  CLOSED: 0x747f8d,
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
  if (!payload.characterName || !payload.faction || !payload.realm || !payload.availability) {
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

function extractSummary(body) {
  const text = String(body || "");
  const faction = (text.match(/- Фракція: (.+)/) || [])[1];
  const character = (text.match(/- Ім’я персонажа: (.+)/) || [])[1];
  const realm = (text.match(/- Реалм: (.+)/) || [])[1];
  const className = (text.match(/- Клас: (.+)/) || [])[1];

  return [character, faction, className, realm].filter(Boolean).join(" • ");
}

function normalizeLabels(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels.map((label) => String(label?.name || "").toLowerCase())
    : [];
}

function getIssueStatus(issue) {
  const labels = normalizeLabels(issue);

  if (labels.includes("status:accepted")) return ISSUE_STATUS.ACCEPTED;
  if (labels.includes("status:rejected") || labels.includes("status:declined")) {
    return ISSUE_STATUS.REJECTED;
  }
  if (issue?.state === "closed") return ISSUE_STATUS.CLOSED;
  return ISSUE_STATUS.REVIEW;
}

function resolveDiscordColor(statusText) {
  switch (statusText) {
    case ISSUE_STATUS.ACCEPTED:
      return DISCORD_COLORS.ACCEPTED;
    case ISSUE_STATUS.REJECTED:
      return DISCORD_COLORS.REJECTED;
    case ISSUE_STATUS.CLOSED:
      return DISCORD_COLORS.CLOSED;
    default:
      return DISCORD_COLORS.REVIEW;
  }
}

function buildDiscordEmbeds(payload, issue, env) {
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

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      username: env.DISCORD_WEBHOOK_USERNAME || "Mistblossom Vanguard • Applications",
      avatar_url: env.DISCORD_WEBHOOK_AVATAR_URL || undefined,
      embeds: buildDiscordEmbeds(payload, issue, env),
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(raw || `Discord webhook error ${response.status}`);
  }

  return { ok: true };
}

function mapIssueListItem(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    status_text: getIssueStatus(issue),
    html_url: issue.html_url,
    created_at: issue.created_at,
    closed_at: issue.closed_at,
    summary: extractSummary(issue.body),
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
  const label = encodeURIComponent(env.GUILD_APPLICATIONS_LABEL || DEFAULT_LABEL);

  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=all&per_page=${limit}&sort=created&direction=desc&labels=${label}`
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

  const items = (Array.isArray(data) ? data : [])
    .filter((issue) => !issue.pull_request)
    .map(mapIssueListItem);

  return json({ items }, 200, origin);
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