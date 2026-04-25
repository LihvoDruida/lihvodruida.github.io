import { NextRequest, NextResponse } from "next/server";
import { getSession, canModerate } from "@/lib/auth";
import { listApplications } from "@/lib/github";
import { noStoreHeaders, safeErrorMessage, unauthorizedResponse } from "@/lib/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!canModerate(session)) {
    return unauthorizedResponse();
  }

  try {
    const url = new URL(request.url);
    const items = await listApplications(url.searchParams);

    return NextResponse.json({ items }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Не вдалося завантажити заявки.") },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
