# VPS · 4.1.0

Актуальні команди оновлення обох проєктів наведені в [інструкції переходу](../UNIFIED_INTEGRATION_2026-10-16_UA.md). Старі інструкції з ручним дописуванням server-блоків у dashboard.conf замінені окремим файлом public-site.conf із релізу дашборда 3.9.0.

Сайт працює в `/srv/lihvodruida-site`, окремий Compose-проєкт `lihvodruida-site`, порт `127.0.0.1:3001`, зовнішня мережа `mistblossom_edge`. Дашборд працює в `/srv/mistblossom`.

Сертифікат публічного сайту повинен містити `lihvodruida.pp.ua` і `www.lihvodruida.pp.ua` та лежати у спільному letsencrypt volume: `/etc/letsencrypt/live/lihvodruida.pp.ua/`. Сертифікат дашборда залишається окремим. Перевірити сертифікати до пересоздання Nginx.

`deploy/nginx.conf.example` — копія відповідних server-блоків для довідки. У парному розгортанні фактично монтується `/srv/mistblossom/deploy/nginx/public-site.conf`; не підключати обидва варіанти одночасно.
