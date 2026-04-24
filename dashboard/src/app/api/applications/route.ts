import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertCanModerate } from "@/lib/auth";
import { listApplications } from "@/lib/github";

export async function GET(request: NextRequest) {
  const session = await getSession();
  assertCanModerate(session);

  const url = new URL(request.url);
  const items = await listApplications(url.searchParams);

  return NextResponse.json({ items });
}
