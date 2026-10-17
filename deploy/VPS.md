# VPS · 4.5.1

Діагностика й виправлення відкату: [DEPLOY_READINESS_HOTFIX_2026-10-16_UA.md](../DEPLOY_READINESS_HOTFIX_2026-10-16_UA.md).

Поточне встановлення: [RAID_HISTORY_SYNC_2026-10-16_UA.md](../RAID_HISTORY_SYNC_2026-10-16_UA.md). Dashboard 3.13.0 → Site 4.3.0.

Поточне виправлення заявок і відновлення мережі: [CONNECTION_RECOVERY_2026-10-16_UA.md](../CONNECTION_RECOVERY_2026-10-16_UA.md).

Попередній парний реліз: [SITE_DASHBOARD_SYNC_2026-10-16_UA.md](../SITE_DASHBOARD_SYNC_2026-10-16_UA.md).

Попередні команди оновлення обох проєктів наведені в [інструкції переходу](../UNIFIED_INTEGRATION_2026-10-16_UA.md). Старі інструкції з ручним дописуванням server-блоків у dashboard.conf замінені окремим файлом public-site.conf із релізу дашборда 3.9.1.

Сайт працює в `/srv/lihvodruida-site`, окремий Compose-проєкт `lihvodruida-site`, порт `127.0.0.1:3001`, зовнішня мережа `mistblossom_edge`. Дашборд працює в `/srv/mistblossom`.

Сертифікат публічного сайту повинен містити `lihvodruida.pp.ua` і `www.lihvodruida.pp.ua` та лежати у спільному letsencrypt volume: `/etc/letsencrypt/live/lihvodruida.pp.ua/`. Сертифікат дашборда залишається окремим. Перевірити сертифікати до пересоздання Nginx.

`deploy/nginx.conf.example` — копія відповідних server-блоків для довідки. У парному розгортанні фактично монтується `/srv/mistblossom/deploy/nginx/public-site.conf`; не підключати обидва варіанти одночасно.
