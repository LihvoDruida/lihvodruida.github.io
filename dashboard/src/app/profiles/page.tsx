import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
import { getSession } from "@/lib/auth";
import { canViewProfiles, guildStatusLabel } from "@/lib/permissions";
import { getMainCharacter, getOwnProfilePath, getProfilePublicName, listDashboardProfiles, type DashboardProfile } from "@/lib/profiles";
import { redirect } from "next/navigation";
import { pickWowAvatarImageUrl } from "@/lib/wowCharacters";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Профілі учасників",
  description: "Список профілів Mistblossom Vanguard з персонажами, ролями, мейнами та доступними діями за правами користувача.",
  path: "/profiles",
  keywords: ["профілі учасників", "персонажі WoW", "Battle.net"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCompactDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "2-digit" }).format(date);
}

function profileDirectoryAvatarUrl(profile: DashboardProfile) {
  const main = getMainCharacter(profile);
  return profile.avatarUrl || pickWowAvatarImageUrl(main?.avatarUrl, main?.renderUrl, main?.mediaUrl) || null;
}

function ProfileCard({ profile }: { profile: DashboardProfile }) {
  const main = getMainCharacter(profile);
  const displayName = getProfilePublicName(profile);
  const avatar = profileDirectoryAvatarUrl(profile);
  const guildStatus = profile.groupName || guildStatusLabel(profile.role);
  const href = `/profile/${profile.profileId}`;
  const activityDate = profile.lastLoginAt || profile.updatedAt;
  const mainLabel = main ? `${main.name}${main.realmName ? `, ${main.realmName}` : ""}` : "мейн не вибрано";

  return (
    <a className="panel profile-directory-card profile-directory-card--clickable" href={href} aria-label={`Відкрити профіль: ${displayName}`}>
      <div className="profile-directory-card__main">
        {avatar ? (
          <img className="profile-directory-card__avatar" src={avatar} alt="" width={64} height={64} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="profile-directory-card__avatar profile-directory-card__avatar--fallback" aria-hidden="true">
            {(displayName || "?").charAt(0)}
          </span>
        )}
        <div className="profile-directory-card__content">
          <h2 title={displayName}>{displayName}</h2>
          <p className="profile-directory-card__meta" title={`${guildStatus} • ${mainLabel}`}>
            <span>{guildStatus}</span>
            <span aria-hidden="true">•</span>
            <span>{mainLabel}</span>
          </p>
        </div>
      </div>

      <div className="profile-directory-card__stats" aria-label="Короткі дані профілю">
        <span>
          <small>Персонажі</small>
          <strong>{profile.characters.length}</strong>
        </span>
        <span>
          <small>Battle.net</small>
          <strong>{profile.battlenet?.linked ? "Так" : "Ні"}</strong>
        </span>
        <span className="profile-directory-card__stat--date" title={formatDate(activityDate)}>
          <small>Активність</small>
          <strong>{formatCompactDate(activityDate)}</strong>
        </span>
      </div>
    </a>
  );
}

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) { redirect("/login"); throw new Error("Login required"); }
  if (!canViewProfiles(user)) redirect(await getOwnProfilePath(user));

  const params = await searchParams;
  const query = String(params.q || "").trim();
  const profiles = await listDashboardProfiles({ viewer: user, query, limit: 200 });

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-directory-shell" aria-label="Профілі учасників Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="profiles" />
        <header className="hero panel dashboard-hero content-dashboard-hero profile-directory-hero">
          <div className="hero-copy dashboard-hero__copy content-dashboard-hero__copy guild-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Профілі</div>
            <h1>Профілі учасників</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Перегляд профілів, Discord-ролей, мейн-персонажів і Battle.net-стану. Нижчі ролі не бачать профілі з вищим доступом.</p>
          </div>
          <HeroSidePanel
            ariaLabel="Огляд профілів"
            summary={[
              { label: "ДОСТУП", value: user.groupName || guildStatusLabel(user.role), note: "Фільтр за правами поточного користувача" },
              { label: "ПОШУК", value: query || "Усі доступні", note: query ? "Активний фільтр" : "Без фільтра" },
            ]}
            stats={[
              { label: "ПРОФІЛІ", value: profiles.length.toLocaleString("uk-UA") },
              { label: "ЛІМІТ", value: "200" },
              { label: "B.NET", value: profiles.filter((profile) => profile.battlenet?.linked).length.toLocaleString("uk-UA") },
            ]}
          />
        </header>
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
      </section>
    </main>
  );
}
