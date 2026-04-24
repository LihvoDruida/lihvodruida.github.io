import { NextResponse } from "next/server";
import { isAuthenticated } from "@/src/lib/auth";
import { listApplications } from "@/src/lib/github";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const items = await listApplications(url.searchParams);
    return NextResponse.json({ items, total: items.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
