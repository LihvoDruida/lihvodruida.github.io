import { getSessionUser, isAdmin, isAuthenticated } from "@/src/lib/auth";
import { configFromFormData, getAccessConfig, saveAccessConfig } from "@/src/lib/access";
import { redirect } from "next/navigation";

function idsText(ids: string[]) {
  return ids.join(",");
}

async function saveRoles(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!isAdmin(user)) return;
  const config = configFromFormData(formData);
  await saveAccessConfig(config, user?.name || user?.login || "Dashboard admin");
}

export default async function SettingsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect("/");
  const config = await getAccessConfig();

  return (
    <main className="container">
      <header className="hero panel compact-hero">
        <div className="hero-copy">
          <div className="eyebrow">Mistblossom Vanguard • Access settings</div>
          <h1>Налаштування доступу</h1>
          <p className="lead">Доступ до dashboard тепер керується Discord ролями. ADMIN_ALLOWLIST / MODERATOR_ALLOWLIST / VIEWER_ALLOWLIST більше не використовуються.</p>
        </div>
        <a className="btn ghost nav-link" href="/">← До заявок</a>
      </header>

      <section className="panel settings-panel">
        <form action={saveRoles} className="settings-form">
          <label>
            <span>Discord Guild ID</span>
            <input className="input" name="guildId" defaultValue={config.guildId} placeholder="ID сервера Discord" required />
          </label>
          <label>
            <span>Admin role IDs</span>
            <textarea className="input textarea" name="adminRoleIds" defaultValue={idsText(config.adminRoleIds)} placeholder="123,456" required />
            <small>Адміни мають повний доступ і можуть змінювати ці налаштування.</small>
          </label>
          <label>
            <span>Moderator role IDs</span>
            <textarea className="input textarea" name="moderatorRoleIds" defaultValue={idsText(config.moderatorRoleIds)} placeholder="123,456" />
            <small>Модератори можуть приймати або відхиляти заявки.</small>
          </label>
          <label>
            <span>Viewer role IDs</span>
            <textarea className="input textarea" name="viewerRoleIds" defaultValue={idsText(config.viewerRoleIds)} placeholder="123,456" />
            <small>Viewer може тільки переглядати dashboard без рішень по заявках.</small>
          </label>
          <button className="btn primary" type="submit">Зберегти ролі доступу</button>
        </form>
      </section>

      <section className="panel notice settings-note">
        <strong>Як взяти Role ID:</strong> Discord → Settings → Advanced → Developer Mode → правий клік по ролі → Copy Role ID.
        <br />Перший запуск можна зробити через ENV <code>DISCORD_ADMIN_ROLE_IDS</code>, після цього адмін може керувати ролями з цієї сторінки.
      </section>
    </main>
  );
}
