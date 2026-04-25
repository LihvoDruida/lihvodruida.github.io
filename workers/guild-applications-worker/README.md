# Guild Applications Worker

Cloudflare Worker for Mistblossom Vanguard applications and Discord interaction buttons.

## Routes

- `GET /` and `GET /api/guild-applications` — list GitHub-backed applications.
- `POST /api/guild-applications` — create a new application, GitHub Issue and Discord notification.
- `POST /api/discord-interactions` — single Discord interaction endpoint for all button actions.

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
