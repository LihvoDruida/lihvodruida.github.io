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
    const status = result.changed > 0 ? "success" : "info";
    const summary = result.changed > 0
      ? `${result.displayName}: видано ролей ${result.addedRoleIds.length}; уже були ${result.alreadyHadRoleIds.length}.`
      : `${result.displayName}: вибрані ролі вже були в учасника.`;
    await auditDiscordAdmin("discord.member.roles.add", guard.session, {
      ...result,
      status,
      summary,
      changed: result.changed,
      addedRoles: result.addedRoleIds.length,
      alreadyHadRoles: result.alreadyHadRoleIds.length,
      roleIds: result.roleIds,
      changedItems: result.addedRoleIds.length ? [{ userId: result.userId, name: result.displayName, added: result.addedRoleIds }] : [],
      changedItemsTotal: result.addedRoleIds.length ? 1 : 0,
      changedNames: result.addedRoleIds.length ? [result.displayName] : [],
    });
    return adminDiscordResponse(request, {
      ok: true,
      tone: result.changed > 0 ? "success" : "info",
      title: result.changed > 0 ? "Ролі видано в Discord" : "Ролі вже були видані",
      message: summary,
      data: { ...result, refresh: true },
    });
  } catch (error) {
    return await discordAdminError(request, "admin.discord.roles_add_failed", error, "Discord не видав ролі.", guard.session);
  }
}
