import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { getProfileById } from "@/lib/profiles";
import { saveAndMaybePublishRaid } from "@/lib/raids";
import { noStoreHeaders, safeErrorMessage } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || process.env.ADMIN_DASHBOARD_URL || "http://localhost:3000";
}

function redirectToRaids(params: Record<string, string | undefined>) {
  const url = new URL("/raids", appBaseUrl());
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { headers: noStoreHeaders() });
}

function redirectToRaidEdit(raidId: string, params: Record<string, string | undefined>) {
  const url = new URL(`/raids/${encodeURIComponent(raidId)}/edit`, appBaseUrl());
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user || !canManageRaids(user)) return redirectToRaids({ error: "Твоя роль не має доступу до керування рейдами." });

  try {
    const form = await request.formData();
    const profile = user.profileId ? await getProfileById(user.profileId) : null;
    const result = await saveAndMaybePublishRaid(form, user, profile);
    return redirectToRaidEdit(result.raid.id, { saved: "1", published: result.published || undefined });
  } catch (error) {
    return redirectToRaids({ error: safeErrorMessage(error) });
  }
}
