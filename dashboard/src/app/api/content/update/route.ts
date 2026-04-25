import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isContentKind, updateSiteContent } from "@/lib/content";
import {
  assertRequestBodySize,
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
  logDashboardEvent,
  noStoreHeaders,
  safeErrorMessage,
  unauthorizedResponse,
  verifyTrustedOrigin,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) {
    return forbiddenResponse("Недовірене джерело оновлення контенту.");
  }

  logDashboardEvent("info", "content.update.attempt", request);

  const tooLarge = assertRequestBodySize(request, 10 * 1024 * 1024);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session || session.role !== "admin") {
    logDashboardEvent("warn", "content.update.unauthorized", request);
    return unauthorizedResponse("Доступ лише для адміністратора.");
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`content-update:${session.id}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    logDashboardEvent("warn", "content.update.rate_limited", request, { userId: session.id, resetAt: limit.resetAt });
    return redirectTo(request, `/content?error=${encodeURIComponent("Забагато оновлень матеріалів. Зачекай кілька хвилин.")}`);
  }

  const form = await request.formData();
  const kind = String(form.get("kind") || "");

  if (!isContentKind(kind)) {
    return redirectTo(request, `/content?error=${encodeURIComponent("Оберіть новину або гайд.")}`);
  }

  try {
    const imageValue = form.get("image");
    const result = await updateSiteContent({
      path: String(form.get("path") || ""),
      kind,
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      body: String(form.get("body") || ""),
      categories: String(form.get("categories") || ""),
      tags: String(form.get("tags") || ""),
      slug: String(form.get("slug") || ""),
      date: String(form.get("date") || ""),
      lastModifiedAt: String(form.get("lastModifiedAt") || ""),
      existingImage: String(form.get("existingImage") || ""),
      removeImage: String(form.get("removeImage") || "") === "1",
      image: imageValue instanceof File ? imageValue : null,
      author: String(form.get("author") || session.name),
      user: session,
    });

    logDashboardEvent("info", "content.update.success", request, { path: result.path, userId: session.id });
    return redirectTo(request, `/content?updated=${encodeURIComponent(result.path)}`);
  } catch (error) {
    const message = safeErrorMessage(error, "Не вдалося оновити матеріал.");
    logDashboardEvent("error", "content.update.failed", request, { message });
    return redirectTo(request, `/content?error=${encodeURIComponent(message)}`);
  }
}
