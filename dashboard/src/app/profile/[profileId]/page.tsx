import DashboardIdentity from "@/components/DashboardIdentity";
import ProfileCandidateBulkActions from "@/components/ProfileCandidateBulkActions";
import ProfileCandidateExpiryTimer from "@/components/ProfileCandidateExpiryTimer";
import { getEnabledBattleNetRegions } from "@/lib/battlenet";
import { fetchDiscordGuildMemberSnapshot, fetchDiscordRoles } from "@/lib/discordAdmin";
import { normalizeCharacterKey, pickWowAvatarImageUrl } from "@/lib/wowCharacters";
import {
  listProfileRaidSignups,
  raidDisplayCapacity,
  raidAutoCompositionLabel,
  raidTitle,
  type ProfileRaidSignup,
} from "@/lib/raids";
import { buildPageMetadata } from "@/lib/seo";
import { wowRoleLabel } from "@/lib/wowRoles";
import { getSession, type DashboardSession } from "@/lib/auth";
import { canViewProfileAccessDetails, dashboardRoleLabel, guildStatusLabel } from "@/lib/permissions";
import {
  canViewProfile,
  profileGenderedText,
  getMainCharacter,
  getProfilePublicName,
  getProfileRaidRole,
  getProfileById,
  profileNeedsSettingsSetup,
  profileSettingsSetupPath,
  profileFromSession,
  upsertProfileFromSession,
  type DashboardProfile,
  type ProfileCharacter,
} from "@/lib/profiles";
import { getGuildNicknamePolicy } from "@/lib/guildNicknamePolicy";
import { notFound, redirect } from "next/navigation";

