# Змінні середовища

Цей файл генерується з `docs/shared/environment-variables.json`. Не редагуй таблицю вручну.

| Назва | Обовʼязкова | Область | Опис |
|---|---:|---|---|
| `DASHBOARD_URL` | так | Worker | Канонічний base URL адмін-панелі. Worker будує dashboard API endpoints від цього значення. |
| `ADMIN_DASHBOARD_URL` | ні | Worker | Опційний alias для міграції посилань панелі; пріоритет має DASHBOARD_URL. |
| `INTERNAL_PROFILE_LOOKUP_TOKEN` | так | Worker + Dashboard | Server-to-server токен для викликів захищених endpoint-ів dashboard з Worker. |
| `DISCORD_PUBLIC_KEY` | так | Worker | Публічний ключ Discord application для Ed25519-перевірки interactions. Timestamp skew обмежується DISCORD_SIGNATURE_MAX_SKEW_SECONDS. |
| `DISCORD_BOT_TOKEN` | так | Worker | Bot token для Discord REST. Зберігати тільки як Wrangler secret. |
| `WORKER_STATE` | так | KV binding | KV namespace binding для cooldowns, idempotency, кешу Firebase auth token і application sequence high-water mark. |
| `RULES_STATS` | ні | KV binding | KV namespace для рішень по правилах і підписів рейдових правил. Worker може використовувати його як fallback state KV. |
| `RAID_LIFECYCLE_SECRET` | так | Worker + Dashboard | Спільний секрет для scheduled викликів /api/raids/lifecycle. |
| `RAID_DISCORD_DELETE_AFTER_START_HOURS` | ні | Dashboard | Discord-оголошення рейду можна видаляти через стільки годин після старту, але тільки якщо рейд уже закритий. Очікуване значення: 4. |
| `RAID_DISCORD_DELETE_AFTER_CLOSE_MINUTES` | ні | Dashboard | Додатковий буфер у хвилинах після закриття рейду перед cleanup Discord-повідомлення. |
| `DISCORD_SIGNATURE_MAX_SKEW_SECONDS` | ні | Worker | Максимально допустиме відхилення timestamp Discord interaction signature. Типово: 120 секунд. |
