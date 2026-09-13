# Mistblossom VPS bridge

`Main Site` remains a separate Jekyll/GitHub Pages site. It does not connect to PostgreSQL directly.

Public integration endpoints:

- `https://guild.lihvodruida.pp.ua/api/site/applications` — submit and read sanitized guild-application statuses.
- `https://guild.lihvodruida.pp.ua/api/site/guild` — sanitized guild roster, raid progression/rankings and published raid schedule.

Runtime behavior:

- Application statuses refresh every 30 seconds while the tab is visible.
- Guild live data refreshes every 120 seconds while the tab is visible.
- `_data/guild.yml` remains a GitHub Actions fallback and is synchronized from the VPS endpoint.
- Private application fields (Discord, BattleTag, availability text) are not returned by the public dashboard API.

Validation:

```bash
python scripts/check_vps_bridge.py
node --check assets/js/guild-live.js
node --check assets/js/guild-applications.js
```

## Raid seasons and raid relevance

Main Site does not decide the live season from a hard-coded YAML switch. The Dashboard/VPS exports a normalized `raid_seasons` snapshot built from Battle.net Journal expansion data plus Raider.IO season/raid static data. The live client groups progress by that snapshot and uses `_data/raids.yml` only if the VPS snapshot cannot be loaded.

## Raid progress carousel

Main Site raid progress intentionally renders only raid tiers with real progression: at least one boss kill on Normal, Heroic, or Mythic. API catalog entries with `0/0/0` are not shown.

Visible raid cards are paged in groups of four. Desktop keeps a fixed 2x2 matrix; incomplete final pages retain invisible slots so cards never stretch to fill the row. Navigation supports buttons, keyboard arrows, and horizontal touch swipes with directional animation. The same behavior is used for live VPS data and the static Jekyll fallback.
