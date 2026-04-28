import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import {
  fetchDiscordRaidRulesSignups,
  fetchDiscordRoles,
  fetchDiscordRulesStats,
  fetchDiscordTextChannels,
  hasDiscordEmbedConfig,
  listRulesEmbedMessages,
  type DiscordEditableMessage,
  type DiscordRaidRulesSignupsResponse,
  type DiscordRoleOption,
  type DiscordRulesStats,
} from "@/lib/discordAdmin";
import { getOwnProfilePath } from "@/lib/profiles";
import { canManageRulesEmbeds } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function StatusNotice({ params }: { params: Record<string, string | undefined> }) {
  if (params.published) {
    return <div className="notice panel success discord-notice">Опубліковано правила: <a href={params.published} target="_blank" rel="noreferrer">відкрити</a></div>;
  }
  if (params.updated) {
    return <div className="notice panel success discord-notice">Оновлено правила: <a href={params.updated} target="_blank" rel="noreferrer">відкрити</a></div>;
  }
  if (params.error) return <div className="notice panel error-note discord-notice">{params.error}</div>;
  return null;
}

function roleName(roleId: string, roles: DiscordRoleOption[]) {
  return roles.find((role) => role.id === roleId)?.name || `Невідома роль · ${roleId.slice(-6)}`;
}

