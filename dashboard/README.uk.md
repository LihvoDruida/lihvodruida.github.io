# Mistblossom Vanguard Dashboard

Приватна dashboard-панель для керування гільдією **Mistblossom Vanguard**: заявки, профілі, персонажі Battle.net, рейди, Discord-повідомлення, правила, контент сайту й статуси інтеграцій.

## Що вміє

- Discord login із рольовим доступом: учасник, офіцер, гільдмайстер.
- Профілі учасників із Battle.net персонажами.
- Вибір мейн-персонажа й рейдової ролі.
- Стандартизація серверного Discord nickname у форматі `Ім’я [Мейн, Альт1, Альт2]`.
- Автооновлення даних персонажів перед записом на рейд.
- Рейдові оголошення з Discord-кнопками запису.
- Live-оновлення сторінки рейду без ручного F5.
- Заявки до гільдії через GitHub Issues.
- Динамічні фільтри заявок без повного reload.
- Discord embed/rules editor із live preview, лімітами й mobile/desktop preview.
- Контент-адмінка для новин і гайдів сайту.
- Компактний статус Discord, Battle.net, GitHub і Firebase.

## Технології

- Next.js 15 App Router;
- React 19;
- TypeScript;
- Firebase Admin SDK / Firestore;
- GitHub REST API;
- Discord OAuth + Bot API;
- Battle.net OAuth + WoW Profile API;
- Vercel;
- Cloudflare Worker, якщо interactions винесені з dashboard.

## Швидкий старт

```bash
npm install
cp .env.example .env.local
npm run dev
```

Відкрити:

```text
http://localhost:3000
```

## Production

```bash
npm run build
npm run start
```

Для Vercel достатньо стандартного Next.js deploy. Output directory вручну не задавати.

## Основні env variables

Мінімально для production потрібні:

```env
SESSION_SECRET=
DASHBOARD_URL=https://admin.lihvodruida.pp.ua
NEXT_PUBLIC_DASHBOARD_URL=https://admin.lihvodruida.pp.ua
DASHBOARD_ALLOWED_HOSTS=admin.lihvodruida.pp.ua

DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=
DISCORD_GUILD_ID=
DISCORD_ADMIN_ROLE_IDS=
DISCORD_MODERATOR_ROLE_IDS=
DISCORD_BOT_TOKEN=

GITHUB_OWNER=LihvoDruida
GITHUB_REPO=lihvodruida.github.io
GITHUB_TOKEN=
GUILD_APPLICATIONS_LABEL=guild-application

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

BATTLENET_CLIENT_ID=
BATTLENET_CLIENT_SECRET=
BATTLENET_ENABLED_REGIONS=eu
WOW_GUILD_NAME=Mistblossom Vanguard

RAID_RULES_URL=
RAID_TIME_ZONE=Europe/Kyiv
NEXT_PUBLIC_RAID_TIME_ZONE=Europe/Kyiv
```

Повний список є у документації.

## Документація

- [Опис функціоналу](docs/ua/FUNCTIONALITY.md)
- [API документація](docs/ua/API.md)
- [Змінні середовища](docs/ua/ENVIRONMENT_VARIABLES.md)
- [Інструкція розгортання](docs/ua/DEPLOYMENT.md)
- [English README](README.md)

## Ролі доступу

- **Учасник:** профіль, персонажі, рейди, запис, правила.
- **Офіцер:** заявки, профілі, рейди, склади, модерація, Discord embed.
- **Гільдмайстер:** повний доступ, правила, контент, системні статуси.

## Важливі нюанси

- Бот не може змінити nickname власнику сервера Discord.
- Для зміни nickname роль бота має бути вище ролі користувача.
- Якщо Discord interactions обробляє Worker, Interaction Endpoint у Discord Developer Portal має вести на Worker.
- Якщо Worker викликає dashboard, shared tokens мають збігатися.
- `FIREBASE_PRIVATE_KEY` у Vercel краще зберігати з escaped `\n`.

## Склад гільдії `/guild`

Сторінка `/guild` доступна всім авторизованим ролям dashboard: учасникам, офіцерам і гільдмайстру.
Вона показує живий склад гільдії з Battle.net Guild Roster API та Raider.IO: RIO `ALL`, `DPS`, `HEALER`, `TANK`, item level, клас, спек, роль, фракцію та посилання Raider.IO.

Дані більше не залежать від `scripts/update_guild.py` або згенерованих файлів. Dashboard сам отримує склад через серверну інтеграцію, кешує результат у Firebase, а якщо Firebase не налаштований — використовує короткий in-memory cache поточного runtime.

Основні змінні:

```env
GUILD_ROSTER_REGION=eu
GUILD_ROSTER_REALM=terokkar
GUILD_ROSTER_NAME=Mistblossom Vanguard
GUILD_ROSTER_CACHE_TTL_SECONDS=1800
GUILD_ROSTER_REFRESH_CONCURRENCY=6
GUILD_ROSTER_MEMBER_LIMIT=500
RAIDERIO_ACCESS_KEY=
```

`BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` або `BATTLENET_CLIENT_ID` / `BATTLENET_CLIENT_SECRET` потрібні для Battle.net application token. Кнопка “Оновити склад” викликає `/api/guild/refresh` і примусово перезбирає кеш з Battle.net + Raider.IO.
