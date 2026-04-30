import DashboardIdentity from "@/components/DashboardIdentity";
import ProfileCandidateBulkActions from "@/components/ProfileCandidateBulkActions";
import { getEnabledBattleNetRegions } from "@/lib/battlenet";
import { BNET_CANDIDATES_COOKIE, parseBattleNetCandidatesCookieValue } from "@/lib/battlenetCandidates";
import { normalizeCharacterKey } from "@/lib/wowCharacters";
import {
  listProfileRaidSignups,
  raidDisplayCapacity,
  raidAutoCompositionLabel,
  raidTitle,
  type ProfileRaidSignup,
} from "@/lib/raids";
import { wowRoleLabel } from "@/lib/wowRoles";
import { getSession } from "@/lib/auth";
import { fetchDiscordRoles, hasDiscordEmbedConfig, type DiscordRoleOption } from "@/lib/discordAdmin";
import {
  configuredRoleIdsForDashboardRole,
  dashboardCapabilities,
  dashboardRoleLabel,
  siteStatusDescription,
} from "@/lib/permissions";
import {
  canViewProfile,
  getMainCharacter,
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
  if (provider === "discord") return "Discord";
  if (provider === "github") return "GitHub";
  return "Резервний ключ";
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

function compactAccountLabel(value: string) {
  return value.length > 22 ? `${value.slice(0, 22)}…` : value;
}

function formatBattleNetAccount(profile: DashboardProfile) {
  const label = profile.battlenet?.accountLabel?.trim();
  if (label) return compactAccountLabel(label);
  const hash = profile.battlenet?.accountIdHash?.trim();
  if (hash) return `Battle.net • ${hash.slice(0, 10)}`;
  return profile.battlenet?.linked ? "Підключено" : "Не підключено";
}

function battleNetActionCopy(profile: DashboardProfile, hasFreshBattleNetSession: boolean) {
  const region = (profile.battlenet?.region?.toString().toUpperCase() || "EU");
  if (hasFreshBattleNetSession) {
    return {
      eyebrow: "Список оновлено",
      title: "Додати ще персонажів",
      hint: `${formatBattleNetAccount(profile)} • ${region} • можна додати персонажів`,
    };
  }
  if (profile.battlenet?.linked) {
    return {
      eyebrow: "Battle.net підключено",
      title: "Оновити персонажів",
      hint: `${formatBattleNetAccount(profile)} • ${region} • онови список для нових персонажів`,
    };
  }
  return {
    eyebrow: "Battle.net не підключено",
    title: "Підключити Battle.net",
    hint: `Знайде персонажів Mistblossom Vanguard і прив’яже їх до профілю`,
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

type ProfileRoleChip = {
  id: string;
  label: string;
  position: number;
  muted?: boolean;
};

function buildRoleChips(roleIds: string[], roles: DiscordRoleOption[]): ProfileRoleChip[] {
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  return Array.from(new Set(roleIds.map((roleId) => String(roleId || "").trim()).filter(Boolean)))
    .map((roleId) => {
      const role = roleMap.get(roleId);
      return {
        id: roleId,
        label: role?.name || `Discord роль ${roleId.slice(-6)}`,
        position: role?.position ?? 0,
      } satisfies ProfileRoleChip;
    })
    .sort((a, b) => b.position - a.position || a.label.localeCompare(b.label, "uk"));
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
}

function statValue(value: number | null | undefined) {
  return typeof value === "number" ? value : "—";
}

function CharacterArtwork({ character }: { character: ProfileCharacter }) {
  const image = character.renderUrl || character.avatarUrl;
  if (image) {
    return <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }

  return <span className="profile-character-artwork__fallback" aria-hidden="true">{character.name.charAt(0)}</span>;
}

function CharacterCard({ character, canManage }: { character: ProfileCharacter; canManage: boolean }) {
  const guildLabel = character.guildName || "Mistblossom Vanguard";
  const classLabel = character.className || "Клас невідомий";
  const specLabel = character.activeSpecName ? `${character.activeSpecName} • ${classLabel}` : classLabel;
  const roleLabel = wowRoleLabel(character.activeSpecRole);
  const levelLabel = character.level ? `Рівень ${character.level}` : "Рівень —";
  const itemLevel = typeof character.itemLevel === "number" ? character.itemLevel : null;

  return (
    <article className={`profile-character-card${character.isMain ? " is-main" : ""}`} aria-label={`${character.isMain ? "Основний персонаж" : "Персонаж"}: ${character.name}`}>
      <div className="profile-character-artwork">
        <CharacterArtwork character={character} />
        <span className="profile-character-region">{character.region.toUpperCase()}</span>
        {character.isMain ? <span className="profile-main-badge profile-main-badge--art">Мейн</span> : null}
      </div>
      <div className="profile-character-body">
        <div className="profile-character-title-row profile-character-title-row--stacked">
          <div>
            <h3>{character.name}</h3>
            <p>{guildLabel}</p>
          </div>
        </div>

        <div className="profile-character-meta">
          <span>{levelLabel}</span>
          <span>{specLabel}</span>
          <span>{roleLabel}</span>
          {character.realmName ? <span>{character.realmName}</span> : null}
        </div>

        <div className="profile-character-showcase">
          <div className="profile-character-showcase__stat">
            <small>Item level</small>
            <strong>{itemLevel ?? "—"}</strong>
          </div>
          <div className="profile-character-showcase__stat profile-character-showcase__stat--secondary">
            <small>Оновлено</small>
            <strong>{formatCompactDate(character.lastSeenAt)}</strong>
          </div>
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

function raidSignupStatusLabel(status: string) {
  if (status === "going") return "Підписаний";
  if (status === "late") return "Затримаюсь";
  if (status === "skipped") return "Пропускає";
  return "Невідомо";
}

function ProfileRaidSignupCard({ item }: { item: ProfileRaidSignup }) {
  const characterLabel = item.signup.characterName
    ? `${item.signup.characterName}${item.signup.realmName ? ` • ${item.signup.realmName}` : ""}`
    : item.signup.discordName || "Без персонажа";
  const specLabel = [item.signup.activeSpecName, item.signup.className].filter(Boolean).join(" • ");
  const activeRoster = item.raid.signups.filter((signup) => signup.status === "going" || signup.status === "late").length;
  const composition = `${activeRoster} / ${raidDisplayCapacity(item.raid)} • ${raidAutoCompositionLabel(item.raid)}`;

  return (
    <article className={`profile-raid-card profile-raid-card--${item.signup.status}`}>
      <a className="profile-raid-card__main" href={`/raids/${encodeURIComponent(item.raid.id)}`}>
        <span className="profile-raid-card__icon" aria-hidden="true">⚔</span>
        <span>
          <strong>{raidTitle(item.raid)}</strong>
          <small>{[item.raid.date, item.raid.time].filter(Boolean).join(", ") || "Дата уточнюється"}</small>
        </span>
      </a>
      <div className="profile-raid-card__meta">
        <span><strong>{raidSignupStatusLabel(item.signup.status)}</strong><small>Статус</small></span>
        <span><strong>{characterLabel}</strong><small>Персонаж</small></span>
        <span><strong>{wowRoleLabel(item.signup.role)}</strong><small>{specLabel || "Роль"}</small></span>
        <span><strong>{composition}</strong><small>Склад</small></span>
      </div>
    </article>
  );
}

function ProfileRaidSignups({ items }: { items: ProfileRaidSignup[] }) {
  const active = items.filter((item) => item.signup.status === "going" || item.signup.status === "late");
  const skipped = items.filter((item) => item.signup.status === "skipped");

  return (
    <article className="panel profile-card profile-card--raids">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">Рейди</span>
          <h2>Мої записи</h2>
        </div>
        <span className="profile-count-pill">{active.length}</span>
      </div>
      <p className="profile-card-lead">Тут видно, на який рейд підписався учасник і яким персонажем він іде. Дані беруться з мейн-персонажа на момент запису.</p>

      {items.length ? (
        <div className="profile-raid-list">
          {active.map((item) => <ProfileRaidSignupCard key={`${item.raid.id}-${item.signup.discordId}`} item={item} />)}
          {skipped.length ? (
            <details className="profile-raid-skipped">
              <summary>Пропущені рейди: {skipped.length}</summary>
              <div className="profile-raid-list profile-raid-list--nested">
                {skipped.map((item) => <ProfileRaidSignupCard key={`${item.raid.id}-${item.signup.discordId}-skipped`} item={item} />)}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <div className="profile-empty-characters profile-empty-characters--compact">
          <strong>Записів на рейди ще немає</strong>
          <span>Коли учасник натисне “Підписатися” або “Затримаюсь”, запис зʼявиться тут.</span>
        </div>
      )}
    </article>
  );
}

function CandidateRow({ character, bulkFormId }: { character: ProfileCharacter; bulkFormId: string }) {
  return (
    <li className="profile-character-candidate">
      <label className="profile-candidate-select" title={`Позначити ${character.name}`}>
        <input
          data-profile-candidate-checkbox="true"
          form={bulkFormId}
          type="checkbox"
          name="characterKeys"
          value={character.key}
          aria-label={`Вибрати ${character.name}`}
        />
        <span aria-hidden="true" />
      </label>
      <span className="profile-character-candidate__avatar">
        {character.avatarUrl ? <img src={character.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : character.name.charAt(0)}
      </span>
      <span className="profile-character-candidate__body">
        <strong>{character.name}</strong>
        <small>{character.realmName} • {character.activeSpecName ? `${character.activeSpecName} ` : ""}{character.className || "Клас невідомий"} • {wowRoleLabel(character.activeSpecRole)} • Рівень {character.level || "—"}</small>
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
  const [initialProfile, cookieStore] = await Promise.all([
    getProfileById(profileId),
    cookies(),
  ]);

  const isOwnProfile = Boolean(viewer.profileId && viewer.profileId === profileId);
  if (initialProfile && !canViewProfile(viewer, profileId, initialProfile)) {
    notFound();
  }
  if (!initialProfile && !isOwnProfile && !canViewProfile(viewer, profileId)) {
    notFound();
  }

  let profile = initialProfile;
  let storageWarning = "";

  if (!profile && isOwnProfile) {
    const result = await upsertProfileFromSession(viewer).catch(() => null);
    profile = result?.profile || { ...profileFromSession(viewer), profileId };
    if (!result?.stored) {
      storageWarning = "Профіль тимчасово показано з поточної сесії. Частина даних може оновитися після повторного входу.";
    }
  }

  if (!profile) {
    notFound();
  }

  let roles: DiscordRoleOption[] = [];
  let roleLoadError = "";
  const shouldLoadRoles = hasDiscordEmbedConfig() && (viewer.role === "admin" || viewer.role === "moderator" || isOwnProfile);

  if (shouldLoadRoles) {
    try {
      roles = await fetchDiscordRoles();
    } catch (error) {
      roleLoadError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  const profileSession = profileAsSession(profile);
  const capabilities = dashboardCapabilities(profile.role);
  const enabledCount = capabilities.filter((item) => item.enabled).length;
  const mainCharacter = getMainCharacter(profile);
  const enabledBattleNetRegions = getEnabledBattleNetRegions();
  const canManageCharacters = isOwnProfile;
  const canInspectOtherProfile = !isOwnProfile && (viewer.role === "admin" || viewer.role === "moderator");
  const addedKeys = new Set(profile.characters.map((item) => normalizeCharacterKey(item.key)).filter(Boolean));
  const candidateCookie = isOwnProfile ? cookieStore.get(BNET_CANDIDATES_COOKIE)?.value : undefined;
  const candidateSession = isOwnProfile ? parseBattleNetCandidatesCookieValue(candidateCookie, profile.profileId) : null;
  const availableCandidates = (candidateSession?.characters || []).filter((item) => !addedKeys.has(normalizeCharacterKey(item.key)));
  const hasFreshBattleNetSession = Boolean(candidateSession && availableCandidates.length);
  const primaryBattleNetRegion = enabledBattleNetRegions[0] || "eu";
  const battleNetAction = battleNetActionCopy(profile, hasFreshBattleNetSession);
  const bulkFormId = "profile-candidate-bulk-add";
  const savedCharacterCount = profile.characters.length;
  const totalBattleNetCharacters = numberOrNull(profile.battlenet?.totalCharacters);
  const scannedBattleNetCharacters = numberOrNull(profile.battlenet?.scannedCharacters);
  const eligibleGuildCharacters = numberOrNull(profile.battlenet?.eligibleCharacters);
  const visibleGuildCharacters = savedCharacterCount + availableCandidates.length;
  const hiddenGuildCandidates = eligibleGuildCharacters !== null ? Math.max(eligibleGuildCharacters - visibleGuildCharacters, 0) : 0;
  const roleIdsFromSession = Array.from(new Set((profileSession.discordRoleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean)));
  const configuredAccessRoleIds = new Set(configuredRoleIdsForDashboardRole(profile.role));
  const accessRoleIds = roleIdsFromSession.filter((roleId) => configuredAccessRoleIds.has(roleId));
  const accessRoleChips: ProfileRoleChip[] = profileSession.provider === "token"
    ? [{ id: "token", label: "Резервний ключ адміністратора", position: 9999 }]
    : buildRoleChips(accessRoleIds, roles);
  const fallbackAccessChip = !accessRoleChips.length
    ? ({
        id: "access-fallback",
        label: profile.role === "member" ? "Доступ через участь на Discord-сервері" : `${dashboardRoleLabel(profile.role)}`,
        position: -1,
        muted: true,
      } satisfies ProfileRoleChip)
    : null;
  const accessRoleIdSet = new Set(accessRoleIds);
  const otherRoleChips: ProfileRoleChip[] = profileSession.provider === "token"
    ? []
    : buildRoleChips(roleIdsFromSession.filter((roleId) => !accessRoleIdSet.has(roleId)), roles);
  const raidSignups = await listProfileRaidSignups(profile).catch(() => []);

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-shell" aria-label="Персональна сторінка панелі Mistblossom Vanguard">
        <DashboardIdentity user={viewer} activeSection="profile" />
        <header className="hero panel dashboard-hero profile-hero">
          <div className="hero-copy dashboard-hero__copy profile-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Профіль</div>
            <h1>{isOwnProfile ? "Мій профіль" : "Профіль учасника"}</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Усе головне в одному місці: доступ, ролі Discord і персонажі Battle.net.</p>
            <div className="profile-hero-strip" aria-label="Короткий стан профілю">
              <span><strong>{dashboardRoleLabel(profile.role)}</strong><small>Роль</small></span>
              <span><strong>{enabledCount}/{capabilities.length}</strong><small>Можливості</small></span>
              <span><strong>{savedCharacterCount}</strong><small>У профілі</small></span>
              <span><strong>{statValue(eligibleGuildCharacters)}</strong><small>У гільдії</small></span>
              <span><strong>{availableCandidates.length}</strong><small>Доступно</small></span>
              <span><strong>{mainCharacter?.name || "—"}</strong><small>Мейн</small></span>
            </div>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>{siteStatusDescription(profile.role)}</span>
            </div>
            {storageWarning ? <div className="login-alert profile-storage-warning" role="status">{storageWarning}</div> : null}
            {canInspectOtherProfile ? <div className="login-alert profile-storage-warning" role="status">Ти можеш переглядати цей профіль, але змінювати персонажів може тільки власник.</div> : null}
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
              {viewer.role === "admin" || viewer.role === "moderator" ? (
                <details className="profile-secret">
                  <summary>Технічний ID</summary>
                  <code>{profile.profileId}</code>
                </details>
              ) : null}
            </div>
          </div>

          <dl className="profile-facts profile-facts--compact">
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

          <p className="profile-card-lead">Зверху показані ролі, що дали доступ до панелі. Нижче — решта ролей Discord.</p>

          <div className="profile-access-summary" aria-label="Поточний доступ">
            <span><strong>{dashboardRoleLabel(profile.role)}</strong><small>Поточний доступ у панелі</small></span>
            <span><strong>{enabledCount}/{capabilities.length}</strong><small>Доступно</small></span>
          </div>

          <div className="profile-role-group">
            <div className="profile-role-group__head">
              <strong>Надали доступ</strong>
              <small>{accessRoleChips.length + (fallbackAccessChip ? 1 : 0)}</small>
            </div>
            <div className="profile-role-stack" aria-label="Ролі, які надали найвищий доступ">
              {[...accessRoleChips, ...(fallbackAccessChip ? [fallbackAccessChip] : [])].map((role) => (
                <span className={`profile-role-chip${role.muted ? " profile-role-chip--muted" : ""}`} key={role.id}>{role.label}</span>
              ))}
            </div>
          </div>

          <div className="profile-role-group">
            <div className="profile-role-group__head">
              <strong>Інші Discord ролі</strong>
              <small>{otherRoleChips.length}</small>
            </div>
            <div className="profile-role-stack profile-role-stack--secondary" aria-label="Інші Discord ролі користувача">
              {otherRoleChips.length ? otherRoleChips.map((role) => (
                <span className="profile-role-chip profile-role-chip--secondary" key={role.id}>{role.label}</span>
              )) : <span className="profile-role-chip profile-role-chip--muted">Інших ролей не знайдено</span>}
            </div>
          </div>

          {roleIdsFromSession.length && !roles.length && !roleLoadError ? <small className="profile-warning">Назви ролей тимчасово недоступні. Доступ усе одно визначено коректно.</small> : null}
          {roleLoadError ? <small className="profile-warning">Назви Discord-ролей тимчасово недоступні.</small> : null}
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

          <p className="profile-card-lead">Тут показані збережені персонажі й те, скільки ще можна додати після оновлення Battle.net.</p>

          <div className="profile-bnet-summary" aria-label="Battle.net підсумок профілю">
            <span><strong>{savedCharacterCount}</strong><small>У профілі</small></span>
            <span><strong>{statValue(eligibleGuildCharacters)}</strong><small>У гільдії</small></span>
            <span><strong>{availableCandidates.length}</strong><small>Доступно</small></span>
            <span><strong>{statValue(scannedBattleNetCharacters)}</strong><small>Перевірено</small></span>
            <span><strong>{profile.battlenet?.region?.toString().toUpperCase() || "EU"}</strong><small>Регіон</small></span>
            <span><strong>{formatBattleNetAccount(profile)}</strong><small>Battle.net</small></span>
          </div>

          {hiddenGuildCandidates > 0 ? (
            <div className="profile-bnet-note" role="status">
              Остання перевірка знайшла більше персонажів. Онови Battle.net ще раз, щоб побачити повний список для додавання.
            </div>
          ) : null}

          {totalBattleNetCharacters !== null ? (
            <div className="profile-bnet-footnote">
              В акаунті Battle.net: <strong>{totalBattleNetCharacters}</strong> персонажів. Нижче показані лише ті, що додані в профіль.
            </div>
          ) : null}

          {profile.characters.length ? (
            <>
              <div className="profile-subsection-head">
                <strong>Збережені персонажі</strong>
                <small>{savedCharacterCount}</small>
              </div>
              <div className="profile-character-list">
                {profile.characters.map((character) => <CharacterCard key={character.key} character={character} canManage={canManageCharacters} />)}
              </div>
            </>
          ) : (
            <div className="profile-empty-characters">
              <strong>Поки що без персонажів</strong>
              <span>{canManageCharacters ? "Онови Battle.net і додай потрібних персонажів." : "Учасник ще не додав персонажів."}</span>
            </div>
          )}

          {canManageCharacters && hasFreshBattleNetSession ? (
            <div className="profile-candidates-box">
              <div className="profile-card-head profile-card-head--inline">
                <div>
                  <span className="eyebrow">Свіжа Battle.net перевірка</span>
                  <h3>Доступні для додавання</h3>
                  <small className="profile-card-note">Список тимчасовий — додай потрібних персонажів одразу.</small>
                </div>
                <span className="profile-count-pill">{availableCandidates.length}</span>
              </div>
              <form id={bulkFormId} className="profile-candidate-bulk-form" action="/api/profile/characters/bulk-add" method="post" />
              <ProfileCandidateBulkActions formId={bulkFormId} count={availableCandidates.length} />
              <ul className="profile-character-candidates">
                {availableCandidates.map((character) => <CandidateRow key={character.key} character={character} bulkFormId={bulkFormId} />)}
              </ul>
            </div>
          ) : null}
        </article>

        <ProfileRaidSignups items={raidSignups} />

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
