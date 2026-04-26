import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { fetchDiscordRoles, hasDiscordEmbedConfig, type DiscordRoleOption } from "@/lib/discordAdmin";
import {
  dashboardCapabilities,
  hierarchyTitle,
  matchingDiscordRoleLabels,
  siteStatusDescription,
  siteStatusLabel,
} from "@/lib/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function providerLabel(provider: string) {
  if (provider === "discord") return "Discord OAuth";
  if (provider === "github") return "GitHub";
  return "Резервний токен";
}

function CapabilityRow({ title, description, enabled }: { title: string; description: string; enabled: boolean }) {
  return (
    <li className={`profile-capability ${enabled ? "is-enabled" : "is-disabled"}`}>
      <span className="profile-capability__state" aria-hidden="true">{enabled ? "✓" : "—"}</span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </li>
  );
}

export default async function ProfilePage() {
  const user = await getSession();
  if (!user) redirect("/login");

  let roles: DiscordRoleOption[] = [];
  let roleLoadError = "";

  if (hasDiscordEmbedConfig()) {
    try {
      roles = await fetchDiscordRoles();
    } catch (error) {
      roleLoadError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  const discordRoleLabels = matchingDiscordRoleLabels(user, roles);
  const capabilities = dashboardCapabilities(user.role);
  const enabledCount = capabilities.filter((item) => item.enabled).length;

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-shell" aria-label="Персональна сторінка панелі Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="profile" />
        <header className="hero panel dashboard-hero profile-hero">
          <div className="hero-copy dashboard-hero__copy profile-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Personal access</div>
            <h1>Персональна сторінка</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Тут зібрано твій статус у панелі, Discord роль доступу та чіткий список дозволених дій.</p>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>{siteStatusDescription(user.role)}</span>
            </div>
          </div>
        </header>
      </section>

      <section className="profile-grid" aria-label="Дані доступу">
        <article className="panel profile-card profile-card--identity">
          <div className="profile-card-head">
            <span className="eyebrow">Профіль</span>
            <h2>Дані доступу</h2>
          </div>

          <dl className="profile-facts">
            <div>
              <dt>Discord ID</dt>
              <dd>{user.login || user.id}</dd>
            </div>
            <div>
              <dt>Ієрархія</dt>
              <dd>{hierarchyTitle(user.role)}</dd>
            </div>
            <div>
              <dt>Статус на сайті</dt>
              <dd>{siteStatusLabel(user.role)}</dd>
            </div>
            <div>
              <dt>Вхід</dt>
              <dd>{providerLabel(user.provider)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel profile-card profile-card--roles">
          <div className="profile-card-head">
            <span className="eyebrow">Discord</span>
            <h2>Роль доступу</h2>
          </div>

          <p className="profile-card-lead">Панель звʼязує Discord роль із роллю на сайті за чіткою ієрархією: адмін — гільдмайстер, модератор — офіцер.</p>

          <div className="profile-role-stack" aria-label="Discord ролі користувача">
            {discordRoleLabels.length ? discordRoleLabels.map((role) => (
              <span className="profile-role-chip" key={role}>{role}</span>
            )) : <span className="profile-role-chip profile-role-chip--muted">Роль не вдалось визначити з поточної сесії</span>}
          </div>

          {roleLoadError ? <small className="profile-warning">Назви ролей не підтягнулись із Discord API: {roleLoadError}</small> : null}
        </article>

        <article className="panel profile-card profile-card--capabilities">
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Можливості</span>
              <h2>Доступні дії</h2>
            </div>
            <span className="profile-count-pill">{enabledCount}/{capabilities.length}</span>
          </div>

          <ul className="profile-capabilities-list">
            {capabilities.map((capability) => (
              <CapabilityRow
                key={capability.key}
                title={capability.title}
                description={capability.description}
                enabled={capability.enabled}
              />
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
