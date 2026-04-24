import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isContentKind, updateSiteContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Доступ лише для адміністратора." }, { status: 403 });
  }

  const form = await request.formData();
  const kind = String(form.get("kind") || "");

  if (!isContentKind(kind)) {
    return NextResponse.redirect(new URL(`/content?error=${encodeURIComponent("Оберіть новину або гайд.")}`, request.url), 303);
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

    return NextResponse.redirect(new URL(`/content?updated=${encodeURIComponent(result.path)}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не вдалося оновити матеріал.";
    return NextResponse.redirect(new URL(`/content?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
