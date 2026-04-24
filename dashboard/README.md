# Mistblossom Applications Dashboard

Secure Next.js dashboard for guild applications.

## What it does

- Lists GitHub Issues with the `guild-application` label.
- Filters by status, class, search text, and sorting mode.
- Shows richer character data directly in the dashboard:
  - character / realm / region / faction / class;
  - source and availability from the issue body;
  - Raider.IO current and previous Mythic+ scores;
  - Raider.IO current and previous raid progression;
  - direct Raider.IO profile link when available.
- Accepts / declines applications from a protected dashboard.
- Updates labels directly through GitHub Issues API.
- Closes Issues after moderation.
- Keeps GitHub token server-side only.

## Role model

The dashboard now separates access by allowlists:

- `ADMIN_ALLOWLIST` — full access, can view and moderate.
- `MODERATOR_ALLOWLIST` — can view and accept/decline applications.
- `VIEWER_ALLOWLIST` — read-only access, cannot accept/decline.

Supported allowlist values:

```env
github:your-github-login
github:12345678
discord:123456789012345678
your@email.com
```

Multiple values are comma-separated.

## Security model

This dashboard is **not** a static GitHub Pages app. It must run on a server platform that supports Next.js server routes/actions, for example Vercel, Cloudflare Pages with Next.js adapter, or a VPS.

Secrets are read only on the server. Copy `.env.example` to `.env.local` for local testing.

Recommended GitHub fine-grained token permissions:

- Issues: Read and write
- Contents: Read

Do **not** expose `GITHUB_TOKEN` to the browser.

## Local run

```bash
cd dashboard
npm install
cp .env.example .env.local
npm run dev
```

Open: `http://localhost:3000`

## Raider.IO

Raider.IO enrichment is enabled by default:

```env
RAIDERIO_ENABLED=true
RAIDERIO_CONCURRENCY=6
```

Set `RAIDERIO_ENABLED=false` if you want faster loading without Raider.IO data.

## Status labels

- `status:review` → На розгляді → `#D4A63A`
- `status:accepted` → Прийнято → `#3BA55D`
- `status:declined` → Відхилено → `#ED4245`
- `guild-application` → main label → `#5865F2`
