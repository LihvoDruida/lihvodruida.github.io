# Automatic orphan account cleanup

## Що робить

Система видаляє dashboard-профілі тільки коли виконані обидві умови:

1. Discord-акаунта немає серед учасників Discord-сервера гільдії.
2. Жоден персонаж цього Discord-акаунта не знайдений у збереженому складі гільдії.

Якщо збережений roster порожній, cleanup блокується і не видаляє профілі.

## Що видаляється

- профілі з `dashboardProfiles`;
- індексні привʼязки персонажів з `dashboardProfileCharacterLinks`;
- записи цього акаунта з `dashboardRaids.signups`;
- Discord embed рейдів оновлюється після видалення записів, якщо рейд має активне Discord-повідомлення.

## Автоматичний запуск

Додано `vercel.json` з daily cron:

```json
{"path":"/api/admin/profiles/orphan-cleanup/apply","schedule":"0 4 * * *"}
```

Для роботи потрібен `CRON_SECRET` або `ACCOUNT_CLEANUP_SECRET`.

## Internal cron endpoint

```http
GET /api/admin/profiles/orphan-cleanup/apply?force=1
Authorization: Bearer <CRON_SECRET або ACCOUNT_CLEANUP_SECRET>
```

Без `apply=1` endpoint працює як dry-run, якщо не задано `ACCOUNT_CLEANUP_AUTO_APPLY=1`.

## Env

- `ACCOUNT_CLEANUP_SECRET` — окремий секрет для cleanup endpoint.
- `ACCOUNT_CLEANUP_AUTO_APPLY=1` — дозволити автоматичне застосування без `apply=1`.
- `ACCOUNT_CLEANUP_MIN_INTERVAL_MS` — cooldown між запусками.
- `ACCOUNT_CLEANUP_PROFILE_LIMIT` — максимум профілів для перевірки.
- `RAID_ACCOUNT_CLEANUP_SCAN_LIMIT` — скільки рейдів сканувати для видалення записів.
- `RAID_ACCOUNT_CLEANUP_DISCORD_SYNC_LIMIT` — максимум Discord-повідомлень рейдів для оновлення за один запуск.
