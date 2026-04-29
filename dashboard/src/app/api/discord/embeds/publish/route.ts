import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageGeneralEmbeds, canManageRulesEmbeds, hierarchyTitle } from "@/lib/permissions";
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
  fetchDiscordEditableMessage,
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

function sameOriginRefererMessageLink(request: NextRequest) {
  const referer = request.headers.get("referer") || "";
  if (!referer) return "";

  try {
    const refererUrl = new URL(referer);
    const requestUrl = new URL(request.url);
    if (refererUrl.origin !== requestUrl.origin) return "";
    return String(refererUrl.searchParams.get("message") || refererUrl.searchParams.get("url") || "").trim();
  } catch {
    return "";
  }
}

function messageLinkFromForm(form: FormData, request: NextRequest, action: string) {
  const explicit = String(form.get("messageLink") || "").trim();
  if (explicit) return explicit;

  const channelId = String(form.get("editChannelId") || "").trim();
  const messageId = String(form.get("editMessageId") || "").trim();
  if (channelId && messageId) return `${channelId}/${messageId}`;

  return action === "edit" ? sameOriginRefererMessageLink(request) : "";
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse("Недовірене джерело запиту.");

  const tooLarge = assertRequestBodySize(request, 64 * 1024);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session || !canManageGeneralEmbeds(session)) {
    return redirectTo(request, { error: "Ця дія доступна тільки гільдмайстеру або офіцеру." });
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`discord-embed:${session.id}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return redirectTo(request, { error: "Забагато Discord-операцій. Спробуй пізніше." });

  let returnTo = "/discord";

  try {
    const form = await request.formData();
    returnTo = safeReturnTo(form.get("returnTo"));
    const mode = String(form.get("mode") || "general") === "rules" ? "rules" : "general";
    const ruleType = mode === "rules" && String(form.get("ruleType") || "guild") === "raid" ? "raid" : "guild";
    const action = String(form.get("action") || "publish");
    const channelId = String(form.get("channelId") || "").trim();
    const messageLink = messageLinkFromForm(form, request, action);
    const content = String(form.get("content") || "").trim();
    const embed = parseEmbedJson(form.get("embedJson"));
    const isRules = mode === "rules";
    const selectedRoles = selectedRoleIds(form);
    const roleIds = isRules && ruleType === "guild" ? selectedRoles : [];
    const mentionRoleIds = isRules ? [] : selectedRoles;
    const editRef = parseDiscordMessageRef(messageLink);
    const shouldEdit = action === "edit" || Boolean(editRef);
    const effectiveAction = shouldEdit ? "edit" : "publish";
    const actor = session.name || session.login || session.id;
    const auditReason = `Mistblossom dashboard: ${isRules ? ruleType === "raid" ? "raid rules" : "rules" : "embed"} ${effectiveAction} by ${actor} (${hierarchyTitle(session.role)})`;

    logDashboardEvent("info", "discord.embed.submit", request, {
      mode,
      ruleType: isRules ? ruleType : "general",
      action,
      effectiveAction,
      channelId,
      hasMessageLink: Boolean(messageLink),
      editTarget: editRef ? `${editRef.channelId}/${editRef.messageId}` : "",
      contentLength: content.length,
      roleCount: roleIds.length,
      mentionRoleCount: mentionRoleIds.length,
      actorId: session.id,
      actorRole: session.role,
    });

    if (isRules && !canManageRulesEmbeds(session)) {
      logDashboardEvent("warn", "discord.embed.validation_failed", request, { reason: "rules_forbidden", actorId: session.id, actorRole: session.role });
      return redirectTo(request, { error: "Створення й редагування правил доступне тільки гільдмайстеру." }, returnTo);
    }

    if (isRules && ruleType === "guild" && roleIds.length === 0) {
      logDashboardEvent("warn", "discord.embed.validation_failed", request, { reason: "missing_rules_role", actorId: session.id });
      return redirectTo(request, { error: "Для правил потрібно вибрати хоча б одну роль для кнопки “Прийняти”." }, returnTo);
    }

    if (messageLink && !editRef) {
      logDashboardEvent("warn", "discord.embed.validation_failed", request, { reason: "invalid_edit_link", actorId: session.id });
      return redirectTo(request, { error: "Посилання на Discord-повідомлення невалідне. Прибери його або встав повне посилання на повідомлення." }, returnTo);
    }

    if (shouldEdit) {
      if (!editRef) {
        logDashboardEvent("warn", "discord.embed.validation_failed", request, { reason: "missing_edit_link", actorId: session.id });
        return redirectTo(request, { error: "Для редагування встав посилання на Discord-повідомлення." }, returnTo);
      }

      if (!canManageRulesEmbeds(session)) {
        const currentMessage = await fetchDiscordEditableMessage(editRef);
        if (currentMessage.isRules) {
          logDashboardEvent("warn", "discord.embed.validation_failed", request, {
            reason: "officer_tried_to_edit_rules_embed",
            actorId: session.id,
            actorRole: session.role,
            channelId: editRef.channelId,
            messageId: editRef.messageId,
          });
          return redirectTo(request, { error: "Це повідомлення правил. Офіцер може редагувати тільки звичайні Discord-повідомлення." }, returnTo);
        }
      }

      const updated = await editDiscordEmbedMessage({
        ref: editRef,
        content,
        embed,
        roleIds,
        mentionRoleIds,
        withRulesButtons: isRules,
        rulesType: ruleType,
        auditReason,
      });

      logDashboardEvent("info", "discord.embed.updated", request, {
        mode,
        channelId: editRef.channelId,
        messageId: editRef.messageId,
        actorId: session.id,
        actorRole: session.role,
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
      rulesType: ruleType,
      auditReason,
    });

    logDashboardEvent("info", "discord.embed.published", request, {
      mode,
      channelId,
      messageId: created?.id,
      actorId: session.id,
      actorRole: session.role,
    });

    return redirectTo(request, {
      published: created?.id ? discordMessageUrl(channelId, String(created.id)) : "Discord-повідомлення",
      tab: mode,
    }, returnTo);
  } catch (error) {
    logDashboardEvent("error", "discord.embed.failed", request, { actorId: session.id, message: safeErrorMessage(error) });
    return redirectTo(request, { error: "Не вдалося виконати дію з Discord-повідомленням. Спробуй ще раз або перевір права бота." }, returnTo);
  }
}
