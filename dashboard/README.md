# Mistblossom Applications Dashboard

Secure Next.js dashboard for guild applications, Discord role based moderation and content publishing.

## Deployment

Deploy this folder as a separate Vercel project:

```text
Root Directory: dashboard
Framework: Next.js
Output Directory: empty
```

Recommended production route:

```text
Cloudflare proxied admin hostname -> Vercel project -> Discord OAuth role check
```

## Required ENV

```env
GITHUB_OWNER=LihvoDruida
GITHUB_REPO=lihvodruida.github.io
GITHUB_TOKEN=github_pat_with_issues_read_write_and_contents_read
GUILD_APPLICATIONS_LABEL=guild-application

SESSION_SECRET=replace-with-random-32-plus-character-secret
SESSION_MAX_AGE_SECONDS=604800

NEXT_PUBLIC_DASHBOARD_URL=https://admin.lihvodruida.pp.ua
DASHBOARD_URL=https://admin.lihvodruida.pp.ua
DASHBOARD_ALLOWED_HOSTS=admin.lihvodruida.pp.ua
SECURITY_REQUIRE_CLOUDFLARE=false
SECURITY_HSTS_HEADER=max-age=15552000; includeSubDomains

DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=
DISCORD_GUILD_ID=
DISCORD_ADMIN_ROLE_IDS=
DISCORD_MODERATOR_ROLE_IDS=

ADMIN_DASHBOARD_TOKEN=

RAIDERIO_ENABLED=true
RAIDERIO_CONCURRENCY=6
```

For production, set `SECURITY_REQUIRE_CLOUDFLARE=true` only after the admin hostname is correctly proxied by Cloudflare. Keep it disabled for local development and normal Vercel previews.

## Access

Access is controlled only through Discord role IDs stored in Vercel Environment Variables.

- Admin roles: full access and content publishing.
- Moderator roles: can accept or decline applications.
- Viewer roles are not enabled by default.

The dashboard cannot edit access rules and never writes role configuration to GitHub.

## Public content preview domain

The admin panel resolves already published content previews and existing cover images through the public site domain.

Default:

```env
NEXT_PUBLIC_SITE_BASE_URL=https://lihvodruida.pp.ua
SITE_BASE_URL=https://lihvodruida.pp.ua
```

Use this when the dashboard runs on a separate admin domain, but images and published pages live on the main static site.

## Security notes

See `SECURITY_CLOUDFLARE_VERCEL.md` for Cloudflare WAF, cache bypass, HSTS, host allowlist and Vercel environment recommendations.
