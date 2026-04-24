# Mistblossom Applications Dashboard

Secure Next.js dashboard for guild applications.

## Deployment

Deploy this folder as a separate Vercel project:

```text
Root Directory: dashboard
Framework: Next.js
Output Directory: empty
```

## Required ENV

```env
GITHUB_OWNER=LihvoDruida
GITHUB_REPO=lihvodruida.github.io
GITHUB_TOKEN=github_pat_with_issues_read_write_and_contents_read
GUILD_APPLICATIONS_LABEL=guild-application

SESSION_SECRET=replace-with-random-32-plus-character-secret

NEXT_PUBLIC_DASHBOARD_URL=https://admin.lihvodruida.pp.ua
DASHBOARD_URL=https://admin.lihvodruida.pp.ua

DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=
DISCORD_GUILD_ID=
DISCORD_ADMIN_ROLE_IDS=
DISCORD_MODERATOR_ROLE_IDS=

ADMIN_DASHBOARD_TOKEN=

RAIDERIO_ENABLED=true
RAIDERIO_CONCURRENCY=6
```

## Access

Access is controlled only through Discord role IDs stored in Vercel Environment Variables.

- Admin roles: full access.
- Moderator roles: can accept or decline applications.
- Viewer roles: read-only access.

The dashboard cannot edit access rules and never writes role configuration to GitHub.
