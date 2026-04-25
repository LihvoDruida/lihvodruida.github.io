import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteRepoFile, isManagedContentPath } from "@/lib/content";
import {
  assertRequestBodySize,
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
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
    return forbiddenResponse("Недовірене джерело видалення контенту.");
  }

  const tooLarge = assertRequestBodySize(request, 4096);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session || session.role !== "admin") {
    return unauthorizedResponse("Доступ лише для адміністратора.");
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`content-delete:${session.id}:${ip}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return redirectTo(request, `/content?error=${encodeURIComponent("Забагато видалень. Зачекай кілька хвилин.")}`);
  }

  const form = await request.formData();
  const path = String(form.get("path") || "").trim();

  try {
    if (!isManagedContentPath(path)) {
      throw new Error("Можна видаляти тільки Markdown-файли з _news або _guides.");
    }

    await deleteRepoFile(path, `content: delete ${path} by ${session.name}`);
    return redirectTo(request, `/content?deleted=${encodeURIComponent(path)}`);
  } catch (error) {
    const message = safeErrorMessage(error, "Не вдалося видалити матеріал.");
    return redirectTo(request, `/content?error=${encodeURIComponent(message)}`);
  }
}
