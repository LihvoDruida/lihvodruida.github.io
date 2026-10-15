from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
checks = []

def expect(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"[check-vps-bridge] FAIL: {message}")
    checks.append(message)

config = (ROOT / "_config.yml").read_text(encoding="utf-8")
guild = (ROOT / "guild.md").read_text(encoding="utf-8")
apps = (ROOT / "guild-applications.md").read_text(encoding="utf-8")
js = (ROOT / "assets/js/guild-applications.js").read_text(encoding="utf-8")
live = (ROOT / "assets/js/guild-live.js").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/update-data.yml").read_text(encoding="utf-8")
sync = (ROOT / "scripts/update_guild_from_vps.py").read_text(encoding="utf-8")
raid_card = (ROOT / "_includes/raid-card.html").read_text(encoding="utf-8")
raid_fallback = (ROOT / "_data/raids.yml").read_text(encoding="utf-8")
css = (ROOT / "assets/css/guild.css").read_text(encoding="utf-8")
raid_seasons_js = (ROOT / "assets/js/raid-seasons.js").read_text(encoding="utf-8")

expect('https://guild.lihvodruida.pp.ua/api/site/applications' in config, 'applications use VPS API')
expect('https://guild.lihvodruida.pp.ua/api/site/guild' in config, 'guild uses VPS API')
expect('data-guild-api-url="{{ site.guild_live_api_url }}"' in guild, 'guild page carries live endpoint')
expect('guild-live.js' in guild, 'guild page loads live bridge client')
expect('guild-scheduled-raids-json' in guild, 'scheduled raids keep static fallback')
expect("window.setInterval(load, 120000)" in live, 'guild live snapshot refreshes periodically')
expect('id="guild-live-source-badge"' in guild and 'SERVER CONNECTING' in guild, 'guild server badge starts in connecting state')
expect("sourceBadge.dataset.state = state" in live and "SERVER FALLBACK" in live, 'guild server badge reflects real API state')
expect('Failed to fetch' not in js and 'Не вдалося зв’язатися із сервером заявок' in js, 'application form hides raw browser network errors')
expect("document.visibilityState === 'visible'" in live, 'live refresh pauses in hidden tabs')
expect("guild:live-updated" in live, 'live roster notifies roster interactions')
expect("30000" in js and "loadDirectory(true)" in js, 'application statuses refresh silently every 30 seconds')
expect('PostgreSQL source' in apps, 'application directory exposes VPS source')
expect('scripts/update_guild_from_vps.py' in workflow, 'GitHub Actions sync guild fallback from VPS')
expect('mistblossom.public-guild.v1' in sync, 'fallback sync validates public schema')
expect('OUTPUT = Path("_data/guild.yml")' in sync, 'fallback sync writes Jekyll guild data')
expect('"raid_seasons": payload.get("raid_seasons") or {}' in sync, 'fallback sync persists server-owned raid season metadata')
expect('guild_root.raid_seasons' in guild and 'derived_current_season' in guild, 'raid page prefers VPS season detection and only then derived offline fallback')
expect('payload.raid_seasons || null' in live, 'live raid progress consumes normalized VPS season metadata')
expect('Battle.net + Raider.IO' in live and 'Автовизначення сезону' in live, 'live UI explains automatic season detection source')
expect('active_now' in live and 'current_season' in live, 'raid cards use server-provided automatic raid relevance flags')
expect('guild-live-season-tabs' in live and 'data-live-season-panel' in live, 'raid progress is grouped into navigable season panels')
expect('guild-live-progress-grid' in css and 'repeat(2, minmax(0, 1fr))' in css, 'raid progress uses a dense two-column desktop composition')
expect('raid-card.is-current-raid' in css and 'live_catalog' in raid_card, 'static fallback highlights current raids using normalized catalog data')
expect('current_season: midnight-2' in raid_fallback and 'derived_current_season: midnight-2' in raid_fallback, 'offline fallback does not immediately regress to stale Midnight season 1')

expect("return p.total_bosses > 0 && kills > 0" in live, 'live raid progress hides raids without any boss kills')
expect("return item.season.current || seasonHasProgress" not in live and "return seasonHasProgress(item.entries)" in live, 'live season panels are not kept alive only because the API marks them current')
expect("{% if raid_kills > 0 %}" in guild and "raid_kills > 0 or is_current" not in guild, 'static raid fallback only renders raids with real progression')
expect("var PAGE_SIZE = 4" in raid_seasons_js and "MistblossomRaidCarousel" in raid_seasons_js, 'raid progress carousel pages exactly four raids')
expect("is-leaving-left" in raid_seasons_js and "is-entering-right" in raid_seasons_js, 'raid carousel animates directional page changes')
expect("touchstart" in raid_seasons_js and "touchend" in raid_seasons_js, 'raid carousel supports horizontal touch swipes')
expect("raid-carousel-empty" in raid_seasons_js and "PAGE_SIZE - (end - start)" in raid_seasons_js, 'partial carousel pages preserve the four-slot matrix')
expect(".raid-carousel-grid" in css and "grid-template-columns: repeat(2, minmax(0, 1fr))" in css, 'raid carousel keeps a stable two-column desktop grid')
expect(".raid-carousel-empty" in css and "visibility: hidden" in css, 'missing raid slots stay invisible without stretching existing cards')

print(f"[check-vps-bridge] OK — {len(checks)}/{len(checks)} bridge invariants checked.")
