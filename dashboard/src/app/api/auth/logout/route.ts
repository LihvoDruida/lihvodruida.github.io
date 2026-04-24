import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { getDashboardUrl } from "@/lib/oauth";

export async function POST() {
  await clearSession();
  return NextResponse.redirect(`${getDashboardUrl()}/login`);
}

export async function GET() {
  await clearSession();
  return NextResponse.redirect(`${getDashboardUrl()}/login`);
}
