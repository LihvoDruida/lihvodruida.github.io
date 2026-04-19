function json(data, status = 200, corsOrigin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.ALLOWED_ORIGINS || "")
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

function extractSummary(body) {
  const text = String(body || "");
  const faction = (text.match(/- Фракція: (.+)/) || [])[1];
  const character = (text.match(/- Ім’я персонажа: (.+)/) || [])[1];
  const realm = (text.match(/- Реалм: (.+)/) || [])[1];
  const className = (text.match(/- Клас: (.+)/) || [])[1];

  const parts = [character, faction, className, realm].filter(Boolean);
  return parts.join(" • ");
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

function buildIssueBody(payload) {
  return [
    "### Персонаж",
    `- Ім’я персонажа: ${payload.characterName}`,
    `- Фракція: ${payload.faction}`,
    `- Реалм: ${payload.realm}`,
    `- Клас: ${payload.className || "Не вказано"}`,
    "",
    "### Контакти",
    `- Discord: Приховано`,
    `- BattleTag: Приховано`,
    `- Звідки дізнався: ${payload.source || "Не вказано"}`,
    "",
    "### Коли зазвичай грає",
    payload.availability,
  ].join("\n");
}

async function githubFetch(env, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": env.GITHUB_USER_AGENT || "guild-applications-worker",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function buildCharacterRealmTag(characterName, realm) {
  const character = cleanText(characterName, 60);
  const compactRealm = cleanText(realm, 60).replace(/\s+/g, "");
  return [character, compactRealm].filter(Boolean).join("-");
}

function escapeDiscordMarkdown(value) {
  return String(value || "")
    .replace(/@/g, "@​")
    .replace(/([*_`~|>])/g, "\\$1")
    .trim();
}

function buildDiscordMessage(payload, issue) {
  const lines = [
    "## Нова заявка до гільдії",
    `**Персонаж:** \`${escapeDiscordMarkdown(buildCharacterRealmTag(payload.characterName, payload.realm) || payload.characterName)}\``,
    `**Фракція:** ${escapeDiscordMarkdown(payload.faction)}`,
    `**Реалм:** ${escapeDiscordMarkdown(payload.realm)}`,
    `**Клас:** ${escapeDiscordMarkdown(payload.className || "Не вказано")}`,
    `**Discord:** ${escapeDiscordMarkdown(payload.discord || "Не вказано")}`,
    `**BattleTag:** ${escapeDiscordMarkdown(payload.battleTag || "Не вказано")}`,
    `**Звідки дізнався:** ${escapeDiscordMarkdown(payload.source || "Не вказано")}`,
    "",
    "### Коли зазвичай грає",
    escapeDiscordMarkdown(payload.availability || "Не вказано"),
  ];

  if (issue?.html_url) {
    lines.push("", `**Issue:** ${issue.html_url}`);
  }

  return lines.join("\n").slice(0, 1900);
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
      content: buildDiscordMessage(payload, issue),
      allowed_mentions: { parse: [] },
      username: env.DISCORD_WEBHOOK_USERNAME || "Mistblossom Vanguard",
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(raw || `Discord webhook error ${response.status}`);
  }

  return { ok: true };
}

async function listApplications(request, env) {
  const origin = allowedOrigin(request, env) || "*";
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "12", 10), 1), 50);
  const label = encodeURIComponent(env.GUILD_APPLICATIONS_LABEL || "guild-application");

  const response = await githubFetch(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=all&per_page=${limit}&sort=created&direction=desc&labels=${label}`
  );

  const raw = await response.text();
  let data = [];

  try {
    data = raw ? JSON.parse(raw) : [];
  } catch {
    data = [];
  }

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
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
      created_at: issue.created_at,
      closed_at: issue.closed_at,
      summary: extractSummary(issue.body),
      labels: Array.isArray(issue.labels) ? issue.labels.map((label) => label.name) : [],
    }));

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

  const cleanPayload = {
    characterName: cleanText(payload.characterName, 60),
    faction: cleanText(payload.faction, 24),
    realm: cleanText(payload.realm, 60),
    className: cleanText(payload.className, 60),
    discord: cleanText(payload.discord, 80),
    battleTag: cleanText(payload.battleTag, 80),
    sourceCreator: cleanText(payload.sourceCreator, 80),
    sourcePlatform: cleanText(payload.sourcePlatform, 40),
    sourceOther: cleanText(payload.sourceOther, 120),
    source: composeSourceValue(payload.sourceCreator, payload.sourcePlatform, payload.sourceOther, payload.source),
    availability: String(payload.availability || "").trim().slice(0, 400),
  };

  if (
    !cleanPayload.characterName ||
    !cleanPayload.faction ||
    !cleanPayload.realm ||
    !cleanPayload.availability
  ) {
    return json({ error: "Будь ласка, заповни всі обов’язкові поля." }, 400, origin);
  }

  const hasStructuredSource = !!cleanPayload.sourceCreator;
  if (hasStructuredSource) {
    if (cleanPayload.sourceCreator === "Інше" && !cleanPayload.sourceOther) {
      return json({ error: "Вкажи, звідки саме ти дізнався про нас." }, 400, origin);
    }

    if (cleanPayload.sourceCreator !== "Інше" && !cleanPayload.sourcePlatform) {
      return json({ error: "Будь ласка, обери платформу." }, 400, origin);
    }
  }


  if (cleanPayload.faction.toLowerCase() === "horde" && !cleanPayload.battleTag) {
    return json({ error: "Для фракції Horde поле BattleTag є обов’язковим." }, 400, origin);
  }

  const issueTitle = `Заявка до гільдії: ${cleanPayload.characterName}`;
  const issueBody = buildIssueBody(cleanPayload);

  try {
    const response = await githubFetch(
      env,
      `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
      {
        method: "POST",
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: [env.GUILD_APPLICATIONS_LABEL || "guild-application", "status:review"],
        }),
      }
    );

    const raw = await response.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      return json(
        {
          error: data?.message || data?.raw || "Не вдалося створити заявку. Спробуй ще раз трохи пізніше.",
          github_status: response.status,
          github_response: raw || null,
        },
        response.status,
        origin
      );
    }

    let discord = { skipped: true };

    try {
      discord = await sendDiscordNotification(env, cleanPayload, data);
    } catch (error) {
      discord = {
        ok: false,
        error: error instanceof Error ? error.message : "Discord notification failed.",
      };
    }

    return json(
      {
        ok: true,
        number: data.number,
        html_url: data.html_url,
        state: data.state,
        title: data.title,
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
    if (url.pathname !== "/" && url.pathname !== "/api/guild-applications") {
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
