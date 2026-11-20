import { cpSync, mkdirSync, rmSync } from 'node:fs';

// Purge retired sources even when this release was unpacked over an old checkout.
// Explicit paths only: never delete by wildcard, so new files are never removed silently.
const RETIRED = [
  'src/app/sitemap.ts', 'src/app/api/bridge', 'src/app/api/media',
  'legacy', '_guides', '_news', 'CNAME', 'requirements.txt',
  '.github/workflows/update-data.yml', '_data/guild.yml', '_data/raids.yml',
  'scripts/check_vps_bridge.py', 'scripts/update_characters.py', 'scripts/update_guild.py',
  'scripts/update_guild_from_vps.py', 'scripts/update_mods.py',
];
for (const old of RETIRED) rmSync(old, { recursive: true, force: true });

mkdirSync('public', { recursive: true });
rmSync('public/assets', { recursive: true, force: true });
cpSync('assets', 'public/assets', { recursive: true, filter: p => !p.endsWith('.bak') });
cpSync('favicon.ico', 'public/favicon.ico');
