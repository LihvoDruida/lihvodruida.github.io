# Site 4.7.0 — сумісність із Dashboard 3.18+ (без стрімерів)

Парний Dashboard — 3.25.0. Bot 3.6.9 не змінено.

## Навіщо

Dashboard 3.18.0 повністю видалив модуль стрімерів: маршрут `/api/site/streamers` і capability `streamers:read:v1` (див. `docs/MEDIA_REMOVAL_2026-11-10_UA.md` у репозиторії дашборда, крок 7). Site 4.6.x і далі їх вимагав, тому з Dashboard 3.18+:

- `make deploy` зупинявся на передперевірці з `dashboard_capabilities_missing: streamers:read:v1` і відкочував реліз;
- `/site-api/v1/status` повертав `integration: unavailable`, хоча контент, гільдія й заявки працювали;
- кожна сторінка опитувала `/site-api/v1/streamers`, якого дашборд уже не обслуговує.

## Що змінено

- Видалено плашку «Наживо зараз» (`LiveStreams`), її CSS, маршрут `/site-api/v1/streamers`, контракт `streamers-contract.ts` і кеш стрімерів у bridge.
- `/site-api/v1/status`, `scripts/check-integration.mjs`, `scripts/check-deployed.mjs` більше не перевіряють стрімерів.
- Емуляція дашборда в `check-standalone.mjs` відповідає 3.25.0: реальний список capabilities і 404 на видаленому маршруті; регресійна перевірка гарантує, що сайт до нього не звертається.
- Видалено невикористані ресурси Jekyll (JS, CSS, зображення, іконки). `assets/img-content/` залишено: Dashboard дозволяє обкладинки статей із цього шляху.
- CI: окремий job `paired` запускає контрактні тести проти коду `LihvoDruida/lihvodruida-dashboard` і падає, якщо хоч один тест пропущено.

## Встановлення

1. Dashboard має бути 3.18.0 або новішим (рекомендовано 3.25.0). Якщо стрімерів у ньому ще не прибрано, сайт 4.7.0 теж працює: він просто не використовує цей маршрут.
2. У каталозі сайту: `git pull`, далі `make check`, потім `make deploy`. `.env` не змінюється, нових змінних немає.
3. Перевірити: `/`, `/guild`, `/guild/apply`, `/callback`, `/callback.html`, `/guild.html` (переадресація на `/guild`). `docker compose exec -T site node check-deployed.mjs` має показати `PASS` для sync, status, guild та applications.
