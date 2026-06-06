import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageRaids, canViewRaidDirectory } from "@/lib/permissions";
import { getOwnProfilePath } from "@/lib/profiles";
import { hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { hasRaidPollStorage, listRaidPolls } from "@/lib/raidPolls";
import { RaidPollListCard, RaidPollPageShell } from "@/components/RaidPollViews";
import { buildPageMetadata } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Рейд-пули",
  description: "Голосування за доступність гравців для рейдів Mistblossom Vanguard із Discord та сайтом.",
  path: "/polls",
  keywords: ["рейд-пул", "голосування рейдів", "Discord голосування"],
});

export default async function PollsPage() {
  const user = await getSession();
  if (!user) {
    redirect("/login");
    throw new Error("Login required");
  }
  if (!canViewRaidDirectory(user)) redirect(await getOwnProfilePath(user));

  const canManage = canManageRaids(user);
  const polls = await listRaidPolls(120).catch(() => []);
  const openPolls = polls.filter((poll) => poll.status === "open");
  const closedPolls = polls.filter((poll) => poll.status === "closed");

  return (
    <RaidPollPageShell
      user={user}
      title="Рейд-пули"
      description="Активні та архівні голосування за дні й час рейду. Створення тільки через сайт, голосування — через Discord."
    >
      {!hasRaidPollStorage() ? <div className="notice panel error-note raid-notice">Рейд-пули тимчасово недоступні: Firebase не налаштований.</div> : null}
      {canManage && !hasDiscordEmbedConfig() ? <div className="notice panel error-note raid-notice">Публікація рейд-пулів у Discord недоступна: не налаштовано bot token або worker relay.</div> : null}

      <section className="panel raid-list-page-panel">
        <div className="raid-list-page-head">
          <div>
            <h2>Активні голосування</h2>
            <p>Відкриті рейд-пули, де учасники ще можуть змінювати свої відповіді.</p>
            <div className="raid-list-summary" aria-label="Статистика рейд-пулів">
              <span>Активні: {openPolls.length}</span>
              <span>Архів: {closedPolls.length}</span>
              <span>Усього: {polls.length}</span>
            </div>
          </div>
          {canManage ? <a className="btn primary" href="/polls/new">＋ Створити рейд-пул</a> : null}
        </div>
        <div className="raid-manager-list">
          {openPolls.length ? openPolls.map((poll) => <RaidPollListCard key={poll.id} poll={poll} canManage={canManage} />) : <p className="raid-empty">Активних рейд-пулів поки немає.</p>}
        </div>
      </section>

      <section className="panel raid-list-page-panel raid-list-page-panel--archive">
        <div className="raid-list-page-head raid-list-page-head--archive">
          <div>
            <h2>Архівні голосування</h2>
            <p>Закриті рейд-пули з фінальними результатами та списком учасників.</p>
          </div>
        </div>
        <div className="raid-manager-list raid-manager-list--archive">
          {closedPolls.length ? closedPolls.map((poll) => <RaidPollListCard key={poll.id} poll={poll} canManage={canManage} />) : <p className="raid-empty">Архів порожній.</p>}
        </div>
      </section>
    </RaidPollPageShell>
  );
}
