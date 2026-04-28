import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { BNET_CANDIDATES_COOKIE, parseBattleNetCandidatesCookieValue, removeCandidatesFromCookie } from "@/lib/battlenetCandidates";
import { addProfileCharacters } from "@/lib/profiles";
import { forbiddenResponse, logDashboardEvent, noStoreHeaders, safeErrorMessage, verifyTrustedOrigin } from "@/lib/security";

function redirectToProfile(request: NextRequest, profileId: string, status: string) {
  const response = NextResponse.redirect(new URL(`/profile/${profileId}?characterStatus=${encodeURIComponent(status)}`, request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

function cleanKeys(values: FormDataEntryValue[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))).slice(0, 50);
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse();

  const session = await getSession();
  if (!session?.profileId) return NextResponse.redirect(new URL("/login", request.url), 303);

  const [form, store] = await Promise.all([request.formData(), cookies()]);
  const mode = String(form.get("mode") || "selected");
  const selectedKeys = cleanKeys(form.getAll("characterKeys"));
  const candidateCookie = store.get(BNET_CANDIDATES_COOKIE)?.value || "";
  const candidateSession = parseBattleNetCandidatesCookieValue(candidateCookie, session.profileId);

  if (!candidateSession?.characters.length) {
    logDashboardEvent("warn", "profile.character.bulk_missing_reauth", request, { profileId: session.profileId, mode });
    return redirectToProfile(request, session.profileId, "character_reauth_required");
  }

  const selectedSet = new Set(selectedKeys);
  const candidates = mode === "all"
    ? candidateSession.characters
    : candidateSession.characters.filter((candidate) => selectedSet.has(candidate.key));

  if (!candidates.length) {
    logDashboardEvent("warn", "profile.character.bulk_empty", request, { profileId: session.profileId, mode, selected: selectedKeys.length });
    return redirectToProfile(request, session.profileId, "characters_bulk_empty");
  }

  try {
    const result = await addProfileCharacters(session.profileId, candidates);
    logDashboardEvent("info", "profile.character.bulk_added", request, {
      profileId: session.profileId,
      mode,
      requested: candidates.length,
      added: result.added,
      skipped: result.skipped,
    });

    if (result.added <= 0) {
      return redirectToProfile(request, session.profileId, "characters_bulk_noop");
    }

    const response = redirectToProfile(request, session.profileId, result.added > 1 ? "characters_added" : "character_added");
    removeCandidatesFromCookie(response, candidateCookie, session.profileId, result.addedKeys);
    return response;
  } catch (error) {
    logDashboardEvent("warn", "profile.character.bulk_failed", request, { profileId: session.profileId, mode, message: safeErrorMessage(error) });
    return redirectToProfile(request, session.profileId, "character_add_failed");
  }
}
