import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import {
  fetchDiscordRoles,
  fetchDiscordTextChannels,
  hasDiscordEmbedConfig,
  listRulesEmbedMessages,
  type DiscordEditableMessage,
  type DiscordRoleOption,
} from "@/lib/discordAdmin";

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
  return roles.find((role) => role.id === roleId)?.name || roleId;
}

function RulesRow({ message, roles }: { message: DiscordEditableMessage; roles: DiscordRoleOption[] }) {
  return (
    <article className="discord-rules-row" role="listitem">
      <a className="discord-rules-row-main" href={`/discord/rules/edit?message=${encodeURIComponent(message.url)}`}>
        <span className="discord-rules-row-icon" aria-hidden="true">🌸</span>
        <span className="discord-rules-row-title">
          <strong>{message.title}</strong>
          <small>{message.url}</small>
        </span>
        <span className="discord-rules-row-meta">
          <time dateTime={message.editedAt || message.createdAt || undefined}>{message.editedAt ? "Оновлено" : "Створено"}</time>
          <small>{message.roleIds.length ? message.roleIds.map((id) => roleName(id, roles)).join(", ") : "Без ролей"}</small>
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

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  let configError = "";
  let rulesChannelName = "rules";
  let messages: DiscordEditableMessage[] = [];
  let roles: DiscordRoleOption[] = [];

  if (isAdmin && hasDiscordEmbedConfig()) {
    try {
      const [channelData, roleData] = await Promise.all([fetchDiscordTextChannels(), fetchDiscordRoles()]);
      const rulesChannel = channelData.channels.find((channel) => channel.id === channelData.suggestedRulesChannelId) || channelData.channels[0];
      roles = roleData;
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
            <div className="eyebrow">Mistblossom Vanguard • Rules embeds</div>
            <div className="content-hero-status-row">
              <span className="content-mode-pill content-mode-pill--library">Правила</span>
              <span className="content-hero-path">#{rulesChannelName} • тільки embed з rule buttons</span>
            </div>
            <h1>Правила Discord</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Тут показуються лише повідомлення правил з кнопками “Прийняти правила” та “Відмовитися”. Для додавання або редагування відкривається окрема сторінка у стилі embed builder.</p>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>Пошук бере рекомендований rules-канал або перший канал з назвою rules/правила.</span>
              <div className="content-hero-buttons">
                <a className="btn primary content-add-btn" href="/discord/rules/new">Додати правила</a>
                <a className="btn subtle content-add-btn" href="/discord">Назад</a>
              </div>
            </div>
          </div>
        </header>
      </section>

      <StatusNotice params={params} />

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки адміністраторам.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.</div>
      ) : configError ? (
        <div className="notice panel error-note">Discord API не повернув дані: {configError}</div>
      ) : (
        <section className="panel discord-rules-list-panel" aria-label="Rules embeds">
          <div className="content-section-head content-section-head--toolbar">
            <div>
              <span className="eyebrow">Rules library</span>
              <h2>Список embed-правил</h2>
            </div>
            <div className="content-toolbar-actions">
              <small>{messages.length} знайдено</small>
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
      )}
    </main>
  );
}
