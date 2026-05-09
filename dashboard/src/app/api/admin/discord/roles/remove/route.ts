import { NextRequest } from "next/server";
import { auditDiscordAdmin, adminDiscordJson, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { removeDiscordMemberRoles } from "@/lib/discordMemberManagement";

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "roles-remove");
  if ("error" in guard) return guard.error;

  try {
    const form = await request.formData();
    const result = await removeDiscordMemberRoles({
      userId: form.get("userId"),
      roleIds: form.getAll("roleIds"),
      reason: `Mistblossom manual role remove by ${guard.session.name || guard.session.id}`,
    });
    await auditDiscordAdmin("discord.member.roles.remove", guard.session, { ...result, status: "success", summary: `${result.displayName}: знято ролей ${result.roleIds.length}.` });
    return adminDiscordJson({ ok: true, title: "Ролі знято в Discord", message: `${result.displayName}: знято ${result.roleIds.length}.`, data: result });
  } catch (error) {
    return discordAdminError(request, "admin.discord.roles_remove_failed", error, "Discord не зняв ролі.", guard.session);
  }
}
