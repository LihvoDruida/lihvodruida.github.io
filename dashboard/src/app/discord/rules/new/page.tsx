import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import DiscordEmbedEditor from "@/components/DiscordEmbedEditor";
import { getSession } from "@/lib/auth";
import { defaultRaidRulesEmbed, defaultRulesEmbed, prettyDiscordJson } from "@/lib/discordEmbedDefaults";
import { fetchDiscordRoles, fetchDiscordTextChannels, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { getOwnProfilePath } from "@/lib/profiles";
import { canManageRulesEmbeds } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewDiscordRulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  if (!canManageRulesEmbeds(user)) redirect(await getOwnProfilePath(user));

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  const ruleType = String(params.type || params.ruleType || "guild") === "raid" ? "raid" : "guild";
  const defaultEmbed = ruleType === "raid" ? defaultRaidRulesEmbed : defaultRulesEmbed;
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
            <span className="eyebrow">Правила • Створення</span>
            <h1>{ruleType === "raid" ? "Нові правила рейду" : "Нові правила Discord"}</h1>
            <p>{ruleType === "raid" ? "Створи рейдові правила з кнопкою підпису та перевіркою main-персонажа." : "Створи повідомлення правил, вибери канал і ролі для кнопки прийняття."}</p>
          </div>
          <a className="btn subtle" href="/discord/rules">До списку</a>
        </header>
      </section>

      {params.error ? <div className="notice panel error-note discord-notice">{params.error}</div> : null}

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки гільдмайстеру.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Discord-бот ще не підключений до панелі.</div>
      ) : configError ? (
        <div className="notice panel error-note">Не вдалося отримати дані Discord. Спробуй оновити сторінку.</div>
      ) : channels.length === 0 || (ruleType === "guild" && roles.length === 0) ? (
        <div className="notice panel error-note">Не знайдено текстових каналів або ролей для вибору.</div>
      ) : (
        <DiscordEmbedEditor
          mode="rules"
          ruleType={ruleType}
          editorMode="create"
          channels={channels}
          roles={roles}
          suggestedChannelId={suggestedRulesChannelId}
          defaultEmbedJson={prettyDiscordJson(defaultEmbed)}
          returnTo="/discord/rules"
        />
      )}
    </main>
  );
}
