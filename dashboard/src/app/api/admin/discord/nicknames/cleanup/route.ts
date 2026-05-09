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

    const summary = result.dryRun
      ? `Перевірено ${result.checked}; невідповідних учасників із вибраними ролями: ${result.matchedTargets}; зміни не застосовувались.`
      : `Перевірено ${result.checked}; цілей ${result.matchedTargets}; ролі знято з ${result.changed} учасників; знятих ролей ${result.removedRolesTotal || 0}; без змін ${result.unchanged || 0}; помилок ${result.failed}.`;

    await auditDiscordAdmin("discord.member.roles.remove_invalid_nickname", guard.session, {
      status: result.dryRun ? "info" : result.failed ? "warning" : "success",
      summary,
      dryRun: result.dryRun,
      template: result.template,
      checked: result.checked,
      targets: result.matchedTargets,
      changed: result.changed,
      removedRoles: result.removedRolesTotal || 0,
      unchanged: result.unchanged || 0,
      stillPresent: result.stillPresentTotal || 0,
      failed: result.failed,
      errors: result.errors || [],
      changedItems: result.changedItems || [],
    });

    const failedHint = result.failed
      ? ` Помилки: ${result.errors?.slice(0, 3).map((item) => `${item.name}: ${item.error}`).join(" | ")}`
      : "";

    return adminDiscordJson({
      ok: true,
      tone: result.dryRun ? "info" : result.failed ? "warning" : "success",
      title: result.dryRun ? "Попередній перегляд готовий" : "Масове зняття ролей завершено",
      message: `${summary}${failedHint}`,
      ttl: result.dryRun ? 9000 : 14000,
      data: { result, refresh: true },
    });
  } catch (error) {
    return discordAdminError(request, "admin.discord.nicknames_cleanup_failed", error, "Масову дію не виконано.", guard.session);
  }
}
