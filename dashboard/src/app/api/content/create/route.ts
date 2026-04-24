import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSiteContent, isContentKind } from "@/lib/content";

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
    return NextResponse.json({ error: "Оберіть новину або гайд." }, { status: 400 });
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
      author: session.name,
      user: session,
    });

    return NextResponse.redirect(new URL(`/content?published=${encodeURIComponent(result.path)}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не вдалося створити матеріал.";
    return NextResponse.redirect(new URL(`/content?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
