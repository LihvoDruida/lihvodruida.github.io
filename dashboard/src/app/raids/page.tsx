import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { hasRaidStorage, isRaidClosed, listRaids } from "@/lib/raids";
import { RaidListCard, RaidPageShell, StatusNotice } from "@/components/RaidViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RaidsListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!canManageRaids(user)) redirect("/profile");

  const params = await searchParams;
  if (params.raid) redirect(`/raids/${encodeURIComponent(params.raid)}`);

  const raids = await listRaids(100);
  const activeRaids = raids.filter((raid) => raid.status === "published" && !isRaidClosed(raid));
  const draftRaids = raids.filter((raid) => raid.status === "draft");
  const closedRaids = raids.filter((raid) => isRaidClosed(raid));
  const currentRaids = [...activeRaids, ...draftRaids];

  return (
    <RaidPageShell
      user={user}
      title="Рейди"
      description="Список рейдів для керування оголошеннями, складом, лімітами та записами. Минулі рейди закриваються автоматично й залишаються в архіві до ручного видалення."
    >
      <StatusNotice params={params} />
      {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Збереження рейдів тимчасово недоступне. Перевір налаштування панелі.</div> : null}
      {!hasDiscordEmbedConfig() ? <div className="notice panel error-note raid-notice">Публікація в Discord тимчасово недоступна. Чернетки можна переглядати локально.</div> : null}

      <section className="panel raid-list-page-panel">
        <div className="raid-list-page-head">
          <div>
            <h2>Поточні рейди</h2>
            <p>Активні рейди та чернетки. Закриті рейди винесені в окремий архів нижче.</p>
            <div className="raid-list-summary" aria-label="Коротка статистика рейдів">
              <span>Усього: {raids.length}</span>
              <span>Активні: {activeRaids.length}</span>
              <span>Чернетки: {draftRaids.length}</span>
              <span>Архів: {closedRaids.length}</span>
            </div>
          </div>
          <a className="btn primary" href="/raids/new">＋ Створити рейд</a>
        </div>
        <div className="raid-manager-list">
          {currentRaids.length ? currentRaids.map((raid) => <RaidListCard key={raid.id} raid={raid} />) : <p className="raid-empty">Активних рейдів і чернеток поки немає.</p>}
        </div>
      </section>

      <section className="panel raid-list-page-panel raid-list-page-panel--archive">
        <div className="raid-list-page-head raid-list-page-head--archive">
          <div>
            <h2>Минулі закриті рейди</h2>
            <p>Архів для перегляду складу, записів, середнього item level і посилань на Discord-повідомлення. Автовидалення вимкнене: видалення доступне тільки вручну.</p>
            <div className="raid-list-summary" aria-label="Статистика архіву рейдів">
              <span>Закрито: {closedRaids.length}</span>
            </div>
          </div>
        </div>
        <div className="raid-manager-list raid-manager-list--archive">
          {closedRaids.length ? closedRaids.map((raid) => <RaidListCard key={raid.id} raid={raid} />) : <p className="raid-empty">Минулі закриті рейди з’являться тут після завершення або ручного закриття рейду.</p>}
        </div>
      </section>
    </RaidPageShell>
  );
}
