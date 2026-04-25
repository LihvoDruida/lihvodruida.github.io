import { isAuthenticated } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function errorText(error?: string) {
  if (!error) return null;

  const map: Record<string, string> = {
    access_denied: "У тебе немає Discord ролі для доступу до панелі.",
    discord_oauth: "Discord авторизація не завершилась. Спробуй ще раз.",
    oauth_state: "Сесія авторизації застаріла. Повтори вхід.",
    discord_required: "Вхід доступний тільки через Discord.",
    discord_only: "Вхід через GitHub вимкнено. Використай Discord.",
    token: "Emergency token неправильний.",
    rate_limit: "Забагато спроб входу. Зачекай кілька хвилин.",
  };

  return map[error] || "Не вдалося увійти. Перевір Discord доступ.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthenticated()) redirect("/");

  const guild = await getGuildBranding();
  const params = await searchParams;
  const error = errorText(params.error);
  const hasDiscord = Boolean(process.env.DISCORD_OAUTH_CLIENT_ID);
  const hasTokenFallback = Boolean(process.env.ADMIN_DASHBOARD_TOKEN);

  return (
    <main className="login-screen">
      <div className="login-screen__backdrop" aria-hidden="true">
        <span className="login-glow login-glow--gold" />
        <span className="login-glow login-glow--violet" />
        <span className="login-grid" />
        <span className="login-ornament login-ornament--top" />
        <span className="login-ornament login-ornament--bottom" />
      </div>

      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-hero">
          <div className="login-pill">Guild Control Panel</div>

          <div className="login-brandmark">
            <img
              src={guild.iconUrl}
              alt=""
              width={72}
              height={72}
              loading="eager"
              referrerPolicy="no-referrer"
            />
            <span aria-hidden="true" />
          </div>

          <p className="login-eyebrow">{guild.name}</p>
          <h1 id="login-title">
            WoW Guild
            <span>Admin Dashboard</span>
          </h1>
          <p className="login-lead">
            Стилізована панель керування для гільдії: модерація заявок, робота з
            контентом, Discord доступ і захищений вхід без перевантаженого інтерфейсу.
          </p>

          <div className="login-feature-list" aria-label="Можливості панелі">
            <span>Discord доступ</span>
            <span>Модерація заявок</span>
            <span>Контент і гайди</span>
            <span>Журнал дій</span>
          </div>

          <div className="login-action-row">
            {hasDiscord ? (
              <a className="login-discord-button" href="/api/auth/discord/start">
                <span className="login-discord-button__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path
                      fill="currentColor"
                      d="M20.32 4.37A19.8 19.8 0 0 0 15.36 2.84a.07.07 0 0 0-.08.04c-.21.37-.45.85-.62 1.23a18.27 18.27 0 0 0-5.32 0 12.4 12.4 0 0 0-.63-1.23.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.68 4.37a.07.07 0 0 0-.03.03C.54 9.05-.31 13.57.11 18.03c0 .02.01.05.03.06a19.9 19.9 0 0 0 6.08 3.07.08.08 0 0 0 .08-.03c.47-.64.89-1.31 1.25-2.02a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.9-.9.08.08 0 0 1 0-.13l.37-.29a.08.08 0 0 1 .08-.01c3.96 1.8 8.24 1.8 12.16 0a.08.08 0 0 1 .08.01l.38.29a.08.08 0 0 1 0 .13c-.6.36-1.23.67-1.9.9a.08.08 0 0 0-.04.1c.37.71.78 1.38 1.25 2.02a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6.09-3.07.08.08 0 0 0 .03-.06c.5-5.15-.84-9.64-3.52-13.63a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.19 0-2.17-1.1-2.17-2.45 0-1.35.96-2.45 2.17-2.45 1.22 0 2.18 1.1 2.17 2.45 0 1.35-.96 2.45-2.17 2.45Zm7.96 0c-1.19 0-2.17-1.1-2.17-2.45 0-1.35.96-2.45 2.17-2.45 1.22 0 2.18 1.1 2.17 2.45 0 1.35-.95 2.45-2.17 2.45Z"
                    />
                  </svg>
                </span>
                <span>
                  <strong>Увійти через Discord</strong>
                  <small>Безпечний доступ для дозволених ролей</small>
                </span>
                <span className="login-discord-button__arrow" aria-hidden="true">
                  →
                </span>
              </a>
            ) : (
              <div className="login-alert" role="alert">
                Discord OAuth не налаштовано. Додай DISCORD_OAUTH_CLIENT_ID та
                DISCORD_OAUTH_CLIENT_SECRET.
              </div>
            )}

            <a className="login-secondary-button" href="#access-details">
              Огляд доступу
            </a>
          </div>
        </div>

        <div className="login-card" id="access-details">
          <div className="login-card__head">
            <span className="login-card__rune" aria-hidden="true">
              ✦
            </span>
            <div>
              <strong>Доступ до гільдійної панелі</strong>
              <small>World of Warcraft-стилістика без зайвих дій і дублювання</small>
            </div>
          </div>

          {error ? (
            <div className="login-alert" role="alert">
              {error}
            </div>
          ) : null}

          <div className="login-access-grid" aria-label="Що доступно після входу">
            <article className="login-access-item">
              <strong>Модерація заявок</strong>
              <p>Перевірка кандидатів, зміна статусів, нотатки й синхронізація.</p>
            </article>
            <article className="login-access-item">
              <strong>Редактор контенту</strong>
              <p>Новини, гайди та медіа з чистою, швидкою і безпечною формою.</p>
            </article>
            <article className="login-access-item">
              <strong>Discord безпека</strong>
              <p>Доступ тільки для дозволених ролей сервера та довірених сесій.</p>
            </article>
          </div>

          <div className="login-rule-list">
            <div className="login-rule-item">
              <span>01</span>
              <p>Авторизація проходить через Discord і не відкриває службові ключі у браузері.</p>
            </div>
            <div className="login-rule-item">
              <span>02</span>
              <p>Інтерфейс адаптований під телефони: без конфліктних анімацій та миготіння.</p>
            </div>
            <div className="login-rule-item">
              <span>03</span>
              <p>Після входу відкривається одна панель без дублювання головних дій.</p>
            </div>
          </div>

          {hasTokenFallback ? (
            <details className="login-token">
              <summary>Emergency token</summary>
              <form method="post" action="/api/auth/login">
                <label htmlFor="token">Резервний пароль адміністратора</label>
                <div className="login-token__row">
                  <input
                    id="token"
                    name="token"
                    type="password"
                    placeholder="ADMIN_DASHBOARD_TOKEN"
                    autoComplete="current-password"
                  />
                  <button type="submit">Увійти</button>
                </div>
              </form>
            </details>
          ) : null}

          <p className="login-note">
            Якщо роль не видана або OAuth не завершився, панель не відкриється навіть при прямому переході.
          </p>
        </div>
      </section>
    </main>
  );
}