export const metadata = buildPageMetadata({
  title: "Профіль учасника",
  description: "Профіль учасника Mistblossom Vanguard з Battle.net-персонажами, мейном і записами на рейди.",
  path: "/profile",
  keywords: ["профіль учасника", "мейн персонаж", "Battle.net", "рейдова роль"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatCompactDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short" }).format(date);
}

function battleNetActionCopy(profile: DashboardProfile, hasFreshBattleNetSession: boolean) {
  if (hasFreshBattleNetSession) {
    return {
      eyebrow: "Готово до додавання",
      title: "Додати персонажів",
      hint: "Вибери потрібних зі свіжого списку",
    };
  }
  if (profile.battlenet?.linked) {
    return {
      eyebrow: "Battle.net підключено",
      title: "Оновити список",
      hint: "Потрібно для нових або оновлених персонажів",
    };
  }
  return {
    eyebrow: "Battle.net не підключено",
    title: "Підключити Battle.net",
    hint: "Знайде гільдійних та інших персонажів Battle.net",
  };
}

function characterVisualUrl(character?: Pick<ProfileCharacter, "renderUrl" | "avatarUrl" | "mediaUrl"> | null) {
  if (!character) return null;
  return character.renderUrl || pickWowAvatarImageUrl(character.avatarUrl, character.mediaUrl);
}

function characterAvatarUrl(character?: Pick<ProfileCharacter, "renderUrl" | "avatarUrl" | "mediaUrl"> | null) {
  if (!character) return null;
  return pickWowAvatarImageUrl(character.avatarUrl, character.renderUrl, character.mediaUrl);
}

function characterAuxMeta(character: Pick<ProfileCharacter, "level" | "raceName" | "faction">) {
  return [
    typeof character.level === "number" ? `Lvl ${character.level}` : null,
    character.raceName || null,
    character.faction || null,
  ].filter(Boolean);
}

function compactId(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (text.length <= 22) return text;
  return `${text.slice(0, 10)}…${text.slice(-8)}`;
}

function discordRoleNames(roleIds: string[], roles: Array<{ id: string; name: string }>) {
  const roleMap = new Map(roles.map((role) => [role.id, role.name]));
  return Array.from(new Set(roleIds))
    .map((roleId) => ({ id: roleId, name: roleMap.get(roleId) || `ID ${roleId.slice(-6)}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));
}

function ProfileTechnicalInfo({
  profile,
  discordRoleItems,
  liveDiscordChecked,
}: {
  profile: DashboardProfile;
  discordRoleItems: Array<{ id: string; name: string }>;
  liveDiscordChecked: boolean;
}) {
  const discordId = profile.provider === "discord" ? profile.providerUserId : null;

  return (
    <section className="profile-info-panel" aria-label="Технічні дані профілю">
      <div className="profile-info-item">
        <small>ID профілю</small>
        <strong title={profile.profileId}>{compactId(profile.profileId)}</strong>
      </div>
      <div className="profile-info-item">
        <small>ID користувача Discord</small>
        <strong title={discordId || undefined}>{compactId(discordId)}</strong>
      </div>
      <div className="profile-info-item profile-info-item--wide">
        <small>Ролі Discord {liveDiscordChecked ? "на сервері" : "із профілю"}</small>
        {discordRoleItems.length ? (
          <div className="profile-discord-role-list">
            {discordRoleItems.map((role) => <span key={role.id} title={role.id}>{role.name}</span>)}
          </div>
        ) : (
          <strong>—</strong>
        )}
      </div>
    </section>
  );
}

function CharacterArtwork({ character }: { character: ProfileCharacter }) {
  const image = characterVisualUrl(character);
  if (image) {
    return <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }

  return <span className="profile-character-artwork__fallback" aria-hidden="true">{character.name.charAt(0)}</span>;
}

function CharacterCard({ character, canManage, showMainBadge }: { character: ProfileCharacter; canManage: boolean; showMainBadge: boolean }) {
  const classLabel = character.className || "Клас невідомий";
  const specLabel = character.activeSpecName ? `${character.activeSpecName} • ${classLabel}` : classLabel;
  const roleLabel = wowRoleLabel(character.activeSpecRole);
  const itemLevel = typeof character.itemLevel === "number" ? character.itemLevel : null;
  const realmLabel = character.realmName || character.realmSlug || "Реалм —";
  const extraMeta = characterAuxMeta(character);
  const guildBadge = character.verifiedGuild
    ? { label: "Гільдійний", icon: "🌿", className: "is-guild" }
    : { label: "Інший", icon: "🤝", className: "is-other" };

  return (
    <article className={`profile-character-card${showMainBadge && character.isMain ? " is-main" : ""} ${guildBadge.className}`} aria-label={`${showMainBadge && character.isMain ? "Основний персонаж" : "Персонаж"}: ${character.name}`}>
      <div className="profile-character-artwork">
        <CharacterArtwork character={character} />
        {showMainBadge && character.isMain ? <span className="profile-main-badge profile-main-badge--art">Мейн</span> : null}
      </div>
      <div className="profile-character-body">
        <div className="profile-character-title-row profile-character-title-row--stacked">
          <div>
            <h3>{character.name}</h3>
            <p>{realmLabel}</p>
          </div>
          <span className={`profile-character-kind profile-character-kind--${guildBadge.className}`}>{guildBadge.icon} {guildBadge.label}</span>
        </div>

        <div className="profile-character-meta">
          <span>{specLabel}</span>
          <span>{roleLabel}</span>
          <span>{realmLabel}</span>
          {extraMeta.map((value) => <span key={value}>{value}</span>)}
        </div>

        <div className="profile-character-showcase">
          <div className="profile-character-showcase__stat">
            <small>ilvl</small>
            <strong>{itemLevel ?? "—"}</strong>
          </div>
          <div className="profile-character-showcase__stat profile-character-showcase__stat--secondary">
            <small>Рівень</small>
            <strong>{typeof character.level === "number" ? character.level : "—"}</strong>
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

function raidSignupStatusLabel(status: string, gender?: DashboardProfile["grammaticalGender"] | null) {
  if (status === "going") return profileGenderedText(gender, "Підписаний", "Підписана", "Підписали");
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
        <span><strong>{raidSignupStatusLabel(item.signup.status, item.signup.grammaticalGender)}</strong><small>Статус</small></span>
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
    <article id="profile-raids" className="panel profile-card profile-card--raids">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">Рейди</span>
          <h2>Мої записи</h2>
        </div>
        <span className="profile-count-pill">{active.length}</span>
      </div>
      <p className="profile-card-lead">Тут видно активні записи на рейди. Для кожного нового запису персонажа потрібно вибрати вручну.</p>

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
  const kindLabel = character.verifiedGuild ? "🌿 Гільдійний" : "🤝 Інший";
  const image = characterAvatarUrl(character);
  const realmLabel = character.realmName || character.realmSlug || "Реалм —";
  const extraMeta = characterAuxMeta(character);
  return (
    <li className={`profile-character-candidate${character.verifiedGuild ? " is-guild" : " is-other"}`}>
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
        {image ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : character.name.charAt(0)}
      </span>
      <span className="profile-character-candidate__body">
        <strong>{character.name} <em className="profile-character-candidate__kind">{kindLabel}</em></strong>
        <small>{realmLabel} • {character.activeSpecName ? `${character.activeSpecName} ` : ""}{character.className || "Клас невідомий"} • {wowRoleLabel(character.activeSpecRole)}{typeof character.itemLevel === "number" ? ` • ilvl ${character.itemLevel}` : ""}{typeof character.level === "number" ? ` • lvl ${character.level}` : ""}</small>
        {extraMeta.length ? <small>{extraMeta.join(" • ")}</small> : null}
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
  const session = await getSession();
  const nicknamePolicy = await getGuildNicknamePolicy();
  if (!session) {
    redirect("/login");
    throw new Error("Unauthorized");
  }
  const viewer: DashboardSession = session;

  const { profileId } = await params;
  const initialProfile = await getProfileById(profileId);

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

  if (isOwnProfile && profileNeedsSettingsSetup(profile)) {
    redirect(profileSettingsSetupPath(profile.profileId));
  }

  const mainCharacter = getMainCharacter(profile);
  const selectedRaidRole = getProfileRaidRole(profile);
  const enabledBattleNetRegions = getEnabledBattleNetRegions();
  const canManageCharacters = isOwnProfile;
  const canViewPrivateProfileBlocks = isOwnProfile || canViewProfileAccessDetails(viewer);
  const addedKeys = new Set(profile.characters.map((item) => normalizeCharacterKey(item.key)).filter(Boolean));
  const candidateByKey = new Map<string, ProfileCharacter>();
  for (const candidate of profile.battlenet?.candidateCharacters || []) {
    const key = normalizeCharacterKey(candidate.key);
    if (key && !candidateByKey.has(key)) candidateByKey.set(key, candidate);
  }
  const availableCandidates = Array.from(candidateByKey.values()).filter((item) => !addedKeys.has(normalizeCharacterKey(item.key)));
  const availableGuildCandidates = availableCandidates.filter((item) => item.verifiedGuild);
  const availableOtherCandidates = availableCandidates.filter((item) => !item.verifiedGuild);
  const profileGuildCharacters = profile.characters.filter((item) => item.verifiedGuild);
  const profileOtherCharacters = profile.characters.filter((item) => !item.verifiedGuild);
  const hasAvailableBattleNetCandidates = Boolean(availableCandidates.length && profile.battlenet?.candidateExpiresAt);
  const hasFreshBattleNetSession = hasAvailableBattleNetCandidates;
  const primaryBattleNetRegion = enabledBattleNetRegions[0] || "eu";
  const battleNetAction = battleNetActionCopy(profile, hasFreshBattleNetSession);
  const bulkFormId = "profile-candidate-bulk-add";
  const publicNamePreview = getProfilePublicName(profile, nicknamePolicy.template);
  const guildStatus = guildStatusLabel(profile.role);
  const raidSignups = canViewPrivateProfileBlocks ? await listProfileRaidSignups(profile).catch(() => []) : [];
  const accountStatusLabel = dashboardRoleLabel(profile.role);
  const profileUpdatedLabel = formatCompactDate(profile.battlenet?.lastSyncAt || profile.updatedAt || profile.lastLoginAt || mainCharacter?.lastSeenAt);
  const visibleCharacters = [...profile.characters].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    if (a.verifiedGuild !== b.verifiedGuild) return a.verifiedGuild ? -1 : 1;
    return a.name.localeCompare(b.name, "uk");
  });
  const canReadLiveDiscord = canViewPrivateProfileBlocks && profile.provider === "discord" && /^\d{16,25}$/.test(profile.providerUserId);
  const [liveDiscordMember, discordRoles] = canReadLiveDiscord
    ? await Promise.all([
        fetchDiscordGuildMemberSnapshot(profile.providerUserId).catch(() => null),
        fetchDiscordRoles().catch(() => []),
      ])
    : [null, [] as Array<{ id: string; name: string }>];
  const effectiveDiscordRoleIds = liveDiscordMember?.roleIds?.length ? liveDiscordMember.roleIds : profile.discordRoleIds;
  const discordRoleItems = discordRoleNames(effectiveDiscordRoleIds, discordRoles);

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-shell profile-account-page" aria-label="Профіль Mistblossom Vanguard">
        <DashboardIdentity user={viewer} activeSection="profile" />
        <div className="profile-account-layout">
          <aside className="panel profile-account-sidebar" aria-label="Коротка навігація профілю">
            <div className="profile-account-sidebar__identity">
              {profile.avatarUrl ? (
                <img
                  className="profile-account-sidebar__avatar"
                  src={profile.avatarUrl}
                  alt=""
                  width={84}
                  height={84}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="profile-account-sidebar__avatar profile-account-sidebar__avatar--fallback" aria-hidden="true">
                  {(publicNamePreview || profile.displayName || "A").charAt(0)}
                </span>
              )}
              <strong>{publicNamePreview}</strong>
              <span>{accountStatusLabel}</span>
              <div className="profile-account-sidebar__pills" aria-label="Стан профілю">
                <span>☘ {profileGuildCharacters.length} гільд.</span>
                <span>⚔ {wowRoleLabel(selectedRaidRole)}</span>
              </div>
            </div>
            <nav className="profile-account-sidebar__nav" aria-label="Розділи профілю">
              <a href={`/profile/${encodeURIComponent(profile.profileId)}`} aria-current="page"><span aria-hidden="true">✦</span> Профіль</a>
              {isOwnProfile ? <a href={`/profile/${encodeURIComponent(profile.profileId)}/settings`}><span aria-hidden="true">⚙</span> Налаштування</a> : null}
              <a href="#profile-characters"><span aria-hidden="true">⚔</span> Персонажі</a>
              {canViewPrivateProfileBlocks ? <a href="#profile-raids"><span aria-hidden="true">◆</span> Рейди</a> : null}
            </nav>
          </aside>

          <div className="profile-account-main">
            <header className="profile-account-header" id="profile-overview">
              <div>
                <span className="eyebrow">Mistblossom Vanguard • Профіль</span>
                <h1>{isOwnProfile ? "Мій профіль" : "Профіль учасника"}</h1>
                <p>Тут лише перегляд профілю, Battle.net-звʼязок і керування персонажами. Імʼя, Discord-нік, альти для шаблону та інші параметри винесені в налаштування.</p>
              </div>
              <span className="profile-account-header__badge">{guildStatus}</span>
            </header>

            <section className="profile-account-overview profile-account-overview--clean" aria-label="Короткий стан профілю">
              <div className="profile-account-overview-card profile-account-overview-card--primary">
                <span className="profile-account-overview-card__icon" aria-hidden="true">#</span>
                <span>
                  <small>Імʼя профілю</small>
                  <strong>{publicNamePreview}</strong>
                </span>
              </div>
              <div className="profile-account-overview-card profile-account-overview-card--main-role">
                <span className="profile-account-overview-card__icon" aria-hidden="true">⚔</span>
                <span>
                  <small>Мейн / роль у рейді</small>
                  <strong>{mainCharacter?.name || "—"}</strong>
                  <small className="profile-account-overview-card__meta">{wowRoleLabel(selectedRaidRole)}</small>
                </span>
              </div>
            </section>

            {canViewPrivateProfileBlocks ? (
              <ProfileTechnicalInfo
                profile={profile}
                discordRoleItems={discordRoleItems}
                liveDiscordChecked={Boolean(liveDiscordMember)}
              />
            ) : null}

            {storageWarning ? <div className="login-alert profile-storage-warning" role="status">{storageWarning}</div> : null}
            {!isOwnProfile && canViewPrivateProfileBlocks ? <div className="login-alert profile-storage-warning" role="status">Ти можеш переглядати цей профіль, але змінювати персонажів може тільки власник.</div> : null}

            <section className="profile-grid profile-grid--single" aria-label="Персонажі профілю">
              <article id="profile-characters" className="panel profile-card profile-card--characters">
                <div className="profile-card-head profile-card-head--inline">
                  <div>
                    <span className="eyebrow">Battle.net</span>
                    <h2>Персонажі Battle.net</h2>
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

                <div className="profile-card-toolbar profile-card-toolbar--compact" aria-label="Стан персонажів">
                  <span><strong>{profileGuildCharacters.length}</strong><small>Гільдійні</small></span>
                  <span><strong>{profileOtherCharacters.length}</strong><small>Інші</small></span>
                  <span data-profile-candidate-summary="true"><strong data-profile-candidate-count="true">{availableCandidates.length}</strong><small>Можна додати</small></span>
                  <span><strong>{profileUpdatedLabel}</strong><small>Оновлено</small></span>
                </div>

                {profile.characters.length ? (
                  <div className="profile-character-list profile-character-list--single-flow">
                    {visibleCharacters.map((character) => <CharacterCard key={character.key} character={character} canManage={canManageCharacters} showMainBadge={canViewPrivateProfileBlocks} />)}
                  </div>
                ) : (
                  <div className="profile-empty-characters">
                    <strong>Персонажів ще немає</strong>
                    <span>{canManageCharacters ? "Підключи Battle.net і додай мейна для рейдів." : "Учасник ще не додав персонажів."}</span>
                  </div>
                )}

                {canManageCharacters && hasAvailableBattleNetCandidates ? (
                  <div className="profile-candidates-box" data-profile-candidates-box="true">
                    <div className="profile-card-head profile-card-head--inline">
                      <div>
                        <span className="eyebrow">Battle.net</span>
                        <h3>Можна додати</h3>
                        <small className="profile-card-note">Вибери гільдійних або інших персонажів, які мають бути в профілі.</small>
                      </div>
                      <div className="profile-candidate-counter" aria-label="Скільки ще доступний список Battle.net">
                        <span className="profile-count-pill" data-profile-candidate-count="true">{availableCandidates.length}</span>
                        {profile.battlenet?.candidateExpiresAt ? <ProfileCandidateExpiryTimer expiresAt={profile.battlenet.candidateExpiresAt} /> : null}
                      </div>
                    </div>
                    <form id={bulkFormId} className="profile-candidate-bulk-form" action="/api/profile/characters/bulk-add" method="post" />
                    <ProfileCandidateBulkActions formId={bulkFormId} count={availableCandidates.length} />
                    <div className="profile-candidate-groups">
                      {availableGuildCandidates.length ? (
                        <section className="profile-candidate-group" aria-label="Кандидати гільдії">
                          <div className="profile-subsection-head profile-subsection-head--compact"><strong>Гільдійні</strong><small>{availableGuildCandidates.length}</small></div>
                          <ul className="profile-character-candidates">
                            {availableGuildCandidates.map((character) => <CandidateRow key={character.key} character={character} bulkFormId={bulkFormId} />)}
                          </ul>
                        </section>
                      ) : null}
                      {availableOtherCandidates.length ? (
                        <section className="profile-candidate-group" aria-label="Інші кандидати">
                          <div className="profile-subsection-head profile-subsection-head--compact"><strong>Інші</strong><small>{availableOtherCandidates.length}</small></div>
                          <ul className="profile-character-candidates">
                            {availableOtherCandidates.map((character) => <CandidateRow key={character.key} character={character} bulkFormId={bulkFormId} />)}
                          </ul>
                        </section>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>

              {canViewPrivateProfileBlocks ? <ProfileRaidSignups items={raidSignups} /> : null}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
