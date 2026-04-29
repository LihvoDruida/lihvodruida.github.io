import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDiscordRoles, fetchDiscordTextChannels, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { canManageRaids } from "@/lib/permissions";
import { getRaid, hasRaidStorage } from "@/lib/raids";
import { RaidAnnouncementPreview, RaidForm, RaidPageShell, RaidUnavailableState, RosterSideList, StatusNotice } from "@/components/RaidViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditRaidPage({ params, searchParams }: { params: Promise<{ raidId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!canManageRaids(user)) redirect("/profile");

  const { raidId } = await params;
  const query = await searchParams;
  const raid = await getRaid(raidId);
  let channels: Array<{ id: string; name: string }> = [];
  let roles: Array<{ id: string; name: string; color: number; position: number; managed: boolean }> = [];
  if (hasDiscordEmbedConfig()) {
    const [channelsResult, roleData] = await Promise.all([
      fetchDiscordTextChannels().catch(() => null),
      fetchDiscordRoles().catch(() => []),
    ]);
    channels = channelsResult?.channels || [];
    roles = roleData;
  }

  return (
    <RaidPageShell
      user={user}
      title="Редагування рейду"
      description="Редагування доступне тільки модераторам та адмінам. Сторінка самого рейду залишається окремою для всіх учасників."
    >
      <StatusNotice params={query} />
      {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Firebase не налаштований: рейди не зможуть зберігатися.</div> : null}
      {!hasDiscordEmbedConfig() ? <div className="notice panel error-note raid-notice">Discord-бот не підключений: публікація оголошення недоступна.</div> : null}

      {raid ? (
        <section className="raid-editor-layout">
          <RaidForm raid={raid} channels={channels} roles={roles} />
          <div className="raid-preview-column">
            <RaidAnnouncementPreview raid={raid} />
            <RosterSideList raid={raid} />
          </div>
        </section>
      ) : <RaidUnavailableState canManage />}
    </RaidPageShell>
  );
}
