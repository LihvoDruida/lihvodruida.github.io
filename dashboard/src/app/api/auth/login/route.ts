import { NextResponse } from "next/server";
import { createSessionCookie, verifyToken } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  if (!verifyToken(token)) {
    return NextResponse.redirect(new URL("/login?error=token", request.url), 303);
  }
  await createSessionCookie({ provider: "token", id: "local", name: "Local admin", role: "admin" });
  return NextResponse.redirect(new URL("/", request.url), 303);
}
