import { NextRequest } from "next/server";
import { auditDiscordAdmin, adminDiscordResponse, discordAdminError, requireDiscordAdmin } from "@/lib/adminDiscordRoute";
import { updateDiscordMemberNickname } from "@/lib/discordMemberManagement";

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "nickname");
  if ("error" in guard) return guard.error;

  try {
    const form = await request.formData();
    const result = await updateDiscordMemberNickname({
      userId: form.get("userId"),
      nickname: form.get("nickname"),
      reason: `Mistblossom manual nickname update by ${guard.session.name || guard.session.id}`,
    });
    await auditDiscordAdmin("discord.member.nickname.update", guard.session, { ...result, status: "success", summary: `${result.displayName}: нік змінено на ${result.nickname}.` });
    return adminDiscordResponse(request, { ok: true, title: "Нік змінено в Discord", message: `${result.displayName}: ${result.nickname}.`, data: result });
  } catch (error) {
    return discordAdminError(request, "admin.discord.nickname_failed", error, "Discord не змінив серверний нік.", guard.session);
  }
}
