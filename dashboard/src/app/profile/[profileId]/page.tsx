import DashboardIdentity from "@/components/DashboardIdentity";
import ProfileCandidateBulkActions from "@/components/ProfileCandidateBulkActions";
import ProfileNameControls from "@/components/ProfileNameControls";
import { getEnabledBattleNetRegions } from "@/lib/battlenet";
import { BNET_CANDIDATES_COOKIE, parseBattleNetCandidatesCookieValue } from "@/lib/battlenetCandidates";
import { normalizeCharacterKey, pickWowAvatarImageUrl } from "@/lib/wowCharacters";
import {
  listProfileRaidSignups,
  raidDisplayCapacity,
  raidAutoCompositionLabel,
  raidTitle,
  type ProfileRaidSignup,
} from "@/lib/raids";
import { buildPageMetadata } from "@/lib/seo";
import { getGuildNicknamePolicy } from "@/lib/guildNicknamePolicy";
import { resolveWowCharacterRole, wowRoleLabel, type WowCharacterRole } from "@/lib/wowRoles";
import { getSession, type DashboardSession } from "@/lib/auth";
import { resolveAccessGroupFromDiscord } from "@/lib/accessGroups";
import { fetchDiscordGuildMemberSnapshot, fetchDiscordGuildSnapshot, fetchDiscordRoles, hasDiscordEmbedConfig, type DiscordRoleOption } from "@/lib/discordAdmin";
import {
  canViewProfileAccessDetails,
  configuredRoleIdsForDashboardRole,
  dashboardCapabilities,
  dashboardRoleLabel,
  guildStatusLabel,
  siteStatusDescription,
} from "@/lib/permissions";
import {
  buildProfileDiscordNickname,
  canViewProfile,
  profileGenderLabel,
  profileGenderedText,
  getMainCharacter,
  getProfilePublicName,
  getProfileRaidRole,
  getProfileServerStyleName,
  getProfileById,
  profileFromSession,
  upsertProfileFromSession,
  type DashboardProfile,
  type ProfileCharacter,
} from "@/lib/profiles";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";

