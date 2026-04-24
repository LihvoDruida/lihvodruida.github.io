import { isAuthenticated } from "@/src/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/");
  const params = await searchParams;
  return (
    <main className="login panel">
      <div className="eyebrow">Mistblossom Vanguard</div>
      <h1>Вхід у dashboard</h1>
      <p className="lead">Введи admin token. GitHub токени не передаються в браузер.</p>
      {params.error ? <p className="error">Невірний токен доступу.</p> : null}
      <form method="post" action="/api/auth/login" style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <input className="input" name="token" type="password" placeholder="Admin token" autoComplete="current-password" required />
        <button className="btn" type="submit" style={{ background: "var(--brand)" }}>Увійти</button>
      </form>
    </main>
  );
}
