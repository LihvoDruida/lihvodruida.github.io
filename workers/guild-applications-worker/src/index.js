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

function buildIssueBody(payload) {
  return [
    "### Персонаж",
    `- Ім’я персонажа: ${payload.characterName}`,
    `- Фракція: ${payload.faction}`,
    `- Реалм: ${payload.realm}`,
    `- Клас: ${payload.className}`,
    "",
    "### Контакти",
    `- Discord: ${payload.discord}`,
    `- BattleTag: ${payload.battleTag || "Не вказано"}`,
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
    availability: String(payload.availability || "").trim().slice(0, 400),
  };

  if (
    !cleanPayload.characterName ||
    !cleanPayload.faction ||
    !cleanPayload.realm ||
    !cleanPayload.className ||
    !cleanPayload.discord ||
    !cleanPayload.availability
  ) {
    return json({ error: "Будь ласка, заповни всі обов’язкові поля." }, 400, origin);
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

    return json(
      {
        ok: true,
        number: data.number,
        html_url: data.html_url,
        state: data.state,
        title: data.title,
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
