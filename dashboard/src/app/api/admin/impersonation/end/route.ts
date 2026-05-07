import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/auth";
import { applyAccessGroupToSession, resolveAccessGroupFromDiscord } from "@/lib/accessGroups";
import { fetchDiscordGuildMemberSnapshot, fetchDiscordGuildSnapshot } from "@/lib/discordAdmin";
import { noStoreHeaders } from "@/lib/security";
import { dashboardToastCookie } from "@/lib/serverToasts";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.impersonatedBy || session.provider !== "discord") {
    return NextResponse.redirect(new URL("/", request.url), { status: 303, headers: noStoreHeaders() });
  }

  try {
    const [member, guild] = await Promise.all([
      fetchDiscordGuildMemberSnapshot(session.id),
      fetchDiscordGuildSnapshot().catch(() => null),
    ]);
    const resolved = await resolveAccessGroupFromDiscord(member.roleIds || [], session.id, guild?.ownerId || null);
    await setSession(applyAccessGroupToSession({ ...session, discordRoleIds: member.roleIds || [], impersonatedBy: undefined }, resolved.group, resolved.isServerOwner));
  } catch {
    await setSession({ ...session, impersonatedBy: undefined });
  }

  const response = NextResponse.redirect(new URL("/admin/groups", request.url), { status: 303, headers: noStoreHeaders() });
  response.headers.append("Set-Cookie", dashboardToastCookie({ tone: "success", title: "Перегляд завершено", message: "Повернули реальні права твого акаунта." }));
  return response;
}
