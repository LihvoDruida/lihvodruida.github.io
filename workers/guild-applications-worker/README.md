# Guild Applications Worker

Cloudflare Worker for Mistblossom Vanguard applications and Discord interaction buttons.

## Routes

- `GET /` and `GET /api/guild-applications` — list GitHub-backed applications.
- `POST /api/guild-applications` — create a new application, GitHub Issue and Discord notification.
- `POST /api/discord-interactions` — single Discord interaction endpoint for all button actions.
- `GET /api/discord-rules-stats` — dashboard stats for rule accepts/declines.

## Supported Discord actions

- `guild_application:accepted:<issueNumber>` — accept application, close GitHub Issue, update Discord message.
- `guild_application:declined:<issueNumber>` — decline application, close GitHub Issue, update Discord message.
- `mbv1:a:<roleIdBase36>[.<roleIdBase36>]` — accept rules and give one or more roles.
- `mbv1:d` — decline rules and kick the member.

Normal Discord embed posts stay passive: they use the same dashboard/bot setup, but no Worker action is needed unless they include buttons.

## Required secrets / vars

Use `wrangler secret put` for secrets:

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_GUILD_ID
```

`DISCORD_ALLOWED_ROLES` is optional and controls who can accept/decline applications. Rules buttons are intended for regular members and do not require moderator roles.

The bot needs `Send Messages`, `Embed Links`, `Read Message History`, `Manage Roles`, and `Kick Members`. The bot role must be higher than roles it assigns.

## Rules stats

The Worker can count unique rule decisions with Cloudflare KV. Create and bind the namespace:

```bash
wrangler kv namespace create RULES_STATS
```

Then add the returned binding to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RULES_STATS"
id = "paste_kv_namespace_id_here"
```

Stats are stored per guild and per user. If the same user clicks again, the counter is not duplicated; if their decision changes, the previous counter is adjusted. Discord cannot hide buttons only for one user on a public message, so the Worker returns an ephemeral confirmation to the clicker and keeps the public buttons available for other members.
