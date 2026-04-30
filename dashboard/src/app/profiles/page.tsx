import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { canViewProfiles, dashboardRoleLabel } from "@/lib/permissions";
import { getMainCharacter, getOwnProfilePath, listDashboardProfiles, type DashboardProfile } from "@/lib/profiles";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function ProfileCard({ profile }: { profile: DashboardProfile }) {
  const main = getMainCharacter(profile);
  const avatar = profile.avatarUrl || main?.avatarUrl || main?.renderUrl || null;

  return (
    <article className="panel profile-directory-card">
      <div className="profile-directory-card__main">
        {avatar ? (
          <img className="profile-directory-card__avatar" src={avatar} alt="" width={56} height={56} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="profile-directory-card__avatar profile-directory-card__avatar--fallback" aria-hidden="true">
            {(profile.displayName || "?").charAt(0)}
          </span>
        )}
        <div>
          <h2>{profile.displayName}</h2>
          <p>{dashboardRoleLabel(profile.role)}{main ? ` • ${main.name}${main.realmName ? `, ${main.realmName}` : ""}` : " • мейн не вибрано"}</p>
        </div>
      </div>

      <div className="profile-directory-card__stats" aria-label="Короткі дані профілю">
        <span><strong>{profile.characters.length}</strong><small>персонажів</small></span>
        <span><strong>{profile.battlenet?.linked ? "Так" : "Ні"}</strong><small>Battle.net</small></span>
        <span><strong>{formatDate(profile.lastLoginAt || profile.updatedAt)}</strong><small>активність</small></span>
      </div>

      <a className="btn subtle profile-directory-card__action" href={`/profile/${profile.profileId}`}>Відкрити профіль</a>
    </article>
  );
}

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!canViewProfiles(user)) redirect(await getOwnProfilePath(user));

  const params = await searchParams;
  const query = String(params.q || "").trim();
  const profiles = await listDashboardProfiles({ viewer: user, query, limit: 200 });

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-directory-shell" aria-label="Профілі учасників Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="profiles" />
        <header className="hero panel dashboard-hero content-dashboard-hero profile-directory-hero">
          <div className="hero-copy dashboard-hero__copy content-dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Профілі</div>
            <h1>Профілі учасників</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Перегляд профілів, Discord-ролей, мейн-персонажів і Battle.net-стану. Нижчі ролі не бачать профілі з вищим доступом.</p>
          </div>
        </header>
      </section>

      <form className="toolbar panel profile-directory-toolbar">
        <input className="input" name="q" placeholder="Пошук: Discord, персонаж, реалм..." defaultValue={query} />
        <button className="btn primary" type="submit">Знайти</button>
        {query ? <a className="btn subtle" href="/profiles">Скинути</a> : null}
      </form>

      <section className="profile-directory-grid" aria-label="Список доступних профілів">
        {profiles.length ? profiles.map((profile) => <ProfileCard key={profile.profileId} profile={profile} />) : (
          <div className="content-empty panel">
            <strong>Профілі не знайдено.</strong>
            <span>Спробуй змінити пошук або дочекайся, поки учасники увійдуть через Discord.</span>
          </div>
        )}
      </section>
    </main>
  );
}
