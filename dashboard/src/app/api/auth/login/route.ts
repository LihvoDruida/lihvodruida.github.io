import { NextResponse } from "next/server";
import { createSessionCookie, verifyToken } from "@/src/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  if (!verifyToken(token)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }
  await createSessionCookie();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
