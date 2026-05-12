"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [leftMs, setLeftMs] = useState(() => remainingMs(expiresAt));
  const [expired, setExpired] = useState(() => remainingMs(expiresAt) <= 0);
  const initialLabel = useMemo(() => formatRemaining(leftMs), [leftMs]);

  useEffect(() => {
    let cleared = false;

    async function expireCandidates() {
      if (cleared) return;
      cleared = true;
      setExpired(true);
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
      const next = remainingMs(expiresAt);
      setLeftMs(next);
      if (next <= 0) void expireCandidates();
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return (
    <span className={`profile-candidate-expiry${expired ? " is-expired" : ""}`} title="Час доступності тимчасового списку Battle.net">
      <span aria-hidden="true">⏳</span>
      <span>{expired ? "час вийшов" : initialLabel}</span>
    </span>
  );
}
