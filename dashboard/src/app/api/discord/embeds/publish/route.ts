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

function safeReturnTo(value: FormDataEntryValue | string | null | undefined) {
  const path = String(value || "").trim();
  if (!path || path.startsWith("//") || path.includes("://")) return "/discord";
  return path.startsWith("/discord") ? path.slice(0, 240) : "/discord";
}

function redirectTo(request: NextRequest, params: Record<string, string>, returnTo = "/discord") {
  const url = new URL(returnTo, request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

function selectedRoleIds(form: FormData) {
  return Array.from(new Set(
    form
      .getAll("roleIds")
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
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

  let returnTo = "/discord";

  try {
    const form = await request.formData();
    returnTo = safeReturnTo(form.get("returnTo"));
    const mode = String(form.get("mode") || "general");
    const action = String(form.get("action") || "publish");
    const channelId = String(form.get("channelId") || "").trim();
    const messageLink = String(form.get("messageLink") || "").trim();
    const content = String(form.get("content") || "").trim();
    const embed = parseEmbedJson(form.get("embedJson"));
    const isRules = mode === "rules";
    const selectedRoles = selectedRoleIds(form);
    const roleIds = isRules ? selectedRoles : [];
    const mentionRoleIds = isRules ? [] : selectedRoles;
    const editRef = parseDiscordMessageRef(messageLink);
    const shouldEdit = action === "edit" || Boolean(editRef);
    const effectiveAction = shouldEdit ? "edit" : "publish";
    const moderator = session.name || session.login || session.id;
    const auditReason = `Mistblossom dashboard: ${isRules ? "rules" : "embed"} ${effectiveAction} by ${moderator}`;

    logDashboardEvent("info", "discord.embed.submit", request, {
      mode,
      action,
      effectiveAction,
      channelId,
      hasMessageLink: Boolean(messageLink),
      contentLength: content.length,
      roleCount: roleIds.length,
      mentionRoleCount: mentionRoleIds.length,
      adminId: session.id,
    });

    if (isRules && roleIds.length === 0) {
      logDashboardEvent("warn", "discord.embed.validation_failed", request, { reason: "missing_rules_role", adminId: session.id });
      return redirectTo(request, { error: "Для правил потрібно вибрати хоча б одну роль для кнопки “Прийняти”." }, returnTo);
    }

    if (messageLink && !editRef) {
      logDashboardEvent("warn", "discord.embed.validation_failed", request, { reason: "invalid_edit_link", adminId: session.id });
      return redirectTo(request, { error: "Discord message link невалідний. Прибери його або встав повне посилання на повідомлення." }, returnTo);
    }

    if (shouldEdit) {
      if (!editRef) {
        logDashboardEvent("warn", "discord.embed.validation_failed", request, { reason: "missing_edit_link", adminId: session.id });
        return redirectTo(request, { error: "Для редагування встав посилання на Discord-повідомлення." }, returnTo);
      }
      const updated = await editDiscordEmbedMessage({
        ref: editRef,
        content,
        embed,
        roleIds,
        mentionRoleIds,
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
      }, returnTo);
    }

    const created = await createDiscordEmbedMessage({
      channelId,
      content,
      embed,
      roleIds,
      mentionRoleIds,
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
    }, returnTo);
  } catch (error) {
    logDashboardEvent("error", "discord.embed.failed", request, { message: safeErrorMessage(error) });
    return redirectTo(request, { error: safeErrorMessage(error) }, returnTo);
  }
}
