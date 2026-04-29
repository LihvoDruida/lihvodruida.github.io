import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { hasRaidStorage, listRaids } from "@/lib/raids";
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

  const raids = await listRaids();

  return (
    <RaidPageShell
      user={user}
      title="Рейди"
      description="Окремий список рейдів для модераторів та адмінів. Створення і редагування винесені на окремі сторінки."
    >
      <StatusNotice params={params} />
      {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Firebase не налаштований: рейди не зможуть зберігатися.</div> : null}
      {!hasDiscordEmbedConfig() ? <div className="notice panel error-note raid-notice">Discord-бот не підключений: публікація оголошення недоступна.</div> : null}

      <section className="panel raid-list-page-panel">
        <div className="raid-list-page-head">
          <div>
            <h2>Усі рейди</h2>
            <p>Відкрий рейд для перегляду складу або створи новий запис.</p>
          </div>
          <a className="btn primary" href="/raids/new">＋ Створити рейд</a>
        </div>
        <div className="raid-manager-list">
          {raids.length ? raids.map((raid) => <RaidListCard key={raid.id} raid={raid} />) : <p className="raid-empty">Рейдів ще немає.</p>}
        </div>
      </section>
    </RaidPageShell>
  );
}
