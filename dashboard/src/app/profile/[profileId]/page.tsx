import DashboardIdentity from "@/components/DashboardIdentity";
import { getEnabledBattleNetRegions } from "@/lib/battlenet";
import { BNET_CANDIDATES_COOKIE, parseBattleNetCandidatesCookieValue } from "@/lib/battlenetCandidates";
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
  getMainCharacter,
  getOwnProfilePath,
  getProfileById,
  profileFromSession,
  upsertProfileFromSession,
  type DashboardProfile,
  type ProfileCharacter,
} from "@/lib/profiles";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";

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

function formatCompactDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short" }).format(date);
}


function formatBattleNetAccount(profile: DashboardProfile) {
  const label = profile.battlenet?.accountLabel?.trim();
  if (label) return label;
  const hash = profile.battlenet?.accountIdHash?.trim();
  if (hash) return `Battle.net • ${hash}`;
  return profile.battlenet?.linked ? "Battle.net підключено" : "Battle.net не підключено";
}

function battleNetActionCopy(profile: DashboardProfile, hasFreshBattleNetSession: boolean) {
  const region = (profile.battlenet?.region?.toString().toUpperCase() || "EU");
  if (hasFreshBattleNetSession) {
    return {
      eyebrow: "Свіжа перевірка активна",
      title: "Додати ще персонажів",
      hint: `${formatBattleNetAccount(profile)} • ${region} • список тимчасово відкритий після реавторизації`,
    };
  }
  if (profile.battlenet?.linked) {
    return {
      eyebrow: "Battle.net підключено",
      title: "Оновити персонажів",
      hint: `${formatBattleNetAccount(profile)} • ${region} • потрібна реавторизація для нового списку`,
    };
  }
  return {
    eyebrow: "Battle.net не підключено",
    title: "Підключити Battle.net",
    hint: `Дозволить знайти персонажів Mistblossom Vanguard і прив’язати їх до профілю`,
  };
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

function CharacterArtwork({ character }: { character: ProfileCharacter }) {
  const image = character.renderUrl || character.avatarUrl;
  if (image) {
    return <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }

  return <span className="profile-character-artwork__fallback" aria-hidden="true">{character.name.charAt(0)}</span>;
}

function CharacterCard({ character, canManage }: { character: ProfileCharacter; canManage: boolean }) {
  return (
    <article className={`profile-character-card${character.isMain ? " is-main" : ""}`}>
      <div className="profile-character-artwork">
        <CharacterArtwork character={character} />
        <span className="profile-character-region">{character.region.toUpperCase()}</span>
      </div>
      <div className="profile-character-body">
        <div className="profile-character-title-row">
          <div>
            <h3>{character.name}</h3>
            <p>{character.guildName || "Mistblossom Vanguard"}</p>
          </div>
          {character.isMain ? <span className="profile-main-badge">Мейн</span> : null}
        </div>

        <div className="profile-character-meta">
          <span>Level {character.level || "—"}</span>
          {character.className ? <span>{character.className}</span> : null}
          {character.realmName ? <span>{character.realmName}</span> : null}
        </div>

        <div className="profile-character-stats">
          <span><strong>{character.faction || "—"}</strong><small>Фракція</small></span>
          <span><strong>{character.raceName || "—"}</strong><small>Раса</small></span>
          <span><strong>{formatCompactDate(character.lastSeenAt)}</strong><small>Оновлено</small></span>
        </div>

        <div className="profile-character-actions">
          {canManage && !character.isMain ? (
            <form action="/api/profile/characters/main" method="post">
              <input type="hidden" name="characterKey" value={character.key} />
              <button className="btn btn-ghost btn-sm" type="submit">Зробити мейном</button>
            </form>
          ) : null}
          {canManage ? (
            <form action="/api/profile/characters/remove" method="post">
              <input type="hidden" name="characterKey" value={character.key} />
              <button className="btn btn-danger btn-sm" type="submit">Видалити</button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function CandidateRow({ character }: { character: ProfileCharacter }) {
  return (
    <li className="profile-character-candidate">
      <span className="profile-character-candidate__avatar">
        {character.avatarUrl ? <img src={character.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : character.name.charAt(0)}
      </span>
      <span className="profile-character-candidate__body">
        <strong>{character.name}</strong>
        <small>{character.realmName} • {character.className || "Клас невідомий"} • Level {character.level || "—"}</small>
      </span>
      <form action="/api/profile/characters/add" method="post">
        <input type="hidden" name="characterKey" value={character.key} />
        <button className="btn btn-primary btn-sm" type="submit">Додати</button>
      </form>
    </li>
  );
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
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
  const mainCharacter = getMainCharacter(profile);
  const enabledBattleNetRegions = getEnabledBattleNetRegions();
  const canManageCharacters = isOwnProfile;
  const addedKeys = new Set(profile.characters.map((item) => item.key));
  const candidateCookie = isOwnProfile ? (await cookies()).get(BNET_CANDIDATES_COOKIE)?.value : undefined;
  const candidateSession = isOwnProfile ? parseBattleNetCandidatesCookieValue(candidateCookie, profile.profileId) : null;
  const availableCandidates = (candidateSession?.characters || []).filter((item) => !addedKeys.has(item.key));
  const hasFreshBattleNetSession = Boolean(candidateSession && availableCandidates.length);
  const primaryBattleNetRegion = enabledBattleNetRegions[0] || "eu";
  const battleNetAction = battleNetActionCopy(profile, hasFreshBattleNetSession);

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-shell" aria-label="Персональна сторінка панелі Mistblossom Vanguard">
        <DashboardIdentity user={viewer} activeSection="profile" />
        <header className="hero panel dashboard-hero profile-hero">
          <div className="hero-copy dashboard-hero__copy profile-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Personal access</div>
            <h1>{isOwnProfile ? "Мій профіль" : "Профіль учасника"}</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Унікальна сторінка профілю з Firebase-сховища, роллю доступу, Battle.net персонажами та основним персонажем для екосистеми сайту.</p>
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

        <article className="panel profile-card profile-card--characters">
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Battle.net</span>
              <h2>Персонажі гільдії</h2>
            </div>
            {canManageCharacters ? (
              <div className="profile-bnet-region-actions" aria-label="Підключити або оновити Battle.net">
                <a className="profile-bnet-cta" href={`/api/auth/battlenet/start?region=${primaryBattleNetRegion}`}>
                  <span className="profile-bnet-cta__eyebrow">{battleNetAction.eyebrow}</span>
                  <strong>{battleNetAction.title}</strong>
                  <small>{battleNetAction.hint}</small>
                </a>
              </div>
            ) : null}
          </div>

          <p className="profile-card-lead">У Firebase зберігаються тільки додані персонажі, main-персонаж і мінімальні метадані Battle.net акаунта. Тимчасовий список для додавання зʼявляється лише після справжньої реавторизації, не висить постійно і очищається після використання.</p>

          <div className="profile-bnet-summary">
            <span><strong>{profile.characters.length}</strong><small>Додано</small></span>
            <span><strong>{mainCharacter?.name || "—"}</strong><small>Мейн</small></span>
            <span><strong>{profile.battlenet?.region?.toString().toUpperCase() || "EU"}</strong><small>Регіон</small></span>
            <span><strong>{formatBattleNetAccount(profile)}</strong><small>Battle.net акаунт</small></span>
          </div>

          {profile.characters.length ? (
            <div className="profile-character-list">
              {profile.characters.map((character) => <CharacterCard key={character.key} character={character} canManage={canManageCharacters} />)}
            </div>
          ) : (
            <div className="profile-empty-characters">
              <strong>Персонажі ще не додані</strong>
              <span>{canManageCharacters ? "Натисни кнопку Battle.net вище, пройди реавторизацію і додай потрібних персонажів." : "Учасник ще не додав персонажів до профілю."}</span>
            </div>
          )}

          {canManageCharacters && hasFreshBattleNetSession ? (
            <div className="profile-candidates-box">
              <div className="profile-card-head profile-card-head--inline">
                <div>
                  <span className="eyebrow">Свіжа Battle.net перевірка</span>
                  <h3>Доступні для додавання</h3>
                  <small className="profile-card-note">Цей список тимчасовий і з’являється лише після справжньої реавторизації. У Firebase він не зберігається.</small>
                </div>
                <span className="profile-count-pill">{availableCandidates.length}</span>
              </div>
              <ul className="profile-character-candidates">
                {availableCandidates.map((character) => <CandidateRow key={character.key} character={character} />)}
              </ul>
            </div>
          ) : null}
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
