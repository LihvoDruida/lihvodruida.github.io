import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  assertRequestBodySize,
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
  verifyTrustedOrigin,
} from "@/lib/security";
import {
  createDiscordEmbedMessage,
  discordMessageUrl,
  editDiscordEmbedMessage,
  parseDiscordMessageRef,
  parseEmbedJson,
} from "@/lib/discordAdmin";

function redirectTo(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/discord", request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

function selectedRoleIds(form: FormData) {
  return form
    .getAll("roleIds")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse("Недовірене джерело публікації Discord embed.");

  const tooLarge = assertRequestBodySize(request, 64 * 1024);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session || session.role !== "admin") return redirectTo(request, { error: "Ця дія доступна тільки адміну." });

  const ip = getClientIp(request);
  const limit = checkRateLimit(`discord-embed:${session.id}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return redirectTo(request, { error: "Забагато Discord-операцій. Спробуй пізніше." });

  try {
    const form = await request.formData();
    const mode = String(form.get("mode") || "general");
    const action = String(form.get("action") || "publish");
    const channelId = String(form.get("channelId") || "").trim();
    const messageLink = String(form.get("messageLink") || "").trim();
    const content = String(form.get("content") || "").trim();
    const embed = parseEmbedJson(form.get("embedJson"));
    const isRules = mode === "rules";
    const roleIds = isRules ? selectedRoleIds(form) : [];
    const moderator = session.name || session.login || session.id;
    const auditReason = `Mistblossom dashboard: ${isRules ? "rules" : "embed"} ${action} by ${moderator}`;

    if (isRules && roleIds.length === 0) {
      return redirectTo(request, { error: "Для правил потрібно вибрати хоча б одну роль для кнопки “Прийняти”." });
    }

    const editRef = parseDiscordMessageRef(messageLink);
    const shouldEdit = action === "edit" || Boolean(editRef);

    if (shouldEdit) {
      if (!editRef) return redirectTo(request, { error: "Для редагування встав посилання на Discord-повідомлення." });
      const updated = await editDiscordEmbedMessage({
        ref: editRef,
        content,
        embed,
        roleIds,
        withRulesButtons: isRules,
        auditReason,
      });

      logDashboardEvent("info", "discord.embed.updated", request, {
        mode,
        channelId: editRef.channelId,
        messageId: editRef.messageId,
        adminId: session.id,
      });

      return redirectTo(request, {
        updated: discordMessageUrl(editRef.channelId, editRef.messageId),
        tab: mode,
      });
    }

    const created = await createDiscordEmbedMessage({
      channelId,
      content,
      embed,
      roleIds,
      withRulesButtons: isRules,
      auditReason,
    });

    logDashboardEvent("info", "discord.embed.published", request, {
      mode,
      channelId,
      messageId: created?.id,
      adminId: session.id,
    });

    return redirectTo(request, {
      published: created?.id ? discordMessageUrl(channelId, String(created.id)) : "Discord message",
      tab: mode,
    });
  } catch (error) {
    logDashboardEvent("error", "discord.embed.failed", request, { message: safeErrorMessage(error) });
    return redirectTo(request, { error: safeErrorMessage(error), tab: "discord" });
  }
}
