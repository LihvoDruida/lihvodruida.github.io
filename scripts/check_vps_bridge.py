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

print(f"[check-vps-bridge] OK — {len(checks)}/{len(checks)} bridge invariants checked.")
