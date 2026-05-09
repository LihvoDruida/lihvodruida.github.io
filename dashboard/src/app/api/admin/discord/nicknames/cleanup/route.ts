import { NextRequest } from "next/server";
import { auditDiscordAdmin, adminDiscordJson, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { removeRolesFromMembersWithInvalidNicknames } from "@/lib/discordMemberManagement";

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "nicknames-cleanup", 32 * 1024);
  if ("error" in guard) return guard.error;

  try {
    const form = await request.formData();
    const apply = String(form.get("apply") || "") === "1";
    const result = await removeRolesFromMembersWithInvalidNicknames({
      roleIds: form.getAll("roleIds"),
      limit: form.get("limit"),
      dryRun: !apply,
      reason: `Nickname does not match Mistblossom template; action by ${guard.session.name || guard.session.id}`,
    });
    await auditDiscordAdmin("discord.member.roles.remove_invalid_nickname", guard.session, {
      dryRun: result.dryRun,
      checked: result.checked,
      targets: result.matchedTargets,
      changed: result.changed,
      failed: result.failed,
    });
    return adminDiscordJson({
      ok: true,
      tone: result.dryRun ? "info" : result.failed ? "warning" : "success",
      title: result.dryRun ? "Попередній перегляд готовий" : "Ролі знято за неправильний нік",
      message: result.dryRun
        ? `Знайдено ${result.matchedTargets} учасників із неправильним ніком. Реальні ролі ще не змінювались.`
        : `Знято вибрані ролі у ${result.changed} учасників із неправильним ніком. Помилок: ${result.failed}.`,
      data: { result },
    });
  } catch (error) {
    return discordAdminError(request, "admin.discord.nicknames_cleanup_failed", error, "Масову дію не виконано.");
  }
}
