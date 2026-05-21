import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/security";

function cleanProfileId(value: unknown) {
  const profileId = String(value || "").trim();
  return /^id[a-f0-9]{16,40}$/.test(profileId) ? profileId : "";
}

function safeProfilePath(value: unknown, profileId: string, fallbackPath: string) {
  const fallback = fallbackPath || `/profile/${profileId}`;
  const path = String(value || "").trim();
  if (!path || path.length > 1500 || !path.startsWith("/") || path.startsWith("//")) return fallback;

  try {
    const url = new URL(path, "https://dashboard.local");
    if (url.origin !== "https://dashboard.local") return fallback;
    if (url.pathname === `/profile/${profileId}` || url.pathname === `/profile/${profileId}/settings` || url.pathname === "/rules/accept") {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function profileActionReturnTo(form: FormData, profileIdInput: string, fallbackPath?: string) {
  const profileId = cleanProfileId(profileIdInput);
  if (!profileId) return "/profile";
  return safeProfilePath(form.get("returnTo"), profileId, fallbackPath || `/profile/${profileId}`);
}

export function redirectToProfileAction(
  request: NextRequest,
  profileIdInput: string,
  statusKey: string,
  status: string,
  returnTo?: string,
  fallbackPath?: string,
) {
  const profileId = cleanProfileId(profileIdInput);
  const targetPath = profileId ? safeProfilePath(returnTo, profileId, fallbackPath || `/profile/${profileId}`) : "/profile";
  const url = new URL(targetPath, request.url);
  if (statusKey && status) url.searchParams.set(statusKey, status);
  const response = NextResponse.redirect(url, 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}
