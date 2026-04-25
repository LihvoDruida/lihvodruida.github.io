import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  checkRateLimit,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/security";
import {
  fetchDiscordEditableMessage,
  parseDiscordMessageRef,
} from "@/lib/discordAdmin";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders() });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return jsonResponse({ error: "Ця дія доступна тільки адміну." }, 403);
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`discord-message-load:${session.id}:${ip}`, 60, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonResponse({ error: "Забагато запитів до Discord. Спробуй трохи пізніше." }, 429);
  }

  try {
    const url = new URL(request.url);
    const rawLink = String(url.searchParams.get("message") || url.searchParams.get("url") || url.searchParams.get("link") || "").trim();
    const mode = String(url.searchParams.get("mode") || "general").trim();
    const ref = parseDiscordMessageRef(rawLink);

    if (!ref) {
      logDashboardEvent("warn", "discord.embed.message_load_invalid_link", request, { adminId: session.id, mode });
      return jsonResponse({ error: "Посилання на Discord-повідомлення невалідне." }, 400);
    }

    logDashboardEvent("info", "discord.embed.message_load_started", request, {
      adminId: session.id,
      mode,
      channelId: ref.channelId,
      messageId: ref.messageId,
    });

    const message = await fetchDiscordEditableMessage(ref);
    const warning = mode === "rules" && !message.isRules
      ? "Це повідомлення не схоже на rules embed із кнопками цієї панелі. Контент підтягнуто, але ролі можуть бути порожніми."
      : "";

    logDashboardEvent("info", "discord.embed.message_loaded", request, {
      adminId: session.id,
      mode,
      channelId: message.channelId,
      messageId: message.id,
      isRules: message.isRules,
      roleCount: message.roleIds.length,
      hasContent: Boolean(message.content),
      hasEmbed: Boolean(message.embed),
    });

    return jsonResponse({
      ok: true,
      warning,
      message: {
        id: message.id,
        channelId: message.channelId,
        url: message.url,
        content: message.content,
        embed: message.embed || {},
        embedJson: message.embedJson,
        title: message.title,
        roleIds: message.roleIds,
        isRules: message.isRules,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
      },
    });
  } catch (error) {
    logDashboardEvent("error", "discord.embed.message_load_failed", request, { adminId: session.id, message: safeErrorMessage(error) });
    return jsonResponse({ error: safeErrorMessage(error) }, 500);
  }
}
