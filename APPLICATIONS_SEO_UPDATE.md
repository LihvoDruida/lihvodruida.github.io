# Applications + SEO update

## Змінено
- Додано `noindex, nofollow, noarchive` та `sitemap: false` для `/guild/apply/` і `/guild/applications/`.
- Оновлено `robots.txt`: закрито сторінки заявок і API заявок від індексації.
- Додано явні OpenGraph/Twitter meta та JSON-LD у базовий layout.
- Переписано UX `/guild/applications/`: пошук, фільтр статусу, фільтр класу, сортування.
- Worker API тепер повертає `status_key`, `class_name`, `character_name`, `realm`, `faction`, `updated_at`.
- Worker підтримує query-параметри `status`, `class`, `q`, `sort`, `direction`, `limit`.
- Розширено ліміт списку заявок до 100.

## Статуси
- `pending` — На розгляді
- `approved` — Прийнято
- `declined` — Відхилено

## Перевірка
- `node --check assets/js/guild-applications.js`
- `node --check workers/guild-applications-worker/src/index.js`

Jekyll build локально не запускався в середовищі, бо `bundle` не встановлений.

## Додаткове виправлення

- Прибрано дубль `REJECTED: "Відхилено"` з Worker.
- Публічна логіка статусів залишає тільки 3 стани: `pending`, `approved`, `declined`.
- `status:rejected` залишено лише як legacy-alias для старих GitHub labels і мапиться в `declined`.
- Додано компактніші стилі фільтрів, стабільніші картки заявок і лічильник відхилених заявок.
- Додано debounce для пошуку, щоб список не перемальовувався на кожен символ без паузи.
