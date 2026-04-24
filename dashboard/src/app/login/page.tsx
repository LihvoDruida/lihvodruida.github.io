import { isAuthenticated } from "@/src/lib/auth";
import { redirect } from "next/navigation";

function errorMessage(code?: string) {
  switch (code) {
    case "not_allowed": return "Акаунта немає в ADMIN_ALLOWLIST.";
    case "oauth_state": return "OAuth state не пройшов перевірку. Спробуй ще раз.";
    case "github": return "GitHub авторизація не вдалася.";
    case "discord": return "Discord авторизація не вдалася.";
    case "token": return "Невірний admin token.";
    default: return "Не вдалося увійти.";
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/");
  const params = await searchParams;
  const hasGitHub = !!process.env.GITHUB_OAUTH_CLIENT_ID;
  const hasDiscord = !!process.env.DISCORD_OAUTH_CLIENT_ID;
  const hasTokenFallback = !!(process.env.ADMIN_DASHBOARD_TOKEN || process.env.ADMIN_PASSWORD);

  return (
    <main className="login panel">
      <div className="eyebrow">Mistblossom Vanguard</div>
      <h1>Вхід у dashboard</h1>
      <p className="lead">Увійди через GitHub або Discord. Доступ отримують тільки акаунти з ADMIN_ALLOWLIST.</p>
      {params.error ? <p className="error">{errorMessage(params.error)}</p> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {hasGitHub ? <a className="btn" href="/api/auth/github/start" style={{ background: "#24292f", textAlign: "center" }}>Увійти через GitHub</a> : null}
        {hasDiscord ? <a className="btn" href="/api/auth/discord/start" style={{ background: "var(--brand)", textAlign: "center" }}>Увійти через Discord</a> : null}
      </div>

      {hasTokenFallback ? (
        <form method="post" action="/api/auth/login" style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <input className="input" name="token" type="password" placeholder="Emergency admin token" autoComplete="current-password" required />
          <button className="btn" type="submit">Увійти через token</button>
        </form>
      ) : null}
    </main>
  );
}
