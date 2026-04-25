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
- `mbv1:c:a:<roleIdBase36>[.<roleIdBase36>]` — public rules button that opens a private confirmation panel.
- `mbv1:c:d` — public decline button that opens a private confirmation panel.
- `mbv1:a:<roleIdBase36>[.<roleIdBase36>]` — private confirmation button that accepts rules and gives one or more roles.
- `mbv1:d` — private confirmation button that declines rules and kicks the member.

Normal Discord embed posts stay passive: they use the same dashboard/bot setup, but no Worker action is needed unless they include buttons.



## Per-user button behavior

Discord does not support hiding components on a public channel message for only one member. To get per-user behavior, the dashboard now publishes public rule buttons that open an ephemeral confirmation panel. The final accept/decline buttons live in that private panel, and after the user confirms, the Worker updates only that ephemeral panel and removes its buttons for that user.


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

`GET /api/discord-rules-stats?guild_id=<serverId>` reads the exact server stats. If `guild_id` and `DISCORD_GUILD_ID` are both missing, the Worker aggregates all `rules:<guildId>:*` counters from KV. This prevents the dashboard from showing zero when the Worker records stats under the Discord guild ID but the stats request does not pass that ID.
