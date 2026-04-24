import { isAuthenticated } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import { redirect } from "next/navigation";

function errorText(error?: string) {
  if (!error) return null;

  const map: Record<string, string> = {
    access_denied: "У тебе немає Discord ролі для доступу до панелі.",
    discord_oauth: "Discord авторизація не завершилась. Спробуй ще раз.",
    oauth_state: "Сесія авторизації застаріла. Повтори вхід.",
    discord_required: "Вхід доступний тільки через Discord.",
    token: "Emergency token неправильний.",
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
  const hasDiscord = !!process.env.DISCORD_OAUTH_CLIENT_ID;
  const hasTokenFallback = !!process.env.ADMIN_DASHBOARD_TOKEN;

  return (
    <main className="auth-ref">
      <div className="auth-ref__grid" aria-hidden="true" />
      <span className="auth-ref__ring auth-ref__ring--left" aria-hidden="true" />
      <span className="auth-ref__ring auth-ref__ring--right" aria-hidden="true" />
      <span className="auth-ref__petal auth-ref__petal--one" aria-hidden="true" />
      <span className="auth-ref__petal auth-ref__petal--two" aria-hidden="true" />
      <span className="auth-ref__petal auth-ref__petal--three" aria-hidden="true" />

      <section className="auth-ref-card" aria-labelledby="login-title">
        <div className="auth-ref-card__content">
          <div className="auth-ref-logo">
            <img src={guild.iconUrl} alt="" />
            <span aria-hidden="true" />
          </div>

          <p className="auth-ref-kicker">Mistblossom Vanguard</p>

          <h1 id="login-title">
            Вхід до панелі
            <span>керування</span>
          </h1>

          <p className="auth-ref-copy">
            Увійди через Discord, щоб отримати безпечний доступ до модерації заявок.
            Роль і права визначаються автоматично за ролями твого сервера.
          </p>
        </div>

        <div className="auth-ref-card__visual" aria-hidden="true">
          <div className="auth-ref-flower">
            <span className="auth-ref-flower__ring auth-ref-flower__ring--outer" />
            <span className="auth-ref-flower__ring auth-ref-flower__ring--inner" />
            <span className="auth-ref-flower__petal auth-ref-flower__petal--one" />
            <span className="auth-ref-flower__petal auth-ref-flower__petal--two" />
            <span className="auth-ref-flower__petal auth-ref-flower__petal--three" />
            <span className="auth-ref-flower__petal auth-ref-flower__petal--four" />
            <span className="auth-ref-flower__core" />
          </div>
        </div>

        <div className="auth-ref-actions">
          {error ? <div className="auth-ref-alert">{error}</div> : null}

          {hasDiscord ? (
            <a className="auth-ref-discord" href="/api/auth/discord/start">
              <span className="auth-ref-discord__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M20.32 4.37A19.8 19.8 0 0 0 15.36 2.84a.07.07 0 0 0-.08.04c-.21.37-.45.85-.62 1.23a18.27 18.27 0 0 0-5.32 0 12.4 12.4 0 0 0-.63-1.23.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.68 4.37a.07.07 0 0 0-.03.03C.54 9.05-.31 13.57.11 18.03c0 .02.01.05.03.06a19.9 19.9 0 0 0 6.08 3.07.08.08 0 0 0 .08-.03c.47-.64.89-1.31 1.25-2.02a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.9-.9.08.08 0 0 1 0-.13l.37-.29a.08.08 0 0 1 .08-.01c3.96 1.8 8.24 1.8 12.16 0a.08.08 0 0 1 .08.01l.38.29a.08.08 0 0 1 0 .13c-.6.36-1.23.67-1.9.9a.08.08 0 0 0-.04.1c.37.71.78 1.38 1.25 2.02a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6.09-3.07.08.08 0 0 0 .03-.06c.5-5.15-.84-9.64-3.52-13.63a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.19 0-2.17-1.1-2.17-2.45 0-1.35.96-2.45 2.17-2.45 1.22 0 2.18 1.1 2.17 2.45 0 1.35-.96 2.45-2.17 2.45Zm7.96 0c-1.19 0-2.17-1.1-2.17-2.45 0-1.35.96-2.45 2.17-2.45 1.22 0 2.18 1.1 2.17 2.45 0 1.35-.95 2.45-2.17 2.45Z"
                  />
                </svg>
              </span>
              <strong>Увійти через Discord</strong>
              <span className="auth-ref-discord__arrow" aria-hidden="true">→</span>
            </a>
          ) : (
            <div className="auth-ref-alert">
              Discord OAuth не налаштовано. Додай DISCORD_OAUTH_CLIENT_ID та DISCORD_OAUTH_CLIENT_SECRET.
            </div>
          )}

          {hasTokenFallback ? (
            <details className="auth-ref-token">
              <summary>Emergency token</summary>
              <form method="post" action="/api/auth/login">
                <input id="token" name="token" type="password" placeholder="ADMIN_DASHBOARD_TOKEN" />
                <button type="submit">Увійти</button>
              </form>
            </details>
          ) : null}

          <p className="auth-ref-note">
            <span aria-hidden="true">◇</span>
            Доступ надається лише адміністраторам і модераторам Discord-сервера.
          </p>
        </div>
      </section>
    </main>
  );
}
