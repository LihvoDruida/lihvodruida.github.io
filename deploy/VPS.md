# Окремий деплой Лігва Друїда · 4.0.1

Дашборд: `/srv/mistblossom`. Сайт: `/srv/lihvodruida-site`.
Спільний вхід HTTPS — чинний контейнер `mistblossom-nginx-1` у мережі `mistblossom_edge`.

## Перший запуск

Завантаж повний ZIP у `/tmp`, розпакуй його в `/srv` (коренева папка архіву вже `lihvodruida-site`):

```bash
sudo unzip /tmp/lihvodruida-site-v4.0.1-deploy-full.zip -d /srv
sudo chown -R ubuntu:ubuntu /srv/lihvodruida-site
cd /srv/lihvodruida-site
make check
make deploy
```

Якщо make не встановлений: `sudo apt-get install make`. Або без make: `bash deploy/deploy.sh check`, потім `bash deploy/deploy.sh deploy`. Потрібні Docker Compose v2+, Python 3 та flock (util-linux), зазвичай уже наявні в Ubuntu. Docker має бути доступний поточному користувачу.

`make check` створить відсутній `.env` з `.env.example` і перевірить конфігурацію та чинну мережу. Наявний `.env` не переписується; права обмежуються до 600. Значення читає Compose; скрипт не виконує `.env` як shell-код.

Стандартні налаштування:

```dotenv
SITE_URL=https://lihvodruida.pp.ua
DASHBOARD_URL=https://guild.lihvodruida.pp.ua
SITE_EDGE_NETWORK=mistblossom_edge
NEXT_BUILD_CPUS=2
NODE_BUILD_MEMORY_MB=1536
SITE_DEBUG_LOGS=false
```

Після редагування `.env` повтори `make check`, потім `make deploy`.

## Що виконує make deploy

1. Блокує одночасний запуск другого деплою.
2. Перевіряє Docker, JSON-конфігурацію Compose, HTTPS origins, localhost-порт і відсутність сторонніх сервісів у проєкті.
3. Підключає сервіс site до вже наявної мережі через `deploy/compose.vps.yml` з alias `lihvodruida-public-site`.
4. Зберігає окремий rollback-тег образу попереднього контейнера, якщо він healthy.
5. Збирає новий образ; до завершення build поточний контейнер не замінюється.
6. Виконує `up` тільки для site із `--no-deps` та очікує Docker healthcheck до 90 секунд.
7. Якщо запуск або healthcheck не пройшов, намагається повернути попередній healthy-образ. Навіть після успішного повернення завершується з ненульовим кодом, бо новий деплой не відбувся. На першому запуску попередньої версії немає.

Проєкт завжди `lihvodruida-site`. Немає `down`, видалення томів, prune, запуску Compose дашборда чи автоматичного редагування його файлів. Збережені rollback-образи автоматично не видаляються. Деплой із одним контейнером має коротку перерву під час його заміни; це не zero-downtime.

Файли Compose завантажуються в такому порядку: `compose.yml`, наявний `compose.override.yml`, `deploy/compose.vps.yml`. Раніше створений override мережі можна залишити. Передані вручну довільні `-f` та проєкти не підтримуються, щоб не зачепити сусідній стек.

## Перевірки й керування

```bash
cd /srv/lihvodruida-site
make status
make logs
curl --fail http://127.0.0.1:3001/api/health
```

- `make deploy` або `make up`: збірка, запуск, healthcheck, rollback при невдачі.
- `make check`: перевірки, без build/up.
- `make restart`: перезапуск лише site й очікування healthy, без build.
- `make stop`: зупинка лише site, мережі та дані не видаляються.
- `make status` / `make ps`: стан.
- `make logs`: потік логів; Ctrl+C завершує перегляд, а не сайт.

Healthcheck підтверджує доступність Node-сайту. Він не підтверджує роботу зовнішнього дашборда, PostgreSQL або Discord. Після підключення домену окремо перевір `/api/bridge/guild`: `sync.source=archive` означає fallback.

## Одноразове підключення домену

Це робиться один раз у чинному Nginx дашборда. `make deploy` не змінює DNS, сертифікати й конфігурацію `/srv/mistblossom`.

DNS `lihvodruida.pp.ua` та `www` має вести на VPS; старі GitHub Pages записи треба замінити. У прикладах використано Let's Encrypt. Для Cloudflare під час HTTP-01 випуску цих сертифікатів постав нові записи в DNS only; після готовності HTTPS можна увімкнути Proxy та Full (strict). Запис guild лишається у чинній конфігурації.

Створи резервну копію `/srv/mistblossom/deploy/nginx/dashboard.conf`. Додай наприкінці, не замінюючи наявні блоки дашборда:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name lihvodruida.pp.ua www.lihvodruida.pp.ua;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://lihvodruida.pp.ua$request_uri;
    }
}
```

Якщо раніше вже додав цей блок, не додавай вдруге. Застосуй і випусти сертифікат у наявному томі certbot:

```bash
cd /srv/mistblossom
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
docker compose run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --cert-name lihvodruida.pp.ua \
  -d lihvodruida.pp.ua -d www.lihvodruida.pp.ua \
  --email lihvo.druida@gmail.com --agree-tos --non-interactive
```

Лише після успішного випуску додай HTTPS-блок із `deploy/nginx.conf.example` до того самого `dashboard.conf`, якщо ще не додавав. Це вміст для чинного контейнерного Nginx, а не `127.0.0.1:3001`: localhost усередині контейнера — сам Nginx. Proxy використовує alias сайту, а Docker resolver повторно визначає адресу після заміни контейнера.

```bash
cd /srv/mistblossom
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
curl --fail https://lihvodruida.pp.ua/api/health
```

Переконайся, що чинний таймер Certbot поновлює сертифікати у спільному томі та виконує reload Nginx. У кореневому `.env` дашборда PUBLIC_SITE_ORIGINS має включати обидва HTTPS origins сайту.

## Подальше оновлення

Розпакуй новий повний реліз поверх `/srv/lihvodruida-site`, зберігаючи свій `.env` та `compose.override.yml` (їхні робочі екземпляри у ZIP не включені), потім:

```bash
cd /srv/lihvodruida-site
make deploy
```

Nginx та дашборд для звичайного оновлення сайту перезапускати не потрібно. Скрипт не виконує git pull: він розгортає саме файли поточної папки.
