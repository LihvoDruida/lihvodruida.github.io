import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveAuthorIdentity } from "@/lib/authorIdentity";
import { createSiteContent, isContentKind } from "@/lib/content";
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
    return forbiddenResponse("Недовірене джерело створення контенту.");
  }

  logDashboardEvent("info", "content.create.attempt", request);

  const tooLarge = assertRequestBodySize(request, 10 * 1024 * 1024);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session || session.role !== "admin") {
    logDashboardEvent("warn", "content.create.unauthorized", request);
    return unauthorizedResponse("Доступ лише для адміністратора.");
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`content-create:${session.id}:${ip}`, 12, 10 * 60 * 1000);
  if (!limit.ok) {
    logDashboardEvent("warn", "content.create.rate_limited", request, { userId: session.id, resetAt: limit.resetAt });
    return redirectTo(request, `/content?error=${encodeURIComponent("Забагато спроб створення матеріалів. Зачекай кілька хвилин.")}`);
  }

  const form = await request.formData();
  const kind = String(form.get("kind") || "");

  if (!isContentKind(kind)) {
    return redirectTo(request, `/content?error=${encodeURIComponent("Оберіть новину або гайд.")}`);
  }

  try {
    const imageValue = form.get("image");
    const result = await createSiteContent({
      kind,
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      body: String(form.get("body") || ""),
      categories: String(form.get("categories") || ""),
      tags: String(form.get("tags") || ""),
      slug: String(form.get("slug") || ""),
      image: imageValue instanceof File ? imageValue : null,
      author: String(form.get("author") || (await resolveAuthorIdentity(session)).primaryName || session.name),
      user: session,
    });

    logDashboardEvent("info", "content.create.success", request, { path: result.path, userId: session.id });
    return redirectTo(request, `/content?published=${encodeURIComponent(result.path)}`);
  } catch (error) {
    const message = safeErrorMessage(error, "Не вдалося створити матеріал.");
    logDashboardEvent("error", "content.create.failed", request, { message });
    return redirectTo(request, `/content?error=${encodeURIComponent(message)}`);
  }
}
