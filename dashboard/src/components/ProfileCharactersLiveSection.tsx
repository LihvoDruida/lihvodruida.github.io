"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardProfile, ProfileCharacter } from "@/lib/profiles";
import { wowRoleLabel } from "@/lib/wowRoles";

type RefreshState = "idle" | "checking" | "updated" | "skipped" | "offline" | "error";

type ProfileRefreshPayload = {
  ok?: boolean;
  profileId?: string;
  refreshed?: number;
  failed?: number;
  skipped?: number;
  locked?: boolean;
  throttled?: boolean;
  checkedAt?: string;
  profile?: {
    updatedAt?: string | null;
    battlenet?: DashboardProfile["battlenet"];
    characters?: ProfileCharacter[];
  } | null;
};

type Props = {
  profileId: string;
  initialCharacters: ProfileCharacter[];
  initialUpdatedAt?: string | null;
  canManage: boolean;
  showMainBadge: boolean;
  returnTo?: string;
  candidateCount: number;
  emptyMessage: string;
  refreshMinMs?: number;
};

type InFlightRefresh = Promise<ProfileRefreshPayload | null>;

const DEFAULT_REFRESH_MIN_MS = 10 * 60 * 1000;
const LAST_REFRESH_PREFIX = "mistblossom.profile.externalRefresh";
const inFlightRefreshes = new Map<string, InFlightRefresh>();

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function storageKey(profileId: string) {
  return `${LAST_REFRESH_PREFIX}:${profileId}`;
}

function dateMillis(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function newestMillis(...values: Array<string | null | undefined>) {
  return values.reduce<number | null>((latest, value) => {
    const time = dateMillis(value);
    if (time === null) return latest;
    return latest === null ? time : Math.max(latest, time);
  }, null);
}

function readStoredRefreshAt(profileId: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { checkedAt?: unknown } | null;
    const checkedAt = readNumber(parsed?.checkedAt);
    return checkedAt && checkedAt > 0 ? checkedAt : null;
  } catch {
    return null;
  }
}

function writeStoredRefreshAt(profileId: string, checkedAt = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(profileId), JSON.stringify({ checkedAt }));
  } catch {
    // Storage can be blocked in private mode. Server-side throttling still protects APIs.
  }
}

function formatCompactDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short" }).format(date);
}

function pickImageUrl(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      const path = url.pathname;
      const avatarPath = path.replace(/-(?:main-raw|main)\.png$/i, "-avatar.jpg");
      if (avatarPath !== path) {
        url.pathname = avatarPath;
        return url.toString();
      }
      if (/\.(?:png|jpe?g|webp)$/i.test(path)) return url.toString();
    } catch {
      // Ignore malformed media URL.
    }
  }
  return null;
}

function characterVisualUrl(character?: Pick<ProfileCharacter, "renderUrl" | "avatarUrl" | "mediaUrl"> | null) {
  if (!character) return null;
  return character.renderUrl || pickImageUrl(character.avatarUrl, character.mediaUrl);
}

function characterAuxMeta(character: Pick<ProfileCharacter, "level" | "raceName" | "faction">) {
  return [
    typeof character.level === "number" ? `Lvl ${character.level}` : null,
    character.raceName || null,
    character.faction || null,
  ].filter(Boolean) as string[];
}

function visibleCharacters(characters: ProfileCharacter[]) {
  return [...characters].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    if (a.verifiedGuild !== b.verifiedGuild) return a.verifiedGuild ? -1 : 1;
    return a.name.localeCompare(b.name, "uk");
  });
}

function CharacterArtwork({ character }: { character: ProfileCharacter }) {
  const image = characterVisualUrl(character);
  if (image) {
    return <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }
  return <span className="profile-character-artwork__fallback" aria-hidden="true">{character.name.charAt(0)}</span>;
}

