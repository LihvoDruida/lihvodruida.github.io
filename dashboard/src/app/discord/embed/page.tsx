import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import DiscordEmbedEditor from "@/components/DiscordEmbedEditor";
import { getSession } from "@/lib/auth";
import { canManageGeneralEmbeds } from "@/lib/permissions";
import { defaultGeneralEmbed, prettyDiscordJson } from "@/lib/discordEmbedDefaults";
import {
  fetchDiscordEditableMessage,
  fetchDiscordRoles,
  fetchDiscordTextChannels,
  hasDiscordEmbedConfig,
  parseDiscordMessageRef,
} from "@/lib/discordAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function StatusNotice({ params }: { params: Record<string, string | undefined> }) {
  if (params.published) return <div className="notice panel success discord-notice">Опубліковано embed: <a href={params.published} target="_blank" rel="noreferrer">відкрити</a></div>;
  if (params.updated) return <div className="notice panel success discord-notice">Оновлено embed: <a href={params.updated} target="_blank" rel="noreferrer">відкрити</a></div>;
  if (params.error) return <div className="notice panel error-note discord-notice">{params.error}</div>;
  return null;
}

export default async function GeneralDiscordEmbedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const canUseGeneralEmbeds = canManageGeneralEmbeds(user);
  const messageParam = String(params.message || params.url || "").trim();
  const editMode = Boolean(messageParam);
  let configError = "";
  let channels: Array<{ id: string; name: string; type: number }> = [];
  let roles: Array<{ id: string; name: string; color: number; position: number; managed: boolean }> = [];
  let suggestedChannelId = "";
  let embedJson = prettyDiscordJson(defaultGeneralEmbed);
  let content = "";
  let messageLink = messageParam;
  let selectedRoleIds: string[] = [];

  if (canUseGeneralEmbeds && hasDiscordEmbedConfig()) {
    try {
      const [channelData, roleData] = await Promise.all([fetchDiscordTextChannels(), fetchDiscordRoles().catch(() => [])]);
      channels = channelData.channels;
      roles = roleData;
      suggestedChannelId = channels[0]?.id || channelData.suggestedRulesChannelId || "";

      const ref = parseDiscordMessageRef(messageParam);
      if (ref) {
        const message = await fetchDiscordEditableMessage(ref);
        embedJson = message.embedJson || embedJson;
        content = message.content;
        messageLink = message.url || messageParam;
        suggestedChannelId = message.channelId || suggestedChannelId;
        selectedRoleIds = message.roleIds;
      } else if (messageParam) {
        configError = "Посилання на Discord-повідомлення невалідне.";
      }
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  return (
    <main className="container">
      <section className="dashboard-shell content-shell discord-shell" aria-label="Звичайний Discord embed Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="discord" />
        <header className="discord-editor-header panel">
          <div>
            <span className="eyebrow">General embed • {editMode ? "Edit" : "Create"}</span>
            <h1>{editMode ? "Редагування embed" : "Звичайна відправка embed"}</h1>
            <p>Окрема сторінка для будь-яких embed-публікацій у стилі сайту: title, description, media, author, footer, fields і колір редагуються окремими полями без ручного JSON.</p>
          </div>
          <a className="btn subtle" href="/discord">Назад</a>
        </header>
      </section>

      <StatusNotice params={params} />

      {!canUseGeneralEmbeds ? (
        <div className="notice panel">Ця сторінка доступна гільдмайстеру та офіцерам.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.</div>
      ) : configError && !messageParam ? (
        <div className="notice panel error-note">{configError}</div>
      ) : channels.length === 0 ? (
        <div className="notice panel error-note">Не знайдено текстових каналів для вибору.</div>
      ) : (
        <>
          {configError ? <div className="notice panel error-note">{configError}</div> : null}
          <DiscordEmbedEditor
            mode="general"
            editorMode={editMode ? "edit" : "create"}
            channels={channels}
            roles={roles}
            suggestedChannelId={suggestedChannelId}
            defaultEmbedJson={embedJson}
            defaultContent={content}
            defaultMessageLink={messageLink}
            selectedRoleIds={selectedRoleIds}
            returnTo="/discord/embed"
          />
        </>
      )}
    </main>
  );
}
