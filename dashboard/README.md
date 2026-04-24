# Mistblossom Applications Dashboard

Secure Next.js dashboard for guild applications.

## What it does

- Lists GitHub Issues with `guild-application` label.
- Filters by status, class, search text, and sorting mode.
- Accepts / declines applications from a protected dashboard.
- Updates labels directly through GitHub Issues API.
- Closes Issues after moderation.
- Keeps GitHub token server-side only.

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

## Status labels

- `status:review` → На розгляді → `#D4A63A`
- `status:accepted` → Прийнято → `#3BA55D`
- `status:declined` → Відхилено → `#ED4245`
- `guild-application` → main label → `#5865F2`
