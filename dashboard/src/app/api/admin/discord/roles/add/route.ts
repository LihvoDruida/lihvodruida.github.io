import { NextRequest } from "next/server";
import { auditDiscordAdmin, adminDiscordResponse, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { addDiscordMemberRoles } from "@/lib/discordMemberManagement";

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "roles-add");
  if ("error" in guard) return guard.error;

  try {
    const form = await request.formData();
    const result = await addDiscordMemberRoles({
      userId: form.get("userId"),
      roleIds: form.getAll("roleIds"),
      reason: `Mistblossom manual role add by ${guard.session.name || guard.session.id}`,
    });
    await auditDiscordAdmin("discord.member.roles.add", guard.session, { ...result, status: "success", summary: `${result.displayName}: видано ролей ${result.roleIds.length}.` });
    return adminDiscordResponse(request, { ok: true, title: "Ролі видано в Discord", message: `${result.displayName}: додано ${result.roleIds.length}.`, data: result });
  } catch (error) {
    return discordAdminError(request, "admin.discord.roles_add_failed", error, "Discord не видав ролі.", guard.session);
  }
}
