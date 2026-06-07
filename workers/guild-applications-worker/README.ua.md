# Guild Applications Worker

Cloudflare Worker для **Mistblossom Vanguard**: заявки до гільдії, збереження заявок у Firebase Firestore, Discord-кнопки модерації, кнопки правил, підпис на правила рейду, проксі для кнопок рейдових оголошень і статистика для адмін-панелі.

Worker з’єднує між собою:

- публічний сайт гільдії, який надсилає заявки;
- Firebase Firestore, який використовується як база заявок;
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
| `/` | `GET` | Список заявок із Firebase Firestore. |
| `/` | `POST` | Створення заявки. |
| `/api/guild-applications` | `GET` | Список заявок із Firebase Firestore. |
| `/api/guild-applications` | `POST` | Валідація і створення Firebase-заявки та Discord-повідомлення. |
| `/api/discord-interactions` | `POST` | Discord interaction endpoint для кнопок заявок, правил, raid-rules signup і рейдових кнопок. |
| `/api/discord-rules-stats` | `GET` | Статистика прийняття/відмови звичайних правил. Також може читати raid stats через `type=raid`. |
| `/api/discord-raid-rules-stats` | `GET` | Статистика підписів під правилами рейду. |
| `/api/discord-raid-rules-signups` | `GET` | Список підписантів правил рейду з main-персонажем. |
| `/api/discord-raid-message` | `POST` | Створення, редагування або видалення Discord-повідомлень рейду через Worker. |
| `/api/discord-guild-channels` | `GET` | Список Discord text/news каналів для селекторів у dashboard. |
| `/api/raids/lifecycle` | `POST` | Ручний запуск ідемпотентного raid lifecycle runner. Потребує `RAID_LIFECYCLE_SECRET`. |

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

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_APPLICATIONS_COLLECTION` для Firestore-заявок;
- `APPLICATION_NUMBER_DATE_SALT` — стабільна цифрова сіль для номера відстеження заявки з кодованою датою;
- `ALLOWED_ORIGINS` з origin публічного сайту й dashboard;
- `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID` для Discord bot/interactions;
- `DISCORD_CHANNEL_ID` / `GUILD_APPLICATIONS_DISCORD_CHANNEL_ID`, якщо заявки мають публікуватися в Discord;
- `RULES_STATS` KV binding, якщо потрібна статистика правил і raid-rules;
- `INTERNAL_PROFILE_LOOKUP_TOKEN` і `ADMIN_DASHBOARD_URL` для перевірки профілю/main-персонажа;
- `DISCORD_RULES_STATS_TOKEN`, спільний із dashboard, для захисту stats/message endpoints.

Повна таблиця змінних: [docs/ua/VARIABLES.md](docs/ua/VARIABLES.md).

## Модульний Worker runtime 2026

Entrypoint залишається `src/index.js`, але критична логіка винесена в окремі ES-модулі:

- `src/config.js` — валідація конфігурації та побудова dashboard endpoint-ів.
- `src/security.js` — Discord signature verification, token checks і security headers.
- `src/middleware.js` — CORS/security response helpers.
- `src/discord-utils.js` — Discord REST client з KV-backed route cooldowns.
- `src/firebase-utils.js` — Firebase OAuth/Firestore helpers з KV token cache.
- `src/raid-announcements.js` — raid custom_id decoding, idempotency і dashboard proxy helpers.
- `src/raid-lifecycle.js` — scheduled lifecycle trigger для dashboard `/api/raids/lifecycle`.
- `src/rules-interactions.js` — cooldown helpers для rules interactions.
- `src/applications.js` — helper для application sequence high-water mark.
- `src/kv-utils.js` і `src/logger.js` — спільний state/logging шар.

Створи окремий KV namespace для стану Worker:

```bash
wrangler kv namespace create WORKER_STATE
```

Після цього додай namespace id у `wrangler.toml`. `WORKER_STATE` зберігає короткоживучі cooldowns, idempotency results, Firebase OAuth token cache і application sequence high-water mark. `RULES_STATS` лишається для лічильників правил і може бути fallback під час міграції.

`DASHBOARD_URL` — канонічний base URL dashboard. Змінні `DASHBOARD_PROFILE_LOOKUP_ENDPOINT`, `DASHBOARD_RAID_ACTION_ENDPOINT` і `DASHBOARD_RAID_LIFECYCLE_ENDPOINT` тепер опційні override-и; якщо вони порожні, Worker будує endpoint-и від `DASHBOARD_URL`.

Нумерація заявок тепер використовує Firestore transaction counter у `dashboardCounters/applicationNumbers`. KV лишається тільки high-water fallback; створення Firestore-документа все ще повторює спробу при конфлікті для сумісності з існуючими даними.
