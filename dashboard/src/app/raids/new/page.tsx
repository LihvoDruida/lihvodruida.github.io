import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDiscordRoles, fetchDiscordTextChannels, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { canManageRaids } from "@/lib/permissions";
import { hasRaidStorage } from "@/lib/raids";
import { makePreviewRaid, RaidAnnouncementPreview, RaidForm, RaidPageShell, RosterSideList, StatusNotice } from "@/components/RaidViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewRaidPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!canManageRaids(user)) redirect("/profile");

  const params = await searchParams;
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
  const previewRaid = makePreviewRaid(user);

  return (
    <RaidPageShell
      user={user}
      title="Створення рейду"
      description="Заповни дані рейду, збережи чернетку або одразу опублікуй оголошення з кнопками запису."
    >
      <StatusNotice params={params} />
      {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Збереження рейдів тимчасово недоступне. Перевір налаштування панелі.</div> : null}
      {!hasDiscordEmbedConfig() ? <div className="notice panel error-note raid-notice">Публікація в Discord тимчасово недоступна. Чернетку можна зберегти.</div> : null}

      <section className="raid-editor-layout">
        <RaidForm channels={channels} roles={roles} />
        <div className="raid-preview-column">
          <RaidAnnouncementPreview raid={previewRaid} />
          <RosterSideList raid={previewRaid} />
        </div>
      </section>
    </RaidPageShell>
  );
}
