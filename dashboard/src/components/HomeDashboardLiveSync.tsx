"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const VISIBLE_REFRESH_MS = 60_000;
const HIDDEN_REFRESH_MS = 5 * 60_000;
const MIN_MANUAL_REFRESH_MS = 8_000;

type HomeLiveSyncProps = {
  initialRevision: string;
};

function liveLabel(state: "idle" | "syncing" | "updated") {
  if (state === "syncing") return "Оновлюємо";
  if (state === "updated") return "Оновлено";
  return "Live sync";
}

export default function HomeDashboardLiveSync({ initialRevision }: HomeLiveSyncProps) {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const lastRefreshRef = useRef(0);
  const [state, setState] = useState<"idle" | "syncing" | "updated">("idle");

  useEffect(() => {
    let cancelled = false;

    function clearTimer() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function schedule(delay = document.visibilityState === "visible" ? VISIBLE_REFRESH_MS : HIDDEN_REFRESH_MS) {
      clearTimer();
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => refresh("interval"), delay);
    }

    function refresh(_reason: string, force = false) {
      if (cancelled) return;
      const now = Date.now();
      if (!force && now - lastRefreshRef.current < MIN_MANUAL_REFRESH_MS) {
        schedule();
        return;
      }
      lastRefreshRef.current = now;
      setState("syncing");
      router.refresh();
      window.setTimeout(() => {
        if (cancelled) return;
        setState("updated");
        window.setTimeout(() => {
          if (!cancelled) setState("idle");
        }, 1800);
      }, 380);
      schedule();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh("visible", true);
      else schedule(HIDDEN_REFRESH_MS);
    }

    function onRaidUpdated() {
      refresh("raid-updated", true);
    }

    function onPollUpdated() {
      refresh("poll-updated", true);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("dashboard:raid-updated", onRaidUpdated);
    window.addEventListener("dashboard:raid-poll-updated", onPollUpdated);
    schedule(25_000);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("dashboard:raid-updated", onRaidUpdated);
      window.removeEventListener("dashboard:raid-poll-updated", onPollUpdated);
    };
  }, [router]);

  return (
    <div className={`home-live-sync home-live-sync--${state}`} role="status" aria-live="polite" data-revision={initialRevision.slice(0, 48)}>
      <span aria-hidden="true" />
      {liveLabel(state)}
    </div>
  );
}
