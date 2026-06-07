# Guild Applications Worker

Cloudflare Worker for **Mistblossom Vanguard** guild applications, Firebase Firestore application storage, Discord application moderation buttons, Discord rules buttons, raid-rules signups, raid announcement button proxying, and dashboard-facing statistics.

This Worker is designed to sit between:

- the public guild site that submits applications;
- Firebase Firestore, used as the application database;
- Discord, used for notifications, moderation buttons, rules buttons, role assignment and raid buttons;
- the admin dashboard, used for profile checks, raid actions and statistics;
- Cloudflare KV, used for rules statistics and raid-rules signup records.

## Documentation

- [Functionality overview](docs/en/FUNCTIONALITY.md)
- [API reference](docs/en/API.md)
- [Environment variables and bindings](docs/en/VARIABLES.md)
- [Dashboard shared variables checklist](docs/en/DASHBOARD_SHARED_VARIABLES.md)
- [Deployment guide](docs/en/DEPLOYMENT.md)

Ukrainian documentation is available in [`README.ua.md`](README.ua.md) and [`docs/ua`](docs/ua).

## Main routes

| Route | Method | Purpose |
|---|---:|---|
| `/` | `GET` | List guild applications from Firebase Firestore. |
| `/` | `POST` | Create a guild application. |
| `/api/guild-applications` | `GET` | List guild applications from Firebase Firestore. |
| `/api/guild-applications` | `POST` | Validate and create a Firebase guild application plus Discord notification. |
| `/api/discord-interactions` | `POST` | Discord interaction endpoint for application buttons, rules buttons, raid-rules signup and raid attendance buttons. |
| `/api/discord-rules-stats` | `GET` | Read normal guild rules accept/decline statistics. Can also proxy raid stats with `type=raid`. |
| `/api/discord-raid-rules-stats` | `GET` | Read raid-rules signup statistics. |
| `/api/discord-raid-rules-signups` | `GET` | Read the list of raid-rules signups with profile/main-character data. |
| `/api/discord-raid-message` | `POST` | Create, edit or delete Discord raid announcement messages through the Worker. |
| `/api/discord-guild-channels` | `GET` | Return available Discord text/news channels for dashboard selectors. |
| `/api/raids/lifecycle` | `POST` | Manually queue the idempotent raid lifecycle runner. Requires `RAID_LIFECYCLE_SECRET`. |

## Quick deployment

```bash
cd workers/guild-applications-worker
npm install -g wrangler
wrangler login
wrangler kv namespace create RULES_STATS
```

Paste the KV namespace id into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RULES_STATS"
id = "paste_kv_namespace_id_here"
```

Set production secrets:

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_GUILD_ID
wrangler secret put INTERNAL_PROFILE_LOOKUP_TOKEN
wrangler secret put DISCORD_RULES_STATS_TOKEN
```

If the admin dashboard is protected by Cloudflare Access, also set:

```bash
wrangler secret put CF_ACCESS_CLIENT_ID
wrangler secret put CF_ACCESS_CLIENT_SECRET
```

Deploy:

```bash
wrangler deploy
```

## Required production basics

At minimum, production needs:

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_APPLICATIONS_COLLECTION` for Firestore applications;
- `APPLICATION_NUMBER_DATE_SALT` — stable numeric salt for date-coded application tracking numbers;
- `ALLOWED_ORIGINS` with the public site and admin dashboard origins;
- `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID` for Discord bot/interactions;
- `DISCORD_CHANNEL_ID` / `GUILD_APPLICATIONS_DISCORD_CHANNEL_ID` if application notifications must be posted to Discord;
- `RULES_STATS` KV binding if rules/raid-rules statistics must work;
- `INTERNAL_PROFILE_LOOKUP_TOKEN` and `ADMIN_DASHBOARD_URL` for raid-rules and raid attendance profile checks;
- `DISCORD_RULES_STATS_TOKEN` shared with the dashboard for protected stats/message endpoints.

See the full variable matrix in [docs/en/VARIABLES.md](docs/en/VARIABLES.md).

## 2026 Worker modular runtime

The Worker entrypoint is still `src/index.js`, but critical logic is now split into focused ES modules:

- `src/config.js` — validated runtime configuration and dashboard endpoint derivation.
- `src/security.js` — Discord signature verification, token checks and security headers.
- `src/middleware.js` — CORS/security response helpers.
- `src/discord-utils.js` — Discord REST client with KV-backed route cooldowns.
- `src/firebase-utils.js` — Firebase OAuth/Firestore helpers with KV token cache.
- `src/raid-announcements.js` — raid custom_id decoding, idempotency and dashboard proxy helpers.
- `src/raid-lifecycle.js` — scheduled lifecycle trigger for dashboard `/api/raids/lifecycle`.
- `src/rules-interactions.js` — rules interaction cooldown helpers.
- `src/applications.js` — application sequence high-water mark helper.
- `src/kv-utils.js` and `src/logger.js` — shared state/logging primitives.

Create a dedicated KV namespace for Worker state:

```bash
wrangler kv namespace create WORKER_STATE
```

Then add the returned namespace id to `wrangler.toml`. `WORKER_STATE` stores short-lived cooldowns, idempotency results, Firebase OAuth token cache and the application sequence high-water mark. `RULES_STATS` remains supported for rules counters and can be used as fallback while migrating.

`DASHBOARD_URL` is the canonical dashboard base URL. Endpoint-specific variables such as `DASHBOARD_PROFILE_LOOKUP_ENDPOINT`, `DASHBOARD_RAID_ACTION_ENDPOINT` and `DASHBOARD_RAID_LIFECYCLE_ENDPOINT` are optional overrides; when omitted, the Worker derives them from `DASHBOARD_URL`.

Application numbering now uses a Firestore transaction counter at `dashboardCounters/applicationNumbers`. KV is only a high-water fallback; Firestore document creation still retries conflicts to preserve compatibility with existing data.