function CharacterCard({ character, canManage, showMainBadge, returnTo = "" }: { character: ProfileCharacter; canManage: boolean; showMainBadge: boolean; returnTo?: string }) {
  const classLabel = character.className || "Клас невідомий";
  const specLabel = character.activeSpecName ? `${character.activeSpecName} • ${classLabel}` : classLabel;
  const roleLabel = wowRoleLabel(character.activeSpecRole);
  const itemLevel = typeof character.itemLevel === "number" ? character.itemLevel : null;
  const rioScore = typeof character.raiderIo?.currentScore === "number" ? Math.round(character.raiderIo.currentScore) : null;
  const rioUrl = character.raiderIo?.profileUrl || null;
  const realmLabel = character.realmName || character.realmSlug || "Реалм —";
  const extraMeta = characterAuxMeta(character);
  const guildBadge = character.verifiedGuild
    ? { label: "Гільдійний", icon: "🌿", className: "is-guild" }
    : { label: "Інший", icon: "🤝", className: "is-other" };

  return (
    <article className={`profile-character-card${showMainBadge && character.isMain ? " is-main" : ""} ${guildBadge.className}`} aria-label={`${showMainBadge && character.isMain ? "Основний персонаж" : "Персонаж"}: ${character.name}`}>
      <div className="profile-character-artwork">
        <CharacterArtwork character={character} />
        {showMainBadge && character.isMain ? <span className="profile-main-badge profile-main-badge--art">Мейн</span> : null}
      </div>
      <div className="profile-character-body">
        <div className="profile-character-title-row profile-character-title-row--stacked">
          <div>
            <h3>{character.name}</h3>
            <p>{realmLabel}</p>
          </div>
          <span className={`profile-character-kind profile-character-kind--${guildBadge.className}`}>{guildBadge.icon} {guildBadge.label}</span>
        </div>

        <div className="profile-character-meta">
          <span>{specLabel}</span>
          <span>{roleLabel}</span>
          <span>{realmLabel}</span>
          {extraMeta.map((value) => <span key={value}>{value}</span>)}
        </div>

        <div className="profile-character-showcase">
          <div className="profile-character-showcase__stat">
            <small>ilvl</small>
            <strong>{itemLevel ?? "—"}</strong>
          </div>
          <div className="profile-character-showcase__stat profile-character-showcase__stat--secondary">
            <small>Рівень</small>
            <strong>{typeof character.level === "number" ? character.level : "—"}</strong>
          </div>
          <div className="profile-character-showcase__stat profile-character-showcase__stat--secondary">
            <small>RIO</small>
            <strong>{rioScore ?? "—"}</strong>
          </div>
          <div className="profile-character-showcase__stat profile-character-showcase__stat--secondary">
            <small>Оновлено</small>
            <strong>{formatCompactDate(character.lastSeenAt)}</strong>
          </div>
        </div>

        <div className="profile-character-actions">
          {rioUrl ? <a className="btn btn-ghost btn-sm" href={rioUrl} target="_blank" rel="noreferrer">Raider.IO</a> : null}
          {canManage && !character.isMain ? (
            <form action="/api/profile/characters/main" method="post">
              <input type="hidden" name="characterKey" value={character.key} />
              {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
              <button className="btn btn-ghost btn-sm" type="submit">Зробити мейном</button>
            </form>
          ) : null}
          {canManage ? (
            <form action="/api/profile/characters/remove" method="post">
              <input type="hidden" name="characterKey" value={character.key} />
              {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
              <button className="btn btn-danger btn-sm" type="submit">Видалити</button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function shouldRefresh(profileId: string, initialUpdatedAt: string | null | undefined, refreshMinMs: number) {
  const storedAt = readStoredRefreshAt(profileId);
  const serverAt = dateMillis(initialUpdatedAt || null);
  const lastKnown = Math.max(storedAt || 0, serverAt || 0);
  return !lastKnown || Date.now() - lastKnown >= refreshMinMs;
}

async function fetchProfileRefresh(profileId: string, refreshMinMs: number, signal: AbortSignal) {
  const inFlight = inFlightRefreshes.get(profileId);
  if (inFlight) return inFlight;

  const promise = fetch(`/api/profile/${encodeURIComponent(profileId)}/refresh-external-data`, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Dashboard-Action": "profile-external-refresh",
    },
    body: JSON.stringify({ minSpacingSeconds: Math.ceil(refreshMinMs / 1000) }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => null) as ProfileRefreshPayload | null;
      if (!response.ok || !data?.ok) throw new Error("profile_refresh_failed");
      return data;
    })
    .finally(() => inFlightRefreshes.delete(profileId));

  inFlightRefreshes.set(profileId, promise);
  return promise;
}

export default function ProfileCharactersLiveSection({
  profileId,
  initialCharacters,
  initialUpdatedAt = null,
  canManage,
  showMainBadge,
  returnTo = "",
  candidateCount,
  emptyMessage,
  refreshMinMs = DEFAULT_REFRESH_MIN_MS,
}: Props) {
  const [characters, setCharacters] = useState(() => visibleCharacters(initialCharacters));
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt || null);
  const [state, setState] = useState<RefreshState>("idle");
  const refreshMinMsRef = useRef(Math.max(DEFAULT_REFRESH_MIN_MS, refreshMinMs));
  const initialUpdatedAtRef = useRef(initialUpdatedAt || null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setCharacters(visibleCharacters(initialCharacters));
    setUpdatedAt(initialUpdatedAt || null);
    initialUpdatedAtRef.current = initialUpdatedAt || null;
  }, [initialCharacters, initialUpdatedAt]);

  const runRefresh = useCallback(async (reason: "mount" | "focus" | "visible" | "online") => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (mountedRef.current) setState("offline");
      return;
    }
    if (!shouldRefresh(profileId, initialUpdatedAtRef.current, refreshMinMsRef.current)) {
      if (mountedRef.current) setState("skipped");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    if (mountedRef.current) setState("checking");

    try {
      const data = await fetchProfileRefresh(profileId, refreshMinMsRef.current, controller.signal);
      const refreshedCharacters = Array.isArray(data?.profile?.characters) ? data.profile.characters : [];
      if (mountedRef.current && refreshedCharacters.length) setCharacters(visibleCharacters(refreshedCharacters));

      const nextUpdatedAt = data?.profile?.battlenet?.lastProfileViewRefreshAt
        || data?.profile?.battlenet?.lastCharacterRefreshAt
        || data?.profile?.battlenet?.lastSyncAt
        || data?.profile?.updatedAt
        || data?.checkedAt
        || new Date().toISOString();
      if (mountedRef.current) setUpdatedAt(nextUpdatedAt);
      initialUpdatedAtRef.current = nextUpdatedAt;
      writeStoredRefreshAt(profileId);
      if (mountedRef.current) setState(data?.throttled || data?.refreshed === 0 ? "skipped" : "updated");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      if (mountedRef.current) setState("error");
    } finally {
      window.clearTimeout(timeout);
      void reason;
    }
  }, [profileId]);

  useEffect(() => {
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cancelled = false;
    const runWhenReady = () => {
      if (!cancelled) void runRefresh("mount");
    };
    const idleHandle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(runWhenReady, { timeout: 2500 })
      : window.setTimeout(runWhenReady, 1200);

    function refreshOnFocus() {
      void runRefresh("focus");
    }

    function refreshOnVisible() {
      if (document.visibilityState === "visible") void runRefresh("visible");
    }

    function refreshOnOnline() {
      void runRefresh("online");
    }

    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("online", refreshOnOnline);
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      cancelled = true;
      if (idleWindow.cancelIdleCallback && typeof idleHandle === "number") {
        idleWindow.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("online", refreshOnOnline);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [runRefresh]);

  const guildCount = useMemo(() => characters.filter((item) => item.verifiedGuild).length, [characters]);
  const otherCount = Math.max(0, characters.length - guildCount);
  const effectiveUpdatedAt = useMemo(() => {
    const characterLastSeen = characters.reduce<number | null>((latest, character) => {
      const time = newestMillis(character.lastSeenAt, character.raiderIo?.updatedAt);
      if (time === null) return latest;
      return latest === null ? time : Math.max(latest, time);
    }, null);
    const toolbarTime = Math.max(dateMillis(updatedAt) || 0, characterLastSeen || 0);
    return toolbarTime > 0 ? new Date(toolbarTime).toISOString() : null;
  }, [characters, updatedAt]);

  const statusLabel = state === "checking"
    ? "Персонажі оновлюються у фоні"
    : state === "updated"
      ? "Дані персонажів оновлено без перезавантаження"
      : state === "offline"
        ? "Фонове оновлення призупинено без мережі"
        : state === "error"
          ? "Фонове оновлення не вдалося"
          : "Фонове оновлення активне";

  return (
    <>
      <div className="profile-card-toolbar profile-card-toolbar--compact" aria-label="Стан персонажів">
        <span><strong>{guildCount}</strong><small>Гільдійні</small></span>
        <span><strong>{otherCount}</strong><small>Інші</small></span>
        <span data-profile-candidate-summary="true"><strong data-profile-candidate-count="true">{candidateCount}</strong><small>Можна додати</small></span>
        <span><strong>{formatCompactDate(effectiveUpdatedAt)}</strong><small>Оновлено</small></span>
      </div>

      <span className="sr-only" role="status" aria-live="polite" data-profile-refresh-state={state}>{statusLabel}</span>

      {characters.length ? (
        <div className="profile-character-list profile-character-list--single-flow">
          {characters.map((character) => (
            <CharacterCard
              key={character.key}
              character={character}
              canManage={canManage}
              showMainBadge={showMainBadge}
              returnTo={returnTo}
            />
          ))}
        </div>
      ) : (
        <div className="profile-empty-characters">
          <strong>Персонажів ще немає</strong>
          <span>{emptyMessage}</span>
        </div>
      )}
    </>
  );
}
