import { NextRequest } from "next/server";
import { auditDiscordAdmin, adminDiscordResponse, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { syncDiscordOfficerRolesFromProfiles } from "@/lib/discordMemberManagement";

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "officers-sync", 16 * 1024);
  if ("error" in guard) return guard.error;

  try {
    const form = await request.formData();
    const result = await syncDiscordOfficerRolesFromProfiles({
      roleIds: form.getAll("officerRoleIds"),
      limit: form.get("limit"),
      reason: `Mistblossom Battle.net officer role sync by ${guard.session.name || guard.session.id}`,
    });

    const nicknameSkipped = (result.skippedMissingNickname || result.skippedInvalidNickname)
      ? ` Пропущено через серверний нік: без ніку ${result.skippedMissingNickname || 0}, не за шаблоном ${result.skippedInvalidNickname || 0}.`
      : "";
    const summary = `Перевірено профілів ${result.checkedProfiles}; знайдено офіцерських профілів ${result.officerProfiles}; роль видано ${result.changed} учасникам; видано ролей ${result.addedRolesTotal}; уже мали роль ${result.alreadyHad}; пропущено ${result.skipped}; помилок ${result.failed}.${nicknameSkipped}`;
    const hasWarnings = Boolean(result.failed || result.skippedMissingNickname || result.skippedInvalidNickname);

    await auditDiscordAdmin("discord.member.roles.sync_bnet_officers", guard.session, {
      status: hasWarnings ? "warning" : "success",
      summary,
      checkedProfiles: result.checkedProfiles,
      officerProfiles: result.officerProfiles,
      changed: result.changed,
      addedRoles: result.addedRolesTotal,
      alreadyHad: result.alreadyHad,
      skipped: result.skipped,
      failed: result.failed,
      skippedMissingNickname: result.skippedMissingNickname,
      skippedInvalidNickname: result.skippedInvalidNickname,
      nicknameTemplate: result.nicknameTemplate,
      checkedField: result.checkedField,
      roleIds: result.roleIds,
      changedItems: result.changedItems,
      changedItemsTotal: result.changedItemsTotal,
      skippedItems: result.skippedItems,
      skippedItemsTotal: result.skippedItemsTotal,
      alreadyHadItems: result.alreadyHadItems,
      alreadyHadItemsTotal: result.alreadyHadItemsTotal,
      errors: result.errors,
      errorsTotal: result.errorsTotal,
    });

    const changedNames = result.changedItems.slice(0, 6).map((item) => item.name).filter(Boolean);
    const changedHint = changedNames.length
      ? ` Видано: ${changedNames.join(", ")}${result.changed > changedNames.length ? ` та ще ${result.changed - changedNames.length}` : ""}.`
      : "";
    const errorHint = result.failed
      ? ` Помилки: ${result.errors.slice(0, 3).map((item) => `${item.name}: ${item.error}`).join(" | ")}`
      : "";

    return adminDiscordResponse(request, {
      ok: true,
      tone: hasWarnings ? "warning" : "success",
      title: "Синхронізацію офіцерських ролей завершено",
      message: `${summary}${changedHint}${errorHint}`,
      ttl: hasWarnings ? 14000 : 7600,
      data: { result, refresh: true },
    });
  } catch (error) {
    return await discordAdminError(request, "admin.discord.officers_sync_failed", error, "Офіцерські ролі не синхронізовано.", guard.session);
  }
}
