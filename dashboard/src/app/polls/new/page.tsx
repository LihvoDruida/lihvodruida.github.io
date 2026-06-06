import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { getOwnProfilePath } from "@/lib/profiles";
import { fetchDiscordTextChannels, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { hasRaidPollStorage } from "@/lib/raidPolls";
import { RaidPollCreateForm, RaidPollPageShell } from "@/components/RaidPollViews";
import { buildPageMetadata } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Створення рейд-пулу",
  description: "Створення Discord-голосування за доступність учасників рейду через сайт Mistblossom Vanguard.",
  path: "/polls/new",
  keywords: ["створити рейд-пул", "Discord голосування", "рейдовий пул"],
});

export default async function NewPollPage() {
  const user = await getSession();
  if (!user) {
    redirect("/login");
    throw new Error("Login required");
  }
  if (!canManageRaids(user)) redirect(await getOwnProfilePath(user));

  const discordEnabled = hasDiscordEmbedConfig();
  const channelResult = discordEnabled ? await fetchDiscordTextChannels().catch(() => null) : null;
  const channels = channelResult?.channels || [];

  return (
    <RaidPollPageShell
      user={user}
      title="Створення рейд-пулу"
      description="Заповни назву, складність і час закриття. Після збереження сайт створить запис у Firebase та опублікує Discord-повідомлення."
    >
      {!hasRaidPollStorage() ? <div className="notice panel error-note raid-notice">Firebase для рейд-пулів не налаштований.</div> : null}
      {!discordEnabled ? <div className="notice panel error-note raid-notice">Discord-публікація недоступна: перевір bot token або worker relay.</div> : null}
      {channelResult?.warning ? <div className="notice panel warning-note raid-notice">Список каналів прочитано з попередженням: {channelResult.warning}</div> : null}
      <section className="raid-poll-create-layout" aria-label="Створення рейд-пулу">
        <RaidPollCreateForm channels={channels} discordEnabled={discordEnabled && hasRaidPollStorage()} />
        <aside className="panel raid-poll-help-card">
          <div className="raid-poll-help-card__head">
            <span className="eyebrow">Логіка роботи</span>
            <h2>Сайт створює, Discord збирає голоси</h2>
          </div>
          <p>Команди Discord для створення немає. Ця сторінка створює пул, бот публікує embed і приймає вибір учасників.</p>
          <div className="raid-poll-help-steps">
            <span>1. Дні вибираються multi-select меню.</span>
            <span>2. Час вибирається окремим dropdown.</span>
            <span>3. Новий вибір замінює попередній голос користувача.</span>
            <span>4. Після дедлайну components вимикаються, а embed показує фінальний результат.</span>
          </div>
          <div className="raid-poll-help-actions">
            <a className="btn subtle" href="/discord">Discord Hub</a>
            <a className="btn subtle" href="/polls">Усі пули</a>
          </div>
        </aside>
      </section>
    </RaidPollPageShell>
  );
}
