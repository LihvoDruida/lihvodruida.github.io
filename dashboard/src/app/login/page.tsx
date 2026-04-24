import { isAuthenticated } from "@/src/lib/auth";
import { redirect } from "next/navigation";

function errorMessage(code?: string) {
  switch (code) {
    case "not_allowed": return "Твій Discord акаунт не має ролі доступу до dashboard.";
    case "oauth_state": return "OAuth state не пройшов перевірку. Спробуй ще раз.";
    case "github": return "GitHub авторизація зараз не використовується для ролей dashboard.";
    case "discord": return "Discord авторизація не вдалася або не вдалося прочитати ролі сервера.";
    case "token": return "Невірний emergency admin token.";
    default: return "Не вдалося увійти.";
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/");
  const params = await searchParams;
  const hasDiscord = !!process.env.DISCORD_OAUTH_CLIENT_ID;
  const hasTokenFallback = !!(process.env.ADMIN_DASHBOARD_TOKEN || process.env.ADMIN_PASSWORD);

  return (
    <main className="login panel">
      <div className="eyebrow">Mistblossom Vanguard</div>
      <h1>Вхід у dashboard</h1>
      <p className="lead">Увійди через Discord. Роль у dashboard визначається автоматично за ролями твого Discord сервера.</p>
      {params.error ? <p className="error">{errorMessage(params.error)}</p> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {hasDiscord ? <a className="btn" href="/api/auth/discord/start" style={{ background: "var(--brand)", textAlign: "center" }}>Увійти через Discord</a> : null}
      </div>

      {hasTokenFallback ? (
        <form method="post" action="/api/auth/login" style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <input className="input" name="token" type="password" placeholder="Emergency admin token" autoComplete="current-password" required />
          <button className="btn" type="submit">Emergency admin login</button>
        </form>
      ) : null}

      <p className="hint warning" style={{ marginTop: 16 }}>Якщо доступ не проходить — адмін має додати Discord role ID у налаштуваннях dashboard.</p>
    </main>
  );
}
