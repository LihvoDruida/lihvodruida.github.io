import { NextRequest } from "next/server";

import { auditDiscordAdmin, adminDiscordResponse, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { cleanupDashboardProfilesDiscordMembership } from "@/lib/discordMemberManagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function compactProfileCleanupResult(result: Awaited<ReturnType<typeof cleanupDashboardProfilesDiscordMembership>>) {
  const { targets: _targets, activePreview: _activePreview, ...compact } = result;
  return compact;
}

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "profiles-cleanup", 8 * 1024);
  if ("error" in guard) return guard.error;

  try {
    const form = await request.formData();
    const mode = String(form.get("mode") || "inspect").toLowerCase();
    const apply = mode === "apply";
    const result = await cleanupDashboardProfilesDiscordMembership({
      limit: form.get("limit") || 0,
      dryRun: !apply,
      reason: `Mistblossom Discord profile cleanup by ${guard.session.name || guard.session.id}`,
    });

    const banHint = result.banCheckError ? " Бан-лист не вдалося прочитати, але відсутність учасників перевірено через список сервера." : "";
    const summary = apply
      ? `Перевірено профілів: ${result.checkedDiscordProfiles}; кандидатів на видалення: ${result.targetProfilesTotal}; видалено профілів з Firebase: ${result.deletedProfilesTotal}; помилок: ${result.failed}.${banHint}`
      : `Перевірено профілів: ${result.checkedDiscordProfiles}; не на сервері: ${result.missingMemberTotal}; у бані: ${result.bannedTotal}; кандидатів на видалення: ${result.targetProfilesTotal}.${banHint}`;

    await auditDiscordAdmin(apply ? "discord.profiles.cleanup_apply" : "discord.profiles.cleanup_inspect", guard.session, {
      ...compactProfileCleanupResult(result),
      status: result.failed ? "warning" : result.targetProfilesTotal ? "warning" : "success",
      summary,
      checkedProfiles: result.checkedProfiles,
      checkedDiscordProfiles: result.checkedDiscordProfiles,
      checkedDiscordMembers: result.checkedDiscordMembers,
      checkedBans: result.checkedBans,
      targetProfilesTotal: result.targetProfilesTotal,
      targetDiscordUsersTotal: result.targetDiscordUsersTotal,
      bannedTotal: result.bannedTotal,
      missingMemberTotal: result.missingMemberTotal,
      deletedProfilesTotal: result.deletedProfilesTotal,
      changed: result.changed,
    });

    return adminDiscordResponse(request, {
      ok: true,
      tone: apply
        ? result.failed ? "warning" : result.deletedProfilesTotal ? "success" : "info"
        : result.targetProfilesTotal ? "warning" : "success",
      title: apply ? "Очищення Firebase-профілів завершено" : "Перевірку профілів завершено",
      message: summary,
      ttl: apply ? 16000 : 11000,
      data: { ...compactProfileCleanupResult(result), refresh: apply },
    });
  } catch (error) {
    return await discordAdminError(request, "admin.discord.profiles_cleanup_failed", error, "Перевірку Discord-профілів не виконано.", guard.session);
  }
}