export const metadata = buildPageMetadata({
  title: "Профіль учасника",
  description: "Особиста сторінка учасника Mistblossom Vanguard з Discord-імʼям, мейн-персонажем, рейдовою роллю та записами на рейди.",
  path: "/profile",
  keywords: ["профіль учасника", "мейн персонаж", "Battle.net", "рейдова роль"],
});

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
      hint: "Потрібно тільки для додавання нових персонажів",
    };
  }
  return {
    eyebrow: "Battle.net не підключено",
    title: "Підключити Battle.net",
    hint: "Знайде гільдійних та інших персонажів Battle.net",
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

function profileAsSession(profile: DashboardProfile): DashboardSession {
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

function ProfileGenderForm({ gender, canManage }: { gender: DashboardProfile["grammaticalGender"]; canManage: boolean }) {
  return (
    <div className="profile-gender-box" aria-label="Стать і звертання в повідомленнях">
      <div className="profile-gender-box__head">
        <span className="profile-gender-box__icon" aria-hidden="true">✦</span>
        <span>
          <strong>Стать / звертання</strong>
          <small>Для особистих повідомлень сайту та Discord</small>
        </span>
        <span className="profile-gender-pill">{profileGenderLabel(gender)}</span>
      </div>

      {canManage ? (
        <form className="profile-gender-form" action="/api/profile/gender" method="post">
          {([
            ["unspecified", "Не вибрано", "дефолт: нейтральні безособові форми множини"],
            ["neutral", "Нейтральне звертання", "тебе записали, підписали"],
            ["nonbinary", "Небінарна особа", "нейтрально: тебе записали, підписали"],
            ["male", "Чоловіча", "ти записаний, підписаний"],
            ["female", "Жіноча", "ти записана, підписана"],
          ] as const).map(([value, label, hint]) => (
            <label className={`profile-gender-option${gender === value ? " is-selected" : ""}`} key={value}>
              <input type="radio" name="grammaticalGender" value={value} defaultChecked={gender === value} />
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </label>
          ))}
          <button className="btn btn-primary btn-sm" type="submit">Зберегти звертання</button>
        </form>
      ) : (
        <p className="profile-card-lead profile-card-lead--compact">Впливає тільки на персональні фрази в інтерфейсі та Discord-відповідях.</p>
      )}
    </div>
  );
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

function characterVisualUrl(character?: Pick<ProfileCharacter, "renderUrl" | "avatarUrl" | "mediaUrl"> | null) {
  if (!character) return null;
  return character.renderUrl || pickWowAvatarImageUrl(character.avatarUrl, character.mediaUrl);
}

function characterAvatarUrl(character?: Pick<ProfileCharacter, "renderUrl" | "avatarUrl" | "mediaUrl"> | null) {
  if (!character) return null;
  return pickWowAvatarImageUrl(character.avatarUrl, character.renderUrl, character.mediaUrl);
}

function characterAuxMeta(character: Pick<ProfileCharacter, "level" | "raceName" | "faction" | "guildName" | "guildStatusLabel" | "guildRank">) {
  return [
    typeof character.level === "number" ? `Lvl ${character.level}` : null,
    character.raceName || null,
    character.faction || null,
    character.guildStatusLabel ? `${character.guildStatusLabel}${typeof character.guildRank === "number" ? ` • ранг ${character.guildRank}` : ""}` : null,
    character.guildName || null,
  ].filter(Boolean);
}

function CharacterArtwork({ character }: { character: ProfileCharacter }) {
  const image = characterVisualUrl(character);
  if (image) {
    return <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }

  return <span className="profile-character-artwork__fallback" aria-hidden="true">{character.name.charAt(0)}</span>;
}

const RAID_ROLE_OPTIONS: { value: "auto" | WowCharacterRole; label: string; hint: string }[] = [
  { value: "auto", label: "Авто", hint: "Брати роль зі спеки мейна" },
  { value: "tank", label: "Танк", hint: "Записувати як танка" },
  { value: "healer", label: "Хіл", hint: "Записувати як хіла" },
  { value: "dps", label: "ДД", hint: "Записувати як ДД" },
];

function characterAutoRaidRole(character?: ProfileCharacter | null): WowCharacterRole {
  return character ? resolveWowCharacterRole({
    className: character.className,
    activeSpecName: character.activeSpecName,
    activeSpecId: character.activeSpecId,
    activeSpecRole: character.activeSpecRole,
  }) : "dps";
}

function RaidRolePreferenceForm({
  mainCharacter,
  manualRole,
  selectedRole,
  canManage,
}: {
  mainCharacter?: ProfileCharacter | null;
  manualRole?: WowCharacterRole | null;
  selectedRole: WowCharacterRole;
  canManage: boolean;
}) {
  const autoRole = characterAutoRaidRole(mainCharacter);
  const sourceLabel = manualRole ? "Вибрано вручну" : "Авто з мейна";
  const mainLabel = mainCharacter
    ? `${mainCharacter.name}${mainCharacter.realmName || mainCharacter.realmSlug ? ` • ${mainCharacter.realmName || mainCharacter.realmSlug}` : ""}`
    : "Мейн не вибрано";

  return (
    <div className="profile-raid-role-box" aria-label="Роль для запису на рейди">
      <div className="profile-raid-role-box__head">
        <span className="profile-raid-role-box__icon" aria-hidden="true">⚔</span>
        <span>
          <strong>Роль у рейді</strong>
          <small>{mainLabel}</small>
        </span>
        <span className={`profile-raid-role-pill profile-raid-role-pill--${selectedRole}`}>
          {wowRoleLabel(selectedRole)}
        </span>
      </div>

      <p className="profile-raid-role-box__note">
        {sourceLabel}: {manualRole ? wowRoleLabel(manualRole) : `${wowRoleLabel(autoRole)} зі спеки мейна`}. Це дефолтна роль саме для мейна; якщо для рейду вибрано іншого персонажа, система бере роль з його спеки.
      </p>

      {canManage && mainCharacter ? (
        <form className="profile-raid-role-form" action="/api/profile/raid-role" method="post">
          {RAID_ROLE_OPTIONS.map((option) => {
            const checked = option.value === "auto" ? !manualRole : manualRole === option.value;
            const hint = option.value === "auto" ? `${option.hint}: ${wowRoleLabel(autoRole)}` : option.hint;
            return (
              <label className={`profile-raid-role-option${checked ? " is-selected" : ""}`} key={option.value}>
                <input type="radio" name="raidRole" value={option.value} defaultChecked={checked} />
                <span>
                  <strong>{option.label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            );
          })}
          <button className="btn btn-primary btn-sm" type="submit">Зберегти роль</button>
        </form>
      ) : canManage ? (
        <div className="profile-empty-characters profile-empty-characters--compact">
          <strong>Спочатку вибери мейна</strong>
          <span>Після цього можна буде вказати роль для рейдів.</span>
        </div>
      ) : null}
    </div>
  );
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
          {character.guildStatusLabel ? <span className={`profile-character-guild-status profile-character-guild-status--${character.guildStatus || "member"}`}>{character.guildStatusLabel}</span> : null}
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
    <article className="panel profile-card profile-card--raids">
      <div className="profile-card-head profile-card-head--inline">
        <div>
          <span className="eyebrow">Рейди</span>
          <h2>Мої записи</h2>
        </div>
        <span className="profile-count-pill">{active.length}</span>
      </div>
      <p className="profile-card-lead">Тут видно активні записи на рейди. За замовчуванням використовується мейн, але для запису можна вибрати будь-якого доданого персонажа.</p>

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
        <small>{realmLabel} • {character.activeSpecName ? `${character.activeSpecName} ` : ""}{character.className || "Клас невідомий"} • {wowRoleLabel(character.activeSpecRole)}{typeof character.itemLevel === "number" ? ` • ilvl ${character.itemLevel}` : ""}{typeof character.level === "number" ? ` • lvl ${character.level}` : ""}{character.guildStatusLabel ? ` • ${character.guildStatusLabel}` : ""}</small>
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
  const showAccessDetails = canViewProfileAccessDetails(viewer);
  const discordMemberReadable = profile.provider === "discord" && /^\d{16,25}$/.test(profile.providerUserId) && hasDiscordEmbedConfig();
  const shouldLoadRoles = hasDiscordEmbedConfig() && showAccessDetails;

  if (shouldLoadRoles) {
    try {
      roles = await fetchDiscordRoles();
    } catch (error) {
      roleLoadError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  const mainCharacter = getMainCharacter(profile);
  const raidRolePreference = profile.raidRolePreference || null;
  const manualRaidRole = raidRolePreference && mainCharacter && raidRolePreference.characterKey === mainCharacter.key
    ? raidRolePreference.role
    : null;
  const selectedRaidRole = getProfileRaidRole(profile);
  const enabledBattleNetRegions = getEnabledBattleNetRegions();
  const canManageCharacters = isOwnProfile;
  const canInspectOtherProfile = !isOwnProfile && showAccessDetails;
  const canViewPrivateProfileBlocks = isOwnProfile || showAccessDetails;
  const addedKeys = new Set(profile.characters.map((item) => normalizeCharacterKey(item.key)).filter(Boolean));
  const candidateCookie = isOwnProfile ? cookieStore.get(BNET_CANDIDATES_COOKIE)?.value : undefined;
  const candidateSession = isOwnProfile ? parseBattleNetCandidatesCookieValue(candidateCookie, profile.profileId) : null;
  const availableCandidates = (candidateSession?.characters || []).filter((item) => !addedKeys.has(normalizeCharacterKey(item.key)));
  const availableGuildCandidates = availableCandidates.filter((item) => item.verifiedGuild);
  const availableOtherCandidates = availableCandidates.filter((item) => !item.verifiedGuild);
  const profileGuildCharacters = profile.characters.filter((item) => item.verifiedGuild);
  const profileOtherCharacters = profile.characters.filter((item) => !item.verifiedGuild);
  const hasFreshBattleNetSession = Boolean(candidateSession && availableCandidates.length);
  const primaryBattleNetRegion = enabledBattleNetRegions[0] || "eu";
  const battleNetAction = battleNetActionCopy(profile, hasFreshBattleNetSession);
  const bulkFormId = "profile-candidate-bulk-add";
  const savedCharacterCount = profile.characters.length;
  const discordNicknamePreview = buildProfileDiscordNickname(profile, nicknamePolicy.template);
  const publicNamePreview = getProfilePublicName(profile, nicknamePolicy.template);
  const serverStyleNamePreview = getProfileServerStyleName(profile, 80, nicknamePolicy.template);
  const canSyncDiscordNickname = isOwnProfile && discordMemberReadable;
  let discordOwnerLocked = false;
  let currentServerNickname: string | null = null;
  let liveDiscordMember: Awaited<ReturnType<typeof fetchDiscordGuildMemberSnapshot>> | null = null;

  if (discordMemberReadable && (showAccessDetails || canSyncDiscordNickname)) {
    const [guild, member] = await Promise.all([
      canSyncDiscordNickname ? fetchDiscordGuildSnapshot().catch(() => null) : Promise.resolve(null),
      fetchDiscordGuildMemberSnapshot(profile.providerUserId).catch(() => null),
    ]);
    liveDiscordMember = member;
    discordOwnerLocked = Boolean(guild?.ownerId && guild.ownerId === profile.providerUserId);
    currentServerNickname = member?.nick || null;
  }

  const liveRoleIds = Array.from(new Set((liveDiscordMember?.roleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean)));
  const liveAccessChecked = Boolean(discordMemberReadable && liveDiscordMember);
  const liveAccessGroup = liveAccessChecked
    ? await resolveAccessGroupFromDiscord(liveRoleIds, profile.providerUserId, discordOwnerLocked ? profile.providerUserId : null).catch(() => null)
    : null;
  const liveDashboardRole = liveAccessGroup?.group.role || null;
  const effectiveProfileRole = liveDashboardRole || profile.role;
  const liveAccessState = liveAccessChecked
    ? liveAccessGroup
      ? "synced"
      : "no-access"
    : discordMemberReadable
      ? "unavailable"
      : "not-discord";
  const liveAccessDescription = liveAccessState === "synced"
    ? liveRoleIds.length
      ? "Ролі й доступ оновлені напряму з Discord-сервера."
      : "Discord-сервер підтвердив профіль без привʼязаних ролей доступу; показано базову групу учасника."
    : liveAccessState === "no-access"
      ? "Discord-сервер не підтвердив жодної групи доступу для цього профілю."
      : liveAccessState === "unavailable"
        ? "Discord-ролі тимчасово недоступні, показано останні збережені дані профілю."
        : "Профіль не привʼязаний до Discord-акаунта.";
  const profileSession: DashboardSession = {
    ...profileAsSession(profile),
    role: effectiveProfileRole,
    discordRoleIds: liveRoleIds.length ? liveRoleIds : profile.discordRoleIds,
    groupId: liveAccessGroup?.group.id || profile.groupId || undefined,
    groupName: liveAccessGroup?.group.name || profile.groupName || undefined,
    groupRank: liveAccessGroup?.group.rank ?? profile.groupRank ?? undefined,
    permissions: liveAccessGroup?.group.permissions,
    isServerOwner: Boolean(liveAccessGroup?.isServerOwner),
  };
  const capabilities = dashboardCapabilities(effectiveProfileRole, profileSession.permissions);
  const visibleCapabilities = showAccessDetails ? capabilities : capabilities.filter((item) => item.enabled && (item.key === "profile" || item.key === "raid-signup"));
  const enabledCount = visibleCapabilities.filter((item) => item.enabled).length;
  const guildStatus = guildStatusLabel(effectiveProfileRole);
  const eligibleGuildCharacters = numberOrNull(profile.battlenet?.guildCharacters) ?? profileGuildCharacters.length;
  const eligibleOtherCharacters = numberOrNull(profile.battlenet?.otherCharacters) ?? profileOtherCharacters.length;
  const roleIdsFromSession: string[] = Array.from(
    new Set<string>((profileSession.discordRoleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean))
  );
  const configuredAccessRoleIds = new Set(liveAccessGroup?.group.discordRoleIds?.length ? liveAccessGroup.group.discordRoleIds : configuredRoleIdsForDashboardRole(effectiveProfileRole));
  const accessRoleIds = configuredAccessRoleIds.size ? roleIdsFromSession.filter((roleId) => configuredAccessRoleIds.has(roleId)) : roleIdsFromSession;
  const accessRoleChips: ProfileRoleChip[] = profileSession.provider === "token"
    ? [{ id: "token", label: "Резервний ключ адміністратора", position: 9999 }]
    : buildRoleChips(accessRoleIds, roles);
  const fallbackAccessChip = !accessRoleChips.length
    ? ({
        id: "access-fallback",
        label: effectiveProfileRole === "member" ? "Доступ через участь на Discord-сервері" : `${dashboardRoleLabel(effectiveProfileRole)}`,
        position: -1,
        muted: true,
      } satisfies ProfileRoleChip)
    : null;
  const raidSignups = canViewPrivateProfileBlocks ? await listProfileRaidSignups(profile).catch(() => []) : [];

  return (
    <main className="container">
      <section className="dashboard-shell content-shell profile-shell" aria-label="Персональна сторінка панелі Mistblossom Vanguard">
        <DashboardIdentity user={viewer} activeSection="profile" />
        <header className="hero panel dashboard-hero profile-hero">
          <div className="hero-copy dashboard-hero__copy profile-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Профіль</div>
            <h1>{isOwnProfile ? "Мій профіль" : "Профіль учасника"}</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">{showAccessDetails ? "Профіль, доступ, ролі Discord і персонажі Battle.net." : canViewPrivateProfileBlocks ? "Ім’я Discord, мейн-персонаж, роль для рейдів і мої записи." : "Публічна картка учасника та привʼязані персонажі гільдії."}</p>
            <div className="profile-hero-strip" aria-label="Короткий стан профілю">
              {showAccessDetails ? (
                <>
                  <span><strong>{guildStatus}</strong><small>Статус</small></span>
                  <span><strong>{enabledCount}/{visibleCapabilities.length}</strong><small>Можливості</small></span>
                  <span><strong>{savedCharacterCount}</strong><small>У профілі</small></span>
                  <span><strong>{statValue(eligibleGuildCharacters)}</strong><small>Гільдійні</small></span>
                  <span><strong>{statValue(eligibleOtherCharacters)}</strong><small>Інші</small></span>
                  <span><strong>{availableCandidates.length}</strong><small>Доступно</small></span>
                  <span><strong>{mainCharacter?.name || "—"}</strong><small>Мейн</small></span>
                </>
              ) : (
                <>
                  <span><strong>{guildStatus}</strong><small>Статус</small></span>
                  <span><strong>{savedCharacterCount}</strong><small>Персонажі</small></span>
                  {canViewPrivateProfileBlocks ? <span><strong>{profileOtherCharacters.length}</strong><small>Інші</small></span> : null}
                  {canViewPrivateProfileBlocks ? <span><strong>{mainCharacter?.name || "—"}</strong><small>Мейн</small></span> : null}
                  {canViewPrivateProfileBlocks ? <span><strong>{wowRoleLabel(selectedRaidRole)}</strong><small>Роль у рейді</small></span> : null}
                  <span><strong>{formatCompactDate(profile.battlenet?.lastSyncAt || mainCharacter?.lastSeenAt)}</strong><small>Оновлено</small></span>
                </>
              )}
            </div>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>{showAccessDetails ? siteStatusDescription(effectiveProfileRole) : canViewPrivateProfileBlocks ? "Особиста панель: профіль, персонажі, рейди та правила." : "Публічний перегляд без рейдових записів, приватних ролей і технічних даних."}</span>
            </div>
            {storageWarning ? <div className="login-alert profile-storage-warning" role="status">{storageWarning}</div> : null}
            {canInspectOtherProfile ? <div className="login-alert profile-storage-warning" role="status">Ти можеш переглядати цей профіль, але змінювати персонажів може тільки власник.</div> : null}
          </div>
        </header>
      <section className="profile-grid" aria-label="Дані доступу">
        <article className="panel profile-card profile-card--identity">
          <div className="profile-card-head">
            <span className="eyebrow">Профіль</span>
            <h2>{showAccessDetails ? "Дані доступу" : "Імʼя та Discord"}</h2>
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
              <ProfileNameControls
                preferredName={profile.preferredName}
                publicNameMode={profile.publicNameMode}
                discordName={profile.displayName}
                publicNamePreview={publicNamePreview}
                serverStyleNamePreview={serverStyleNamePreview}
                nicknamePreview={discordNicknamePreview}
                lastSyncedNickname={profile.discordNickname?.value}
                lastSyncedAt={profile.discordNickname?.syncedAt ? formatCompactDate(profile.discordNickname.syncedAt) : null}
                currentServerNickname={currentServerNickname}
                serverNicknameChecked={Boolean(discordMemberReadable && liveDiscordMember)}
                canManage={isOwnProfile}
                canSyncDiscord={canSyncDiscordNickname}
                discordOwnerLocked={discordOwnerLocked}
              />
              <ProfileGenderForm gender={profile.grammaticalGender} canManage={isOwnProfile} />
              <div className="profile-public-status-card" aria-label="Публічний статус у гільдії">
                <span className="profile-public-status-card__icon" aria-hidden="true">✦</span>
                <span className="profile-public-status-card__body">
                  <small>Статус у гільдії</small>
                  <strong>{guildStatus}</strong>
                  <em>Показується у профілі та списках учасників.</em>
                </span>
              </div>
              {showAccessDetails ? (
                <details className="profile-secret">
                  <summary>Технічний ID</summary>
                  <code>{profile.profileId}</code>
                </details>
              ) : null}
            </div>
          </div>

          {showAccessDetails ? (
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
          ) : null}
        </article>

        {showAccessDetails ? <article className="panel profile-card profile-card--roles">
          <div className="profile-card-head">
            <span className="eyebrow">Discord</span>
            <h2>Роль доступу</h2>
          </div>

          <p className="profile-card-lead">Зверху показані ролі, що дали доступ до панелі. Нижче — решта ролей Discord.</p>

          <div className="profile-access-summary" aria-label="Поточний доступ">
            <span><strong>{dashboardRoleLabel(effectiveProfileRole)}</strong><small>Поточний доступ у панелі</small></span>
            <span><strong>{enabledCount}/{visibleCapabilities.length}</strong><small>Доступно</small></span>
          </div>

          <small className={`profile-warning profile-warning--${liveAccessState}`}>{liveAccessDescription}</small>


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


          {roleIdsFromSession.length && !roles.length && !roleLoadError ? <small className="profile-warning">Назви ролей тимчасово недоступні. Доступ усе одно визначено коректно.</small> : null}
          {roleLoadError ? <small className="profile-warning">Назви Discord-ролей тимчасово недоступні.</small> : null}
        </article> : null}

        <article className="panel profile-card profile-card--characters">
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

          <p className="profile-card-lead">{canViewPrivateProfileBlocks ? "Персонажі діляться на гільдійних та інших. У рейд можна записатися будь-яким доданим персонажем; якщо це не персонаж гільдії, у складі буде позначка 🤝." : "Тут показані тільки привʼязані персонажі учасника. Рейдові записи й приватні налаштування приховані."}</p>

          <div className="profile-bnet-summary" aria-label="Короткий підсумок персонажів">
            <span><strong>{savedCharacterCount}</strong><small>Додано</small></span>
            <span><strong>{profileGuildCharacters.length}</strong><small>Гільдійні</small></span>
            <span><strong>{profileOtherCharacters.length}</strong><small>Інші</small></span>
            {canViewPrivateProfileBlocks ? <span><strong>{mainCharacter?.name || "—"}</strong><small>Мейн</small></span> : null}
            {canViewPrivateProfileBlocks ? <span><strong>{wowRoleLabel(selectedRaidRole)}</strong><small>Роль у рейді</small></span> : null}
            <span><strong>{formatCompactDate(profile.battlenet?.lastSyncAt || mainCharacter?.lastSeenAt)}</strong><small>Оновлено</small></span>
            {canViewPrivateProfileBlocks && availableCandidates.length ? <span><strong>{availableCandidates.length}</strong><small>Можна додати</small></span> : null}
          </div>

          {canViewPrivateProfileBlocks ? <RaidRolePreferenceForm
            mainCharacter={mainCharacter}
            manualRole={manualRaidRole}
            selectedRole={selectedRaidRole}
            canManage={canManageCharacters}
          /> : null}

          {profile.characters.length ? (
            <>
              <div className="profile-character-section-stack">
                <section className="profile-character-section" aria-label="Гільдійні персонажі">
                  <div className="profile-subsection-head">
                    <strong>Гільдійні</strong>
                    <small>{profileGuildCharacters.length}</small>
                  </div>
                  {profileGuildCharacters.length ? (
                    <div className="profile-character-list">
                      {profileGuildCharacters.map((character) => <CharacterCard key={character.key} character={character} canManage={canManageCharacters} showMainBadge={canViewPrivateProfileBlocks} />)}
                    </div>
                  ) : <div className="profile-empty-characters profile-empty-characters--compact"><strong>Гільдійних персонажів немає</strong><span>Можна додати іншого персонажа для рейду, але він буде позначений 🤝.</span></div>}
                </section>
                <section className="profile-character-section" aria-label="Інші персонажі">
                  <div className="profile-subsection-head">
                    <strong>Інші</strong>
                    <small>{profileOtherCharacters.length}</small>
                  </div>
                  {profileOtherCharacters.length ? (
                    <div className="profile-character-list">
                      {profileOtherCharacters.map((character) => <CharacterCard key={character.key} character={character} canManage={canManageCharacters} showMainBadge={canViewPrivateProfileBlocks} />)}
                    </div>
                  ) : <div className="profile-empty-characters profile-empty-characters--compact"><strong>Інших персонажів немає</strong><span>Тут зʼявляться персонажі не з Mistblossom Vanguard.</span></div>}
                </section>
              </div>
            </>
          ) : (
            <div className="profile-empty-characters">
              <strong>Персонажів ще немає</strong>
              <span>{canManageCharacters ? "Підключи Battle.net і додай мейна для рейдів." : "Учасник ще не додав персонажів."}</span>
            </div>
          )}

          {canManageCharacters && hasFreshBattleNetSession ? (
            <div className="profile-candidates-box">
              <div className="profile-card-head profile-card-head--inline">
                <div>
                  <span className="eyebrow">Battle.net</span>
                  <h3>Можна додати</h3>
                  <small className="profile-card-note">Вибери гільдійних або інших персонажів, які мають бути в профілі.</small>
                </div>
                <span className="profile-count-pill">{availableCandidates.length}</span>
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

        {showAccessDetails ? <article className="panel profile-card profile-card--capabilities">
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Можливості</span>
              <h2>Доступні дії</h2>
            </div>
            <span className="profile-count-pill">{enabledCount}/{visibleCapabilities.length}</span>
          </div>

          <ul className="profile-capabilities-list">
            {visibleCapabilities.map((capability) => (
              <CapabilityRow
                key={capability.key}
                title={capability.title}
                description={capability.description}
                enabled={capability.enabled}
              />
            ))}
          </ul>
        </article> : null}
      </section>
      </section>
    </main>
  );
}
