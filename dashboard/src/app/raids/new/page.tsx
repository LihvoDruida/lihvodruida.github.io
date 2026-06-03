import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveAuthorIdentity } from "@/lib/authorIdentity";
import { fetchDiscordRoles, fetchDiscordTextChannels, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { canManageRaids } from "@/lib/permissions";
import { hasRaidStorage } from "@/lib/raids";
import { makePreviewRaid, RaidForm, RaidPageShell, RosterSideList, StatusNotice } from "@/components/RaidViews";
import RaidEditorLivePreview from "@/components/RaidEditorLivePreview";
import { buildPageMetadata } from "@/lib/seo";
import { getOwnProfilePath } from "@/lib/profiles";

export const runtime = "nodejs";
export const metadata = buildPageMetadata({
  title: "Створення рейду",
  description: "Створення рейду Mistblossom Vanguard з описом, датою, складом, лімітами та Discord-оголошенням.",
  path: "/raids/new",
  keywords: ["створити рейд", "рейдовий календар", "Discord оголошення"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewRaidPage({
  searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const user = await getSession();
  if (!user) { redirect("/login"); throw new Error("Login required"); }
  if (!canManageRaids(user)) redirect(await getOwnProfilePath(user));

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
  const authorIdentity = await resolveAuthorIdentity(user);
  const previewRaid = makePreviewRaid(user, authorIdentity.primaryName);

  return (
    <RaidPageShell
      user={user}
      title="Створення рейду"
      description="Заповни дані рейду, збережи чернетку або одразу опублікуй оголошення з кнопками запису."
    >
      <StatusNotice params={params} />
      {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Збереження рейдів тимчасово недоступне. Спробуй пізніше або звернись до гільдмайстра.</div> : null}
      {!hasDiscordEmbedConfig() ? <div className="notice panel error-note raid-notice">Публікація в Discord тимчасово недоступна. Чернетку можна підготувати й опублікувати пізніше.</div> : null}

      <section className="raid-editor-layout">
        <RaidForm channels={channels} roles={roles} />
        <div className="raid-preview-column">
          <RaidEditorLivePreview initialRaid={previewRaid} />
          <RosterSideList raid={previewRaid} />
        </div>
      </section>
    </RaidPageShell>
  );
}