function roleColor(roleId: string, roles: DiscordRoleOption[]) {
  const color = Number(roles.find((role) => role.id === roleId)?.color || 0);
  if (!Number.isFinite(color) || color <= 0) return "#B8E986";
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(color))).toString(16).padStart(6, "0")}`;
}

function shortDiscordUrl(url: string) {
  return url.replace(/^https?:\/\/discord(?:app)?\.com\/channels\//i, "discord / ");
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "ще немає";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "невідома дата" : date.toLocaleString("uk-UA");
}

function RulesStatsPanel({ stats, messagesCount, channelName }: { stats: DiscordRulesStats; messagesCount: number; channelName: string }) {
  const updatedLabel = formatUpdatedAt(stats.updatedAt);
  const statsHint = stats.configured
    ? `Облік активний • останнє оновлення: ${updatedLabel}`
    : (stats.error || "Онови Worker і додай KV binding RULES_STATS.");

  return (
    <section className="discord-rules-stats-grid" aria-label="Статистика правил">
      <article className="panel discord-rules-stat-card discord-rules-stat-card--accepted">
        <span className="eyebrow">Прийняли</span>
        <strong>{stats.configured ? stats.accepted : "—"}</strong>
        <small>користувачів прийняли правила</small>
      </article>
      <article className="panel discord-rules-stat-card discord-rules-stat-card--declined">
        <span className="eyebrow">Відмовились</span>
        <strong>{stats.configured ? stats.declined : "—"}</strong>
        <small>користувачів відмовились</small>
      </article>
      <article className="panel discord-rules-stat-card">
        <span className="eyebrow">Повідомлення</span>
        <strong>{messagesCount}</strong>
        <small>embed-повідомлень у #{channelName}</small>
      </article>
      <article className="panel discord-rules-stat-card discord-rules-stat-card--wide">
        <span className="eyebrow">Статистика</span>
        <strong>{stats.configured ? stats.total : "KV не підключено"}</strong>
        <small>{statsHint}</small>
      </article>
    </section>
  );
}


function characterLabel(signup: DiscordRaidRulesSignupsResponse["signups"][number]) {
  const character = signup.mainCharacter || null;
  const name = String(character?.name || "").trim();
  const realm = String(character?.realmName || character?.realmSlug || "").trim();
  if (!name) return "Main не знайдено";
  return realm ? `${name} • ${realm}` : name;
}

function signedAtLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "невідомо" : date.toLocaleString("uk-UA");
}

function RaidRulesSignupsPanel({ signups }: { signups: DiscordRaidRulesSignupsResponse }) {
  const updatedLabel = formatUpdatedAt(signups.updatedAt);
  const hint = signups.configured
    ? `Останнє оновлення: ${updatedLabel}`
    : (signups.error || "Онови Worker і додай endpoint /api/discord-raid-rules-signups з KV RULES_STATS.");

  return (
    <section className="panel discord-raid-signups-panel" aria-label="Підписанти правил рейду">
      <div className="content-section-head content-section-head--toolbar">
        <div>
          <span className="eyebrow">Raid rules</span>
          <h2>Хто підписався на правила рейду</h2>
        </div>
        <div className="content-toolbar-actions">
          <small>{signups.configured ? `${signups.total} підписантів` : "KV не підключено"}</small>
          <a className="btn subtle" href="/discord/rules/new?type=raid">Додати правила рейду</a>
        </div>
      </div>

      <p className="discord-raid-signups-hint">{hint}</p>

      {!signups.configured ? (
        <div className="notice error-note">Список підписантів недоступний: {signups.error || "немає налаштування Worker/KV."}</div>
      ) : signups.signups.length === 0 ? (
        <div className="content-empty discord-empty-state">
          <strong>Підписантів ще немає.</strong>
          <span>Коли користувач натисне кнопку під рейдовими правилами, бот запише Discord і main-персонажа сюди.</span>
        </div>
      ) : (
        <div className="discord-raid-signups-table" role="table" aria-label="Список підписантів рейдових правил">
          <div className="discord-raid-signups-row discord-raid-signups-row--head" role="row">
            <span role="columnheader">Discord</span>
            <span role="columnheader">Main персонаж</span>
            <span role="columnheader">Підпис</span>
          </div>
          {signups.signups.map((signup) => (
            <div className="discord-raid-signups-row" role="row" key={signup.discordId}>
              <span role="cell">
                <strong>{signup.discordName || "Discord user"}</strong>
                <small>{signup.discordId}</small>
              </span>
              <span role="cell">
                {signup.mainCharacter?.profileUrl ? (
                  <a href={signup.mainCharacter.profileUrl} target="_blank" rel="noreferrer">{characterLabel(signup)}</a>
                ) : (
                  <strong>{characterLabel(signup)}</strong>
                )}
                {signup.mainCharacter?.className ? <small>{signup.mainCharacter.className}</small> : null}
              </span>
              <span role="cell"><time dateTime={signup.signedAt || undefined}>{signedAtLabel(signup.signedAt)}</time></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RulesRoleBadges({ roleIds, roles }: { roleIds: string[]; roles: DiscordRoleOption[] }) {
  const uniqueRoleIds = Array.from(new Set(roleIds.filter(Boolean)));

  if (uniqueRoleIds.length === 0) {
    return <span className="discord-rules-role-empty">Ролі не задані</span>;
  }

  return (
    <span className="discord-rules-role-badges" aria-label="Активні ролі, які видають правила">
      {uniqueRoleIds.map((roleId) => (
        <span className="discord-rules-role-chip" key={roleId} title={roleName(roleId, roles)}>
          <span className="discord-role-dot" style={{ backgroundColor: roleColor(roleId, roles) }} />
          {roleName(roleId, roles)}
        </span>
      ))}
    </span>
  );
}

function RulesRow({ message, roles }: { message: DiscordEditableMessage; roles: DiscordRoleOption[] }) {
  const stateLabel = message.editedAt ? "Оновлено" : "Створено";
  const isRaidRules = message.rulesType === "raid";

  return (
    <article className="discord-rules-row" role="listitem">
      <a className="discord-rules-row-main" href={`/discord/rules/edit?message=${encodeURIComponent(message.url)}`}>
        <span className="discord-rules-row-icon" aria-hidden="true">{isRaidRules ? "🐉" : "🌸"}</span>
        <span className="discord-rules-row-title">
          <strong>{message.title}</strong>
          <small>{shortDiscordUrl(message.url)}</small>
        </span>
        <span className="discord-rules-row-meta">
          <span className="discord-rules-row-state">
            <time dateTime={message.editedAt || message.createdAt || undefined}>{stateLabel}</time>
          </span>
          <span className="discord-rules-row-roles-label">{isRaidRules ? "Тип" : "Видає ролі"}</span>
          {isRaidRules ? <span className="discord-rules-role-empty">Підпис на рейд</span> : <RulesRoleBadges roleIds={message.roleIds} roles={roles} />}
        </span>
      </a>
      <div className="discord-rules-row-actions">
        <a className="btn subtle" href={message.url} target="_blank" rel="noreferrer">Discord</a>
        <a className="btn primary" href={`/discord/rules/edit?message=${encodeURIComponent(message.url)}`}>Редагувати</a>
      </div>
    </article>
  );
}

export default async function DiscordRulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  if (!canManageRulesEmbeds(user)) redirect(await getOwnProfilePath(user));

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  let configError = "";
  let rulesChannelName = "rules";
  let messages: DiscordEditableMessage[] = [];
  let roles: DiscordRoleOption[] = [];
  let stats: DiscordRulesStats = { accepted: 0, declined: 0, total: 0, updatedAt: null, configured: false, source: "unconfigured" };
  let raidSignups: DiscordRaidRulesSignupsResponse = { configured: false, total: 0, updatedAt: null, source: "unconfigured", signups: [] };

  if (isAdmin && hasDiscordEmbedConfig()) {
    try {
      const [channelData, roleData, statsData, raidSignupsData] = await Promise.all([fetchDiscordTextChannels(), fetchDiscordRoles(), fetchDiscordRulesStats(), fetchDiscordRaidRulesSignups()]);
      const rulesChannel = channelData.channels.find((channel) => channel.id === channelData.suggestedRulesChannelId) || channelData.channels[0];
      roles = roleData;
      stats = statsData;
      raidSignups = raidSignupsData;
      rulesChannelName = rulesChannel?.name || "rules";
      messages = rulesChannel?.id ? await listRulesEmbedMessages(rulesChannel.id, 100) : [];
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  return (
    <main className="container">
      <section className="dashboard-shell content-shell discord-shell" aria-label="Список Discord правил Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="discord" />
        <header className="hero panel dashboard-hero content-dashboard-hero discord-dashboard-hero discord-dashboard-hero--rules-list">
          <div className="hero-copy dashboard-hero__copy content-dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Rules embed</div>
            <div className="content-hero-status-row">
              <span className="content-mode-pill content-mode-pill--library">Правила</span>
              <span className="content-hero-path">#{rulesChannelName} • тільки embed з rule buttons</span>
            </div>
            <h1>Правила Discord</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Список rule embed-повідомлень, статистика і швидке редагування правил.</p>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>Канал можна змінити під час створення або редагування.</span>
              <div className="content-hero-buttons">
                <a className="btn primary content-add-btn" href="/discord/rules/new">Додати правила</a>
                <a className="btn subtle content-add-btn" href="/discord/rules/new?type=raid">Правила рейду</a>
                <a className="btn subtle content-add-btn" href="/discord">Назад</a>
              </div>
            </div>
          </div>
        </header>
      </section>

      <StatusNotice params={params} />

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки гільдмайстеру.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.</div>
      ) : configError ? (
        <div className="notice panel error-note">Discord API не повернув дані: {configError}</div>
      ) : (
        <>
          <RulesStatsPanel stats={stats} messagesCount={messages.length} channelName={rulesChannelName} />
          <RaidRulesSignupsPanel signups={raidSignups} />

          <section className="panel discord-rules-list-panel" aria-label="Rules embeds">
            <div className="content-section-head content-section-head--toolbar">
              <div>
                <span className="eyebrow">Rules library</span>
                <h2>Список embed-правил</h2>
              </div>
              <div className="content-toolbar-actions">
                <small>{messages.length} знайдено</small>
                <a className="btn subtle" href="/discord/rules/new?type=raid">Рейд</a>
                <a className="btn primary" href="/discord/rules/new">Додати</a>
              </div>
            </div>

            {messages.length === 0 ? (
              <div className="content-empty discord-empty-state">
                <strong>Правила з кнопками не знайдено.</strong>
                <span>Це нормально, якщо ще нічого не публікували через панель або бот не має Read Message History у каналі правил.</span>
                <a className="btn primary" href="/discord/rules/new">Створити перший embed</a>
              </div>
            ) : (
              <div className="discord-rules-table" role="list">
                {messages.map((message) => <RulesRow key={message.id} message={message} roles={roles} />)}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
