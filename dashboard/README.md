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
GITHUB_TOKEN=github_pat_with_contents_read_write_and_issues_read_write
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

## GitHub token permissions

For the content panel, the token must be allowed to read and write repository files.

Recommended fine-grained PAT permissions for `GITHUB_TOKEN` or `GITHUB_PAT`:

- Repository access: only `lihvodruida.github.io`
- Contents: Read and write
- Issues: Read and write
- Metadata: Read-only

If GitHub returns `Resource not accessible by personal access token`, the token is not a code problem. It means the PAT was created without access to this repository or without `Contents: Read and write`. Update the Vercel environment variable and redeploy the dashboard.

## Access

Access is controlled only through Discord role IDs stored in Vercel Environment Variables.

- Admin roles: full access.
- Moderator roles: can accept or decline applications.
- Viewer roles: read-only access.

The dashboard cannot edit access rules and never writes role configuration to GitHub.
