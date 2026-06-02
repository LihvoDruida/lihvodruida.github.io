"use client";

import { useState } from "react";
import { dashboardApiJson } from "@/lib/dashboardApiClient";
import { notifyDashboardDataChanged } from "@/lib/dashboardLiveRefresh";

type RefreshState = "idle" | "loading" | "done" | "error";

type GuildRosterRefreshPayload = {
  ok?: boolean;
  error?: string;
  memberCount?: number;
  hasMore?: boolean;
  refresh?: {
    raiderIo?: { remaining?: number; checked?: number };
    warcraftLogs?: { remaining?: number; checked?: number };
  };
};

export default function GuildRosterRefreshButton() {
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState("");

  async function refreshRoster() {
    if (state === "loading") return;
    setState("loading");
    setMessage("Оновлюю склад без довгого блокування сторінки…");

    try {
      const payload = await dashboardApiJson<GuildRosterRefreshPayload>("/api/guild/refresh", {
        method: "POST",
        headers: { "X-Dashboard-Action": "guild-roster-refresh" },
        json: { force: true, wcl: true },
        retries: 0,
      });
      if (payload?.ok === false) {
        throw new Error(payload?.error || "Оновлення не виконалось.");
      }

      const rioLeft = Math.max(0, Number(payload.refresh?.raiderIo?.remaining || 0));
      const wclLeft = Math.max(0, Number(payload.refresh?.warcraftLogs?.remaining || 0));
      const rioChecked = Math.max(0, Number(payload.refresh?.raiderIo?.checked || 0));
      const wclChecked = Math.max(0, Number(payload.refresh?.warcraftLogs?.checked || 0));
      const progress = rioLeft || wclLeft
        ? ` Батч: Raider.IO ${rioChecked} перевірено, WCL ${wclChecked} перевірено. Залишилось: Raider.IO ${rioLeft}, WCL ${wclLeft}.`
        : " Усі доступні кешовані API-дані актуальні.";

      setState("done");
      setMessage(`Оновлено: ${payload?.memberCount ?? 0} персонажів.${progress}`);
      notifyDashboardDataChanged({ scope: "guild", source: "guild-roster-refresh", action: "refresh" });
      window.setTimeout(() => {
        setState("idle");
        setMessage("");
      }, payload.hasMore ? 9000 : 5000);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не вдалося оновити склад.");
    }
  }

  return (
    <div className="guild-refresh-action">
      <button type="button" onClick={refreshRoster} disabled={state === "loading"} aria-busy={state === "loading"}>
        {state === "loading" ? "Оновлення…" : "Оновити склад"}
      </button>
      {message ? <span className={`guild-refresh-action__status guild-refresh-action__status--${state}`}>{message}</span> : null}
    </div>
  );
}
