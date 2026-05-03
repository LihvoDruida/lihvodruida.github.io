# Guild Applications Worker

Cloudflare Worker для **Mistblossom Vanguard**: заявки до гільдії, збереження заявок у GitHub Issues, Discord-кнопки модерації, кнопки правил, підпис на правила рейду, проксі для кнопок рейдових оголошень і статистика для адмін-панелі.

Worker з’єднує між собою:

- публічний сайт гільдії, який надсилає заявки;
- GitHub Issues, які використовуються як база заявок;
- Discord, який використовується для повідомлень, кнопок модерації, правил, ролей і рейдів;
- admin dashboard, який перевіряє профілі, main-персонажа, рейдові дії та читає статистику;
- Cloudflare KV, який зберігає статистику правил і підписантів правил рейду.

## Документація

- [Огляд функціоналу](docs/ua/FUNCTIONALITY.md)
- [API reference](docs/ua/API.md)
- [Environment variables і bindings](docs/ua/VARIABLES.md)
- [Окремий список змінних, спільних з dashboard](docs/ua/DASHBOARD_SHARED_VARIABLES.md)
- [Інструкція розгортання](docs/ua/DEPLOYMENT.md)

English documentation is available in [`README.md`](README.md) and [`docs/en`](docs/en).

## Основні routes

| Route | Method | Призначення |
|---|---:|---|
| `/` | `GET` | Список заявок із GitHub Issues. |
| `/` | `POST` | Створення заявки. |
| `/api/guild-applications` | `GET` | Список заявок із GitHub Issues. |
| `/api/guild-applications` | `POST` | Створення заявки, GitHub Issue і Discord-повідомлення. |
| `/api/discord-interactions` | `POST` | Discord interaction endpoint для кнопок заявок, правил, raid-rules signup і рейдових кнопок. |
| `/api/discord-rules-stats` | `GET` | Статистика прийняття/відмови звичайних правил. Також може читати raid stats через `type=raid`. |
| `/api/discord-raid-rules-stats` | `GET` | Статистика підписів під правилами рейду. |
| `/api/discord-raid-rules-signups` | `GET` | Список підписантів правил рейду з main-персонажем. |
| `/api/discord-raid-message` | `POST` | Створення, редагування або видалення Discord-повідомлень рейду через Worker. |
| `/api/discord-guild-channels` | `GET` | Список Discord text/news каналів для селекторів у dashboard. |

## Швидке розгортання

```bash
cd workers/guild-applications-worker
npm install -g wrangler
wrangler login
wrangler kv namespace create RULES_STATS
```

Додай id KV namespace у `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RULES_STATS"
id = "paste_kv_namespace_id_here"
```

Додай production secrets:

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_GUILD_ID
wrangler secret put INTERNAL_PROFILE_LOOKUP_TOKEN
wrangler secret put DISCORD_RULES_STATS_TOKEN
```

Якщо admin dashboard захищений Cloudflare Access, додай також:

```bash
wrangler secret put CF_ACCESS_CLIENT_ID
wrangler secret put CF_ACCESS_CLIENT_SECRET
```

Deploy:

```bash
wrangler deploy
```

## Мінімально потрібне для production

Для нормальної роботи потрібні:

- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` для GitHub Issues;
- `ALLOWED_ORIGINS` з origin публічного сайту й dashboard;
- `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID` для Discord bot/interactions;
- `DISCORD_CHANNEL_ID`, якщо заявки мають публікуватися в Discord;
- `RULES_STATS` KV binding, якщо потрібна статистика правил і raid-rules;
- `INTERNAL_PROFILE_LOOKUP_TOKEN` і `ADMIN_DASHBOARD_URL` для перевірки профілю/main-персонажа;
- `DISCORD_RULES_STATS_TOKEN`, спільний із dashboard, для захисту stats/message endpoints.

Повна таблиця змінних: [docs/ua/VARIABLES.md](docs/ua/VARIABLES.md).
