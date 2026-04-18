# Подача заявок до гільдії через GitHub Issues

Цей набір додає:
- сторінку `/guild/apply/` з формою заявки;
- список останніх заявок і їхній статус прямо на сайті;
- Cloudflare Worker, який створює GitHub Issues без авторизації користувача в GitHub.

## Що вже готово
- кнопка **Подати заявку** на сторінці гільдії;
- сторінка форми та список статусів;
- Worker для створення і читання заявок;
- автоматичне створення базових labels у репозиторії.

## Що треба зробити вручну
1. Створи fine-grained PAT у GitHub.
   - Дай доступ тільки до репозиторію `lihvodruida.github.io`.
   - Увімкни permission **Issues: Read and write**.

2. У Cloudflare створи Worker.
   - Перейди в Workers & Pages.
   - Створи новий Worker.
   - Завантаж у нього вміст папки `workers/guild-applications-worker`.

3. Додай секрет.
   - `npx wrangler secret put GITHUB_TOKEN`
   - встав свій PAT.

4. Задеплой Worker.
   - `npx wrangler deploy`

5. Прив’яжи route на своєму домені.
   - Маршрут: `https://lihvodruida.pp.ua/api/guild-applications*`
   - Саме на цей шлях уже дивиться сайт.

6. Переконайся, що в `_config.yml` лишився рядок:
   - `guild_applications_api_url: "/api/guild-applications"`

## Як це працює
- користувач відправляє форму на сайті;
- Worker створює GitHub Issue;
- поки issue відкрите, на сайті показується статус **На розгляді**;
- коли issue закрите, на сайті показується **Розгляд завершено**.

## Якщо захочеш додаткові статуси
Можна вручну додавати labels на GitHub, наприклад:
- `status:need-info`
- `status:approved`
- `status:declined`

Базова логіка сайту вже працює навіть без них.
