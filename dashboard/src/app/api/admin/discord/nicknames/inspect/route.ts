import { NextRequest } from "next/server";
import { auditDiscordAdmin, adminDiscordJson, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { inspectDiscordNicknameTemplate } from "@/lib/discordMemberManagement";

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "nicknames-inspect", 8 * 1024);
  if ("error" in guard) return guard.error;

  try {
    const form = await request.formData();
    const result = await inspectDiscordNicknameTemplate(Number(form.get("limit") || 1000));
    await auditDiscordAdmin("discord.nickname_policy.inspect", guard.session, { checked: result.checked, mismatched: result.mismatchedTotal, template: result.template });
    return adminDiscordJson({
      ok: true,
      tone: result.mismatchedTotal ? "warning" : "success",
      title: "Перевірку ніків завершено",
      message: `Перевірено ${result.checked}. Не відповідають шаблону: ${result.mismatchedTotal}.`,
      data: { checked: result.checked, mismatchedTotal: result.mismatchedTotal, preview: result.mismatched },
    });
  } catch (error) {
    return discordAdminError(request, "admin.discord.nicknames_inspect_failed", error, "Перевірку ніків не виконано.");
  }
}
