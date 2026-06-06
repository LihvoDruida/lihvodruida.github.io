"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dispatchDashboardToast } from "@/lib/clientToasts";

type PollSnapshot = {
  ok?: boolean;
  poll?: {
    id?: string;
    status?: string;
    updatedAt?: string | null;
    votes?: unknown[];
  };
};

function pollRevision(data: PollSnapshot | null | undefined) {
  const poll = data?.poll;
  if (!poll) return "";
  return [poll.status || "", poll.updatedAt || "", Array.isArray(poll.votes) ? poll.votes.length : 0].join(":");
}

export default function RaidPollLiveSync({ pollId, initialRevision }: { pollId: string; initialRevision: string }) {
  const router = useRouter();
  const revisionRef = useRef(initialRevision);
  const [state, setState] = useState<"idle" | "syncing" | "updated" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function check() {
      if (document.visibilityState !== "visible") {
        timer = window.setTimeout(check, 12000);
        return;
      }
      setState("syncing");
      try {
        const response = await fetch(`/api/polls/${encodeURIComponent(pollId)}`, {
          method: "GET",
          headers: { Accept: "application/json", "X-Dashboard-Action": "poll-live-sync" },
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null) as PollSnapshot | null;
        if (!response.ok || !data?.ok) throw new Error("poll_sync_failed");
        const nextRevision = pollRevision(data);
        if (nextRevision && nextRevision !== revisionRef.current) {
          revisionRef.current = nextRevision;
          setState("updated");
          dispatchDashboardToast({
            tone: "info",
            title: "Рейд-пул оновлено",
            message: "Нові голоси з Discord синхронізовано з сайтом.",
            ttl: 3200,
          });
          router.refresh();
        } else {
          setState("idle");
        }
      } catch {
        setState("error");
      } finally {
        if (!cancelled) timer = window.setTimeout(check, 8000);
      }
    }

    timer = window.setTimeout(check, 3500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pollId, router]);

  const label = state === "syncing" ? "Синхронізація" : state === "updated" ? "Оновлено" : state === "error" ? "Sync retry" : "Live sync";
  return (
    <div className={`raid-poll-live-sync raid-poll-live-sync--${state}`} role="status" aria-live="polite">
      <span aria-hidden="true" />
      {label}
    </div>
  );
}
