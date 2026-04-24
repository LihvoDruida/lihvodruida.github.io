import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteRepoFile } from "@/lib/content";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Доступ лише для адміністратора." }, { status: 403 });
  }

  const form = await request.formData();
  const path = String(form.get("path") || "").trim();

  try {
    if (!path.endsWith(".md") || (!path.startsWith("_news/") && !path.startsWith("_guides/"))) {
      throw new Error("Можна видаляти тільки Markdown-файли з _news або _guides.");
    }

    await deleteRepoFile(path, `content: delete ${path} by ${session.name}`);
    return NextResponse.redirect(new URL(`/content?deleted=${encodeURIComponent(path)}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не вдалося видалити матеріал.";
    return NextResponse.redirect(new URL(`/content?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
