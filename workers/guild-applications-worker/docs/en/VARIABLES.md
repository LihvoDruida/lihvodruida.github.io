# Environment Variables

This file is generated from `docs/shared/environment-variables.json`. Do not edit the table manually.

| Name | Required | Scope | Description |
|---|---:|---|---|
| `DASHBOARD_URL` | yes | Worker | Canonical admin dashboard base URL. Worker derives dashboard API endpoints from this value. |
| `ADMIN_DASHBOARD_URL` | no | Worker | Optional alias kept for dashboard links during migration; DASHBOARD_URL is preferred. |
| `INTERNAL_PROFILE_LOOKUP_TOKEN` | yes | Worker + Dashboard | Server-to-server token used by the Worker when calling protected dashboard endpoints. |
| `DISCORD_PUBLIC_KEY` | yes | Worker | Discord application public key for Ed25519 interaction verification. Timestamp skew is limited by DISCORD_SIGNATURE_MAX_SKEW_SECONDS. |
| `DISCORD_BOT_TOKEN` | yes | Worker | Bot token for Discord REST calls. Store as Wrangler secret only. |
| `WORKER_STATE` | yes | KV binding | KV namespace binding for cooldowns, idempotency, Firebase auth token cache and application sequence high-water mark. |
| `RULES_STATS` | no | KV binding | KV namespace for rules decisions and raid-rules signups. Worker can use it as fallback state KV. |
| `RAID_LIFECYCLE_SECRET` | yes | Worker + Dashboard | Shared secret for scheduled /api/raids/lifecycle calls. |
| `RAID_DISCORD_DELETE_AFTER_START_HOURS` | no | Dashboard | Discord raid announcement can be deleted this many hours after the raid start time, but only when the raid is already closed. Default/current expected value: 4. |
| `RAID_DISCORD_DELETE_AFTER_CLOSE_MINUTES` | no | Dashboard | Additional buffer in minutes after raid close before Discord message cleanup is allowed. |
| `DISCORD_SIGNATURE_MAX_SKEW_SECONDS` | no | Worker | Maximum accepted Discord interaction signature timestamp skew. Default: 120 seconds. |
