# Mistblossom Vanguard Dashboard

Private dashboard panel for the **Mistblossom Vanguard** guild: applications, profiles, Battle.net characters, raids, Discord messages, rules, website content, and integration status.

## Features

- Discord login with role-based access: member, officer, guildmaster.
- Member profiles with Battle.net characters.
- Main character and raid role preference.
- Discord server nickname standardization: `Name [Main, Alt1, Alt2]`.
- Character data auto-refresh before raid signup.
- Raid announcements with Discord signup buttons.
- Live raid page updates without manual refresh.
- Guild applications through GitHub Issues.
- Dynamic application filters without full page reload.
- Discord embed/rules editor with live preview, limits, and mobile/desktop preview.
- Content admin for website news and guides.
- Compact status panel for Discord, Battle.net, GitHub, and Firebase.

## Stack

- Next.js 15 App Router;
- React 19;
- TypeScript;
- Firebase Admin SDK / Firestore;
- GitHub REST API;
- Discord OAuth + Bot API;
- Battle.net OAuth + WoW Profile API;
- Vercel;
- Cloudflare Worker if interactions are moved outside the dashboard.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

## Production

```bash
npm run build
npm run start
```

For Vercel, use the standard Next.js deployment. Do not set a manual output directory.

## Main environment variables

A production deployment usually needs:

```env
SESSION_SECRET=
DASHBOARD_URL=https://admin.lihvodruida.pp.ua
NEXT_PUBLIC_DASHBOARD_URL=https://admin.lihvodruida.pp.ua
DASHBOARD_ALLOWED_HOSTS=admin.lihvodruida.pp.ua

DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=
DISCORD_GUILD_ID=
DISCORD_ADMIN_ROLE_IDS=
DISCORD_MODERATOR_ROLE_IDS=
DISCORD_BOT_TOKEN=

GITHUB_OWNER=LihvoDruida
GITHUB_REPO=lihvodruida.github.io
GITHUB_TOKEN=
GUILD_APPLICATIONS_LABEL=guild-application

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

BATTLENET_CLIENT_ID=
BATTLENET_CLIENT_SECRET=
BATTLENET_ENABLED_REGIONS=eu
WOW_GUILD_NAME=Mistblossom Vanguard

RAID_RULES_URL=
RAID_TIME_ZONE=Europe/Kyiv
NEXT_PUBLIC_RAID_TIME_ZONE=Europe/Kyiv
```

See the full environment documentation for all variables and Worker sharing notes.

## Documentation

- [Functionality overview](docs/en/FUNCTIONALITY.md)
- [API documentation](docs/en/API.md)
- [Environment variables](docs/en/ENVIRONMENT_VARIABLES.md)
- [Deployment guide](docs/en/DEPLOYMENT.md)
- [Український README](README.uk.md)

## Access roles

- **Member:** profile, characters, raids, signup, rules.
- **Officer:** applications, profiles, raids, rosters, moderation, Discord embeds.
- **Guildmaster:** full access, rules, content, system status.

## Important notes

- The bot cannot change the Discord server owner's nickname.
- To change a nickname, the bot role must be higher than the user's highest role.
- If Discord interactions are handled by Worker, the Discord Developer Portal Interaction Endpoint must point to Worker.
- If Worker calls the dashboard, shared tokens must match.
- In Vercel, `FIREBASE_PRIVATE_KEY` is usually stored with escaped `\n`.

## Guild roster `/guild`

The `/guild` page is available to every authenticated dashboard role: member, moderator, and admin.
It displays a live guild roster from the Battle.net Guild Roster API and Raider.IO: `ALL`, `DPS`, `HEALER`, `TANK` RIO, item level, class, spec, role, faction, and Raider.IO profile links.

The dashboard no longer depends on `scripts/update_guild.py` or generated files for this page. Runtime code fetches the roster server-side, stores the result in Firebase cache, and falls back to short in-memory cache when Firebase is not configured.

Main variables:

```env
GUILD_ROSTER_REGION=eu
GUILD_ROSTER_REALM=terokkar
GUILD_ROSTER_NAME=Mistblossom Vanguard
GUILD_ROSTER_CACHE_TTL_SECONDS=1800
GUILD_ROSTER_REFRESH_CONCURRENCY=6
GUILD_ROSTER_MEMBER_LIMIT=500
RAIDERIO_ACCESS_KEY=
```

`BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` or `BATTLENET_CLIENT_ID` / `BATTLENET_CLIENT_SECRET` are required for the Battle.net application token. The “Refresh roster” button calls `/api/guild/refresh` and rebuilds the cache from Battle.net + Raider.IO.
