import { isAuthenticated } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";
import { redirect } from "next/navigation";

function errorText(error?: string) {
  if (!error) return null;

  const map: Record<string, string> = {
    access_denied: "У тебе немає Discord ролі для доступу до dashboard.",
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
    <main className="login-page">
      <section className="login-shell">
        <div className="login-visual">
          <div className="login-orb login-orb--one" />
          <div className="login-orb login-orb--two" />
          <img className="login-guild-icon" src={guild.iconUrl} alt="" />
          <p className="login-kicker">Mistblossom Vanguard</p>
          <h1>Вхід у dashboard</h1>
          <p>
            Авторизуйся через Discord. Роль у dashboard визначається автоматично
            за ролями твого Discord сервера.
          </p>
        </div>

        <div className="login-card">
          <div className="login-brand">
            <img src={guild.iconUrl} alt="" />
            <div>
              <strong>{guild.name}</strong>
              <span>Secure moderation panel</span>
            </div>
          </div>

          {error ? <div className="login-alert">{error}</div> : null}

          {hasDiscord ? (
            <a className="login-discord-button" href="/api/auth/discord/start">
              Увійти через Discord
            </a>
          ) : (
            <div className="login-alert">
              Discord OAuth не налаштовано. Додай DISCORD_OAUTH_CLIENT_ID та DISCORD_OAUTH_CLIENT_SECRET.
            </div>
          )}

          {hasTokenFallback ? (
            <form className="login-token-form" method="post" action="/api/auth/login">
              <label htmlFor="token">Emergency token</label>
              <div>
                <input id="token" name="token" type="password" placeholder="ADMIN_DASHBOARD_TOKEN" />
                <button type="submit">Увійти</button>
              </div>
            </form>
          ) : null}

          <p className="login-note">
            Доступ мають тільки ролі з DISCORD_ADMIN_ROLE_IDS або DISCORD_MODERATOR_ROLE_IDS.
          </p>
        </div>
      </section>
    </main>
  );
}
