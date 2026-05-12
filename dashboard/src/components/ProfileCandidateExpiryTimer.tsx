"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  expiresAt: string;
};

function remainingMs(expiresAt: string) {
  const target = new Date(expiresAt).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, target - Date.now());
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function ProfileCandidateExpiryTimer({ expiresAt }: Props) {
  const cleanupStartedRef = useRef(false);
  const [leftMs, setLeftMs] = useState<number | null>(null);
  const expired = leftMs !== null && leftMs <= 0;
  const label = useMemo(() => {
    if (leftMs === null) return "—:—";
    return expired ? "час вийшов" : formatRemaining(leftMs);
  }, [expired, leftMs]);

  useEffect(() => {
    cleanupStartedRef.current = false;
    let cancelled = false;

    async function expireCandidates() {
      if (cleanupStartedRef.current) return;
      cleanupStartedRef.current = true;
      setLeftMs(0);
      document.querySelector<HTMLElement>('[data-profile-candidates-box="true"]')?.setAttribute("hidden", "true");
      document.querySelectorAll<HTMLElement>('[data-profile-candidate-count="true"]').forEach((item) => {
        item.textContent = "0";
      });
      try {
        await fetch("/api/profile/battlenet/candidates/expire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresAt }),
          cache: "no-store",
        });
      } catch {
        // The next server render also prunes expired candidates, so a network error is non-fatal.
      }
    }

    const tick = () => {
      if (cancelled) return;
      const next = remainingMs(expiresAt);
      setLeftMs(next);
      if (next <= 0) void expireCandidates();
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [expiresAt]);

  return (
    <span className={`profile-candidate-expiry${expired ? " is-expired" : ""}`} title="Час доступності тимчасового списку Battle.net">
      <span aria-hidden="true">⏳</span>
      <span suppressHydrationWarning>{label}</span>
    </span>
  );
}
