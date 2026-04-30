import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { getMainCharacter, getProfileByDiscordUserId, getProfileById } from "@/lib/profiles";
import { getRaid, hasRaidStorage } from "@/lib/raids";
import { RaidAnnouncementPreview, RaidAttendanceActions, RaidManageActions, RaidPageShell, RaidUnavailableState, RosterSideList, StatusNotice } from "@/components/RaidViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RaidDetailsPage({ params, searchParams }: { params: Promise<{ raidId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  const canManage = canManageRaids(user);
  const { raidId } = await params;
  const query = await searchParams;
  const raid = await getRaid(raidId);
  const visibleRaid = raid && (raid.status === "published" || raid.status === "closed" || canManage) ? raid : null;
  const userDiscordId = user?.provider === "discord" && /^\d{16,25}$/.test(user.id) ? user.id : "";
  const profile = user?.profileId
    ? await getProfileById(user.profileId).catch(() => null)
    : userDiscordId
      ? await getProfileByDiscordUserId(userDiscordId).catch(() => null)
      : null;
  const hasMainCharacter = user ? Boolean(profile && getMainCharacter(profile)) : null;

  return (
    <RaidPageShell
      user={user}
      title="Сторінка рейду"
      description="Пряме посилання доступне учасникам. Вони можуть тільки підписатися, пропустити рейд або позначити запізнення."
    >
      <StatusNotice params={query} />
      {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Запис на рейди тимчасово недоступний. Повтори пізніше або звернись до офіцера.</div> : null}

      {visibleRaid ? (
        <section className="raid-member-layout">
          <div className="raid-preview-column">
            <RaidAnnouncementPreview
              raid={visibleRaid}
              actions={<RaidAttendanceActions raid={visibleRaid} user={user} hasMainCharacter={hasMainCharacter} />}
              manageActions={canManage ? <RaidManageActions raid={visibleRaid} /> : null}
            />
            <div className="raid-detail-links">
              {canManage ? <a className="btn subtle" href="/raids">До списку рейдів</a> : null}
              {visibleRaid.messageUrl ? <a className="btn subtle" href={visibleRaid.messageUrl} target="_blank" rel="noreferrer">Відкрити повідомлення в Discord</a> : null}
            </div>
          </div>
          <RosterSideList raid={visibleRaid} />
        </section>
      ) : <RaidUnavailableState canManage={canManage} />}
    </RaidPageShell>
  );
}
