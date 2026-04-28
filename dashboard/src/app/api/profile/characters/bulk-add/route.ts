import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { BNET_CANDIDATES_COOKIE, parseBattleNetCandidatesCookieValue, removeCandidatesFromCookie } from "@/lib/battlenetCandidates";
import { addProfileCharacters } from "@/lib/profiles";
import { characterAddStatusFromError } from "@/lib/profileCharacterStatus";
import { assertRequestBodySize, checkRateLimit, forbiddenResponse, getClientIp, logDashboardEvent, noStoreHeaders, rateLimitResponse, safeErrorMessage, verifyTrustedOrigin } from "@/lib/security";

function redirectToProfile(request: NextRequest, profileId: string, status: string) {
  const response = NextResponse.redirect(new URL(`/profile/${profileId}?characterStatus=${encodeURIComponent(status)}`, request.url), 303);
  for (const [key, value] of Object.entries(noStoreHeaders())) response.headers.set(key, value);
  return response;
}

function cleanKeys(values: FormDataEntryValue[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))).slice(0, 50);
}

function statusForNoop(result: Awaited<ReturnType<typeof addProfileCharacters>>) {
  const reasons = Object.values(result.skippedReasons || {});
  if (!result.validRequested) return "characters_bulk_no_verified";
  if (reasons.length && reasons.every((reason) => reason === "duplicate")) return "characters_bulk_all_duplicates";
  if (reasons.some((reason) => reason === "limit")) return "characters_bulk_limit_reached";
  return "characters_bulk_noop";
}

export async function POST(request: NextRequest) {
  if (!verifyTrustedOrigin(request)) return forbiddenResponse();

  const tooLarge = assertRequestBodySize(request, 16 * 1024);
  if (tooLarge) return tooLarge;

  const session = await getSession();
  if (!session?.profileId) return NextResponse.redirect(new URL("/login", request.url), 303);

  const ip = getClientIp(request);
  const limit = checkRateLimit(`profile-character-bulk-add:${session.profileId}:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return rateLimitResponse(limit.resetAt);

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
      validRequested: result.validRequested,
      added: result.added,
      skipped: result.skipped,
      skippedReasons: result.skippedReasons,
    });

    if (result.added <= 0) {
      return redirectToProfile(request, session.profileId, statusForNoop(result));
    }

    const response = redirectToProfile(request, session.profileId, result.skipped > 0 ? "characters_added_partial" : result.added > 1 ? "characters_added" : "character_added");
    removeCandidatesFromCookie(response, candidateCookie, session.profileId, result.addedKeys);
    return response;
  } catch (error) {
    const status = characterAddStatusFromError(error);
    logDashboardEvent("warn", "profile.character.bulk_failed", request, { profileId: session.profileId, mode, status, message: safeErrorMessage(error) });
    return redirectToProfile(request, session.profileId, status === "character_add_not_guild" ? "characters_bulk_no_verified" : status);
  }
}
