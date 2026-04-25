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
      </div>

      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-hero">
          <div className="login-brandmark">
            <img src={guild.iconUrl} alt="" width={64} height={64} loading="eager" referrerPolicy="no-referrer" />
            <span aria-hidden="true" />
          </div>

          <p className="login-eyebrow">Mistblossom Vanguard</p>
          <h1 id="login-title">Панель керування заявками</h1>
          <p className="login-lead">
            Авторизація через Discord відкриває доступ до модерації, Raider.IO перевірки,
            статусів заявок і редактора контенту без зайвих кроків.
          </p>

          <div className="login-feature-list" aria-label="Можливості панелі">
            <span>Discord ролі</span>
            <span>GitHub Issues</span>
            <span>Raider.IO</span>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card__head">
            <span className="login-card__rune" aria-hidden="true">✦</span>
            <div>
              <strong>Безпечний вхід</strong>
              <small>Доступ тільки для дозволених ролей сервера</small>
            </div>
          </div>

          {error ? <div className="login-alert" role="alert">{error}</div> : null}

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
                <small>Ролі перевіряються автоматично</small>
              </span>
              <span className="login-discord-button__arrow" aria-hidden="true">→</span>
            </a>
          ) : (
            <div className="login-alert" role="alert">
              Discord OAuth не налаштовано. Додай DISCORD_OAUTH_CLIENT_ID та DISCORD_OAUTH_CLIENT_SECRET.
            </div>
          )}

          {hasTokenFallback ? (
            <details className="login-token">
              <summary>Emergency token</summary>
              <form method="post" action="/api/auth/login">
                <label htmlFor="token">Резервний пароль адміністратора</label>
                <div className="login-token__row">
                  <input id="token" name="token" type="password" placeholder="ADMIN_DASHBOARD_TOKEN" autoComplete="current-password" />
                  <button type="submit">Увійти</button>
                </div>
              </form>
            </details>
          ) : null}

          <p className="login-note">
            GitHub token, Discord bot token і службові ключі не потрапляють у браузер.
          </p>
        </div>
      </section>
    </main>
  );
}
