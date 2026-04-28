import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import DiscordEmbedEditor from "@/components/DiscordEmbedEditor";
import { getSession } from "@/lib/auth";
import { defaultRulesEmbed, prettyDiscordJson } from "@/lib/discordEmbedDefaults";
import {
  fetchDiscordEditableMessage,
  fetchDiscordRoles,
  fetchDiscordTextChannels,
  hasDiscordEmbedConfig,
  parseDiscordMessageRef,
} from "@/lib/discordAdmin";
import { getOwnProfilePath } from "@/lib/profiles";
import { canManageRulesEmbeds } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditDiscordRulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  if (!canManageRulesEmbeds(user)) redirect(await getOwnProfilePath(user));

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  const messageParam = String(params.message || params.url || "").trim();
  let configError = "";
  let channels: Array<{ id: string; name: string; type: number }> = [];
  let roles: Array<{ id: string; name: string; color: number; position: number; managed: boolean }> = [];
  let suggestedRulesChannelId = "";
  let embedJson = prettyDiscordJson(defaultRulesEmbed);
  let content = "";
  let messageLink = messageParam;
  let selectedRoleIds: string[] = [];

  if (isAdmin && hasDiscordEmbedConfig()) {
    try {
      const [channelData, roleData] = await Promise.all([fetchDiscordTextChannels(), fetchDiscordRoles()]);
      channels = channelData.channels;
      roles = roleData;
      suggestedRulesChannelId = channelData.suggestedRulesChannelId || channels[0]?.id || "";

      const ref = parseDiscordMessageRef(messageParam);
      if (ref) {
        const message = await fetchDiscordEditableMessage(ref);
        embedJson = message.embedJson || embedJson;
        content = message.content;
        messageLink = message.url || messageParam;
        suggestedRulesChannelId = message.channelId || suggestedRulesChannelId;
        selectedRoleIds = message.roleIds;
        if (!message.isRules) {
          configError = "Це повідомлення не схоже на rules embed із кнопками цієї панелі.";
        }
      } else if (messageParam) {
        configError = "Посилання на Discord-повідомлення невалідне.";
      }
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  return (
    <main className="container">
      <section className="dashboard-shell content-shell discord-shell" aria-label="Редагування Discord правил Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="discord" />
        <header className="discord-editor-header panel">
          <div>
            <span className="eyebrow">Rules embed • Редагування</span>
            <h1>Редагування правил</h1>
            <p>Онови rules embed зі списку або через message link. Канал, embed і ролі розділені окремо.</p>
          </div>
          <a className="btn subtle" href="/discord/rules">До списку</a>
        </header>
      </section>

      {params.error ? <div className="notice panel error-note discord-notice">{params.error}</div> : null}

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки гільдмайстеру.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.</div>
      ) : configError && !messageParam ? (
        <div className="notice panel error-note">{configError}</div>
      ) : channels.length === 0 || roles.length === 0 ? (
        <div className="notice panel error-note">Не знайдено текстових каналів або ролей для вибору.</div>
      ) : (
        <>
          {configError ? <div className="notice panel error-note">{configError}</div> : null}
          <DiscordEmbedEditor
            mode="rules"
            editorMode="edit"
            channels={channels}
            roles={roles}
            suggestedChannelId={suggestedRulesChannelId}
            defaultEmbedJson={embedJson}
            defaultContent={content}
            defaultMessageLink={messageLink}
            selectedRoleIds={selectedRoleIds}
            returnTo="/discord/rules"
          />
        </>
      )}
    </main>
  );
}
