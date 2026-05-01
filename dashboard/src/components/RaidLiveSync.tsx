"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dispatchDashboardToast } from "@/lib/clientToasts";

type LiveState = "idle" | "checking" | "updated" | "offline";

type RaidSnapshot = {
  ok?: boolean;
  revision?: string;
  roster?: number;
  capacity?: number;
};

export default function RaidLiveSync({ raidId, initialRevision }: { raidId: string; initialRevision: string }) {
  const router = useRouter();
  const revisionRef = useRef(initialRevision);
  const [state, setState] = useState<LiveState>("idle");
  const [rosterLabel, setRosterLabel] = useState("");

  useEffect(() => {
    revisionRef.current = initialRevision;
  }, [initialRevision]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function check() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(check, 12000);
        return;
      }

      setState("checking");
      try {
        const response = await fetch(`/api/raids/${encodeURIComponent(raidId)}/snapshot`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => null)) as RaidSnapshot | null;
        if (!response.ok || !data?.ok || !data.revision) throw new Error("snapshot_failed");

        if (typeof data.roster === "number" && typeof data.capacity === "number") {
          setRosterLabel(`${data.roster}/${data.capacity}`);
        }

        if (data.revision !== revisionRef.current) {
          revisionRef.current = data.revision;
          setState("updated");
          router.refresh();
          dispatchDashboardToast({
            tone: "info",
            title: "Рейд оновлено",
            message: "Склад або статус рейду змінився. Дані на сторінці оновлюються автоматично.",
            ttl: 3600,
          });
        } else {
          setState("idle");
        }
      } catch {
        setState("offline");
      } finally {
        if (!cancelled) timer = window.setTimeout(check, 10000);
      }
    }

    timer = window.setTimeout(check, 2500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [raidId, router]);

  const label = state === "checking"
    ? "Перевіряємо зміни"
    : state === "updated"
      ? "Оновлено"
      : state === "offline"
        ? "Автооновлення призупинено"
        : "Автооновлення активне";

  return (
    <div className={`raid-live-sync raid-live-sync--${state}`} role="status" aria-live="polite">
      <span className="raid-live-sync__dot" aria-hidden="true" />
      <span>{label}</span>
      {rosterLabel ? <strong>{rosterLabel}</strong> : null}
    </div>
  );
}
