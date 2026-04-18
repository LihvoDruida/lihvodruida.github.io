const LABELS = [
  { name: 'guild-application', color: '7057ff', description: 'Заявки, подані через сайт гільдії' },
  { name: 'status:review', color: 'f5c451', description: 'Заявка очікує на розгляд' },
];

function json(data, status = 200, corsOrigin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!configured.length) return origin || '*';
  if (!origin) return configured[0];
  return configured.includes(origin) ? origin : '';
}

function toSentence(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function githubFetch(env, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
}

async function ensureLabel(env, label) {
  const response = await githubFetch(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/labels`, {
    method: 'POST',
    body: JSON.stringify(label),
  });

  if (response.ok || response.status === 422) {
    return;
  }

  const errorText = await response.text();
  throw new Error(`Не вдалося підготувати мітку: ${errorText}`);
}

function extractSummary(body) {
  const text = String(body || '');
  const character = (text.match(/- Ім’я персонажа: (.+)/) || [])[1];
  const realm = (text.match(/- Реалм: (.+)/) || [])[1];
  const className = (text.match(/- Клас: (.+)/) || [])[1];
  const parts = [character, className, realm].filter(Boolean);
  return parts.length ? parts.join(' • ') : '';
}

function buildIssueBody(payload) {
  return [
    '### Персонаж',
    `- Ім’я персонажа: ${payload.characterName}`,
    `- Реалм: ${payload.realm || 'Не вказано'}`,
    `- Клас: ${payload.className}`,
    '',
    '### Контакти',
    `- Discord: ${payload.discord}`,
    `- BattleTag: ${payload.battleTag || 'Не вказано'}`,
    '',
    '### Коли зазвичай грає',
    payload.availability,
  ].join('\n');
}

async function listApplications(request, env) {
  const origin = allowedOrigin(request, env) || '*';
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '12', 10), 1), 30);
  const label = encodeURIComponent(env.GUILD_APPLICATIONS_LABEL || 'guild-application');

  const response = await githubFetch(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=all&per_page=${limit}&sort=created&direction=desc&labels=${label}`);
  if (!response.ok) {
    return json({ error: 'Список заявок тимчасово недоступний.' }, 502, origin);
  }

  const issues = await response.json();
  const items = (Array.isArray(issues) ? issues : [])
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
    return json({ error: 'Надсилання заявок зараз недоступне.' }, 403, '*');
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return json({ error: 'Не вдалося обробити заявку. Спробуй ще раз.' }, 400, origin);
  }

  if (toSentence(payload.website)) {
    return json({ error: 'Не вдалося надіслати заявку. Спробуй ще раз.' }, 400, origin);
  }

  const requiredFields = ['characterName', 'realm', 'className', 'discord', 'availability'];
  for (const field of requiredFields) {
    if (!toSentence(payload[field])) {
      return json({ error: 'Будь ласка, заповни всі обов’язкові поля.' }, 400, origin);
    }
  }

  const cleanPayload = {
    characterName: toSentence(payload.characterName).slice(0, 60),
    realm: toSentence(payload.realm).slice(0, 60),
    className: toSentence(payload.className).slice(0, 60),
    discord: toSentence(payload.discord).slice(0, 80),
    battleTag: toSentence(payload.battleTag).slice(0, 80),
    availability: String(payload.availability || '').trim().slice(0, 400),
  };

  try {
    await Promise.all(LABELS.map((label) => ensureLabel(env, label)));

    const issueTitle = `Заявка до гільдії: ${cleanPayload.characterName}`;
    const issueBody = buildIssueBody(cleanPayload);

    const response = await githubFetch(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: [env.GUILD_APPLICATIONS_LABEL || 'guild-application', 'status:review'],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ error: 'Не вдалося створити заявку. Спробуй ще раз трохи пізніше.' }, response.status, origin);
    }

    return json({
      ok: true,
      number: data.number,
      html_url: data.html_url,
      state: data.state,
      title: data.title,
    }, 201, origin);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Невідома помилка.' }, 500, origin);
  }
}

export default {
  async fetch(request, env) {
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return json({ error: 'Прийом заявок тимчасово недоступний.' }, 500, '*');
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin(request, env) || '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/api/guild-applications') {
      return json({ error: 'Сторінку не знайдено.' }, 404, allowedOrigin(request, env) || '*');
    }

    if (request.method === 'GET') {
      return listApplications(request, env);
    }

    if (request.method === 'POST') {
      return createApplication(request, env);
    }

    return json({ error: 'Ця дія зараз недоступна.' }, 405, allowedOrigin(request, env) || '*');
  },
};
