import { NextResponse } from "next/server";
import { getDashboardUrl } from "@/lib/oauth";

export async function GET() {
  return NextResponse.redirect(`${getDashboardUrl()}/login?error=discord_only`);
}
