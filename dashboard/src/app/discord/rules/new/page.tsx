import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import DiscordEmbedEditor from "@/components/DiscordEmbedEditor";
import { getSession } from "@/lib/auth";
import { defaultRulesEmbed, prettyDiscordJson } from "@/lib/discordEmbedDefaults";
import { fetchDiscordRoles, fetchDiscordTextChannels, hasDiscordEmbedConfig } from "@/lib/discordAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewDiscordRulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  let configError = "";
  let channels: Array<{ id: string; name: string; type: number }> = [];
  let roles: Array<{ id: string; name: string; color: number; position: number; managed: boolean }> = [];
  let suggestedRulesChannelId = "";

  if (isAdmin && hasDiscordEmbedConfig()) {
    try {
      const [channelData, roleData] = await Promise.all([fetchDiscordTextChannels(), fetchDiscordRoles()]);
      channels = channelData.channels;
      roles = roleData;
      suggestedRulesChannelId = channelData.suggestedRulesChannelId || channels[0]?.id || "";
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  return (
    <main className="container">
      <section className="dashboard-shell content-shell discord-shell" aria-label="Створення Discord правил Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="discord" />
        <header className="discord-editor-header panel">
          <div>
            <span className="eyebrow">Rules embed • Create</span>
            <h1>Нові правила Discord</h1>
            <p>Сторінка створення правил у стилі сайту: усі параметри embed редагуються окремими полями, колір можна вибрати або вставити кодом #B8E986, ролі — внизу.</p>
          </div>
          <a className="btn subtle" href="/discord/rules">До списку</a>
        </header>
      </section>

      {params.error ? <div className="notice panel error-note discord-notice">{params.error}</div> : null}

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки гільдмайстеру.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.</div>
      ) : configError ? (
        <div className="notice panel error-note">Discord API не повернув дані: {configError}</div>
      ) : channels.length === 0 || roles.length === 0 ? (
        <div className="notice panel error-note">Не знайдено текстових каналів або ролей для вибору.</div>
      ) : (
        <DiscordEmbedEditor
          mode="rules"
          editorMode="create"
          channels={channels}
          roles={roles}
          suggestedChannelId={suggestedRulesChannelId}
          defaultEmbedJson={prettyDiscordJson(defaultRulesEmbed)}
          returnTo="/discord/rules"
        />
      )}
    </main>
  );
}
