import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { fetchDiscordRoles, hasDiscordEmbedConfig, type DiscordRoleOption } from "@/lib/discordAdmin";
import {
  dashboardCapabilities,
  dashboardRoleLabel,
  hierarchyTitle,
  matchingDiscordRoleLabels,
  siteStatusDescription,
  siteStatusLabel,
} from "@/lib/permissions";
import {
  canViewProfile,
  getOwnProfilePath,
  getProfileById,
  profileFromSession,
  upsertProfileFromSession,
  type DashboardProfile,
} from "@/lib/profiles";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function providerLabel(provider: string) {
  if (provider === "discord") return "Discord OAuth";
  if (provider === "github") return "GitHub";
  return "Резервний токен";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(date);
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

function profileAsSession(profile: DashboardProfile) {
  return {
    provider: profile.provider,
    id: profile.providerUserId,
    profileId: profile.profileId,
    name: profile.displayName,
    login: profile.login || undefined,
    role: profile.role,
    avatar: profile.avatarUrl || null,
    avatar_url: profile.avatarUrl || null,
    discordRoleIds: profile.discordRoleIds,
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const viewer = await getSession();
  if (!viewer) redirect("/login");

  const { profileId } = await params;
  const ownPath = await getOwnProfilePath(viewer);

  const isOwnProfile = ownPath.endsWith(`/${profileId}`);
  if (!canViewProfile(viewer, profileId) && !(viewer.role === "member" && isOwnProfile)) {
    notFound();
  }
  let profile = await getProfileById(profileId);
  let storageWarning = "";

  if (!profile && isOwnProfile) {
    const result = await upsertProfileFromSession(viewer).catch(() => null);
    profile = result?.profile || { ...profileFromSession(viewer), profileId };
    if (!result?.stored) {
      storageWarning = "Firebase профілі ще не налаштовані або тимчасово недоступні. Показано дані поточної сесії без службових деталей.";
    }
  }

  if (!profile) {
    notFound();
  }

  let roles: DiscordRoleOption[] = [];
  let roleLoadError = "";

  if (hasDiscordEmbedConfig() && (viewer.role === "admin" || viewer.role === "moderator" || isOwnProfile)) {
    try {
      roles = await fetchDiscordRoles();
    } catch (error) {
      roleLoadError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  const profileSession = profileAsSession(profile);
  const discordRoleLabels = matchingDiscordRoleLabels(profileSession, roles);
  const capabilities = dashboardCapabilities(profile.role);
  const enabledCount = capabilities.filter((item) => item.enabled).length;

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-shell" aria-label="Персональна сторінка панелі Mistblossom Vanguard">
        <DashboardIdentity user={viewer} activeSection="profile" />
        <header className="hero panel dashboard-hero profile-hero">
          <div className="hero-copy dashboard-hero__copy profile-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Personal access</div>
            <h1>{isOwnProfile ? "Мій профіль" : "Профіль учасника"}</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Унікальна сторінка профілю з Firebase-сховища, роллю доступу та чітким списком дозволених дій.</p>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>{siteStatusDescription(profile.role)}</span>
            </div>
            {storageWarning ? <div className="login-alert profile-storage-warning" role="status">{storageWarning}</div> : null}
          </div>
        </header>
      </section>

      <section className="profile-grid" aria-label="Дані доступу">
        <article className="panel profile-card profile-card--identity">
          <div className="profile-card-head">
            <span className="eyebrow">Профіль</span>
            <h2>Дані доступу</h2>
          </div>

          <div className="profile-person-card">
            {profile.avatarUrl ? (
              <img
                className="profile-person-card__avatar"
                src={profile.avatarUrl}
                alt=""
                width={64}
                height={64}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="profile-person-card__avatar profile-person-card__avatar--fallback" aria-hidden="true">
                {(profile.displayName || "A").charAt(0)}
              </span>
            )}
            <div className="profile-person-card__body">
              <strong>{profile.displayName}</strong>
              <details className="profile-secret">
                <summary>Показати ID профілю</summary>
                <code>{profile.profileId}</code>
              </details>
            </div>
          </div>

          <dl className="profile-facts">
            <div>
              <dt>Ієрархія</dt>
              <dd>{hierarchyTitle(profile.role)}</dd>
            </div>
            <div>
              <dt>Статус на сайті</dt>
              <dd>{siteStatusLabel(profile.role)}</dd>
            </div>
            <div>
              <dt>Dashboard роль</dt>
              <dd>{dashboardRoleLabel(profile.role)}</dd>
            </div>
            <div>
              <dt>Вхід</dt>
              <dd>{providerLabel(profile.provider)}</dd>
            </div>
            <div>
              <dt>Оновлено</dt>
              <dd>{formatDate(profile.updatedAt || profile.lastLoginAt)}</dd>
            </div>
            <div>
              <dt>Останній вхід</dt>
              <dd>{formatDate(profile.lastLoginAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel profile-card profile-card--roles">
          <div className="profile-card-head">
            <span className="eyebrow">Discord</span>
            <h2>Роль доступу</h2>
          </div>

          <p className="profile-card-lead">Панель звʼязує Discord роль із роллю на сайті за чіткою ієрархією: адмін — гільдмайстер, модератор — офіцер, учасник — лише власний профіль.</p>

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
