import { NextRequest } from "next/server";

import { auditDiscordAdmin, adminDiscordResponse, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { removeDiscordMemberRoles } from "@/lib/discordMemberManagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (result.expectedChangeTotal > 0 && result.changed < result.expectedChangeTotal) {
      throw new Error(`Discord не підтвердив зняття всіх вибраних ролей. Очікувалось змін: ${result.expectedChangeTotal}, підтверджено: ${result.changed}.`);
    }
    const status = result.changed > 0 ? "success" : "info";
    const summary = result.changed > 0
      ? `${result.displayName}: знято ролей ${result.removedRoleIds.length}; уже були відсутні ${result.alreadyMissingRoleIds.length}.`
      : `${result.displayName}: вибраних ролей уже не було в учасника.`;
    await auditDiscordAdmin("discord.member.roles.remove", guard.session, {
      ...result,
      status,
      summary,
      changed: result.changed,
      removedRoles: result.removedRoleIds.length,
      alreadyMissingRoles: result.alreadyMissingRoleIds.length,
      roleIds: result.roleIds,
      changedItems: result.removedRoleIds.length ? [{ userId: result.userId, name: result.displayName, removed: result.removedRoleIds }] : [],
      changedItemsTotal: result.removedRoleIds.length ? 1 : 0,
      changedNames: result.removedRoleIds.length ? [result.displayName] : [],
    });
    return adminDiscordResponse(request, {
      ok: true,
      tone: result.changed > 0 ? "success" : "info",
      title: result.changed > 0 ? "Ролі знято в Discord" : "Ролі вже були відсутні",
      message: summary,
      data: { ...result, refresh: true },
    });
  } catch (error) {
    return await discordAdminError(request, "admin.discord.roles_remove_failed", error, "Discord не зняв ролі.", guard.session);
  }
}
