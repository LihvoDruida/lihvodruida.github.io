"use client";

import { useRef, useState } from "react";
import { dashboardApiJson } from "@/lib/dashboardApiClient";
import { notifyDashboardDataChanged } from "@/lib/dashboardLiveRefresh";

type RefreshState = "idle" | "loading" | "done" | "error";

type GuildRosterRefreshPayload = {
  ok?: boolean;
  error?: string;
  memberCount?: number;
  hasMore?: boolean;
  refresh?: {
    sync?: {
      status?: string;
      phase?: string;
      totalMembers?: number;
      processed?: {
        roster?: number;
        raiderIo?: number;
        warcraftLogs?: number;
      };
    };
    raiderIo?: {
      remaining?: number;
      checked?: number;
      totalCandidates?: number;
    };
    warcraftLogs?: {
      remaining?: number;
      checked?: number;
      totalCandidates?: number;
    };
  };
};

type GuildRosterRefreshSettings = {
  clientDrivenSyncEnabled?: boolean;
  clientStepDelayMs?: number;
  clientRequestTimeoutMs?: number;
  clientMaxSteps?: number;
};

type Props = {
  settings?: GuildRosterRefreshSettings;
};

function boundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function phaseLabel(phase?: string) {
  if (phase === "roster") return "Battle.net склад";
  if (phase === "raiderio") return "Raider.IO";
  if (phase === "warcraftlogs") return "Warcraft Logs";
  if (phase === "completed") return "завершено";
  if (phase === "failed") return "помилка";
  return "очікування";
}

export default function GuildRosterRefreshButton({ settings }: Props) {
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState("");
  const runIdRef = useRef(0);

  const clientDrivenSyncEnabled = settings?.clientDrivenSyncEnabled !== false;
  const maxSteps = boundedInt(settings?.clientMaxSteps, 2200, 1, 10_000);
  const stepDelayMs = boundedInt(settings?.clientStepDelayMs, 250, 0, 5_000);
  const requestTimeoutMs = boundedInt(
    settings?.clientRequestTimeoutMs,
    40_000,
    5_000,
    60_000,
  );

  async function runRefreshStep(step: number) {
    return dashboardApiJson<GuildRosterRefreshPayload>("/api/guild/refresh", {
      method: "POST",
      headers: { "X-Dashboard-Action": "guild-roster-refresh" },
      json: {
        force: step === 0,
        continue: step > 0,
        wcl: true,
        includeMembers: false,
      },
      retries: 0,
      timeoutMs: requestTimeoutMs,
    });
  }

  async function refreshRoster() {
    if (state === "loading") return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setState("loading");
    setMessage(
      clientDrivenSyncEnabled
        ? "Запускаю покрокову синхронізацію з браузера без 45s timeout…"
        : "Запускаю один серверний крок синхронізації…",
    );

    try {
      let payload: GuildRosterRefreshPayload | null = null;
      const stepsToRun = clientDrivenSyncEnabled ? maxSteps : 1;

      for (let step = 0; step < stepsToRun; step += 1) {
        if (runIdRef.current !== runId) return;

        payload = await runRefreshStep(step);

        if (payload?.ok === false) {
          throw new Error(payload?.error || "Оновлення не виконалось.");
        }

        notifyDashboardDataChanged({
          scope: "guild",
          source: "guild-roster-refresh",
          action: "refresh-step",
          revision: `${Date.now()}-${step}`,
        });

        const sync = payload.refresh?.sync;
        const rioLeft = Math.max(
          0,
          Number(payload.refresh?.raiderIo?.remaining || 0),
        );
        const wclLeft = Math.max(
          0,
          Number(payload.refresh?.warcraftLogs?.remaining || 0),
        );
        const processedRio = Math.max(
          0,
          Number(sync?.processed?.raiderIo || 0),
        );
        const processedWcl = Math.max(
          0,
          Number(sync?.processed?.warcraftLogs || 0),
        );
        const total = Math.max(
          0,
          Number(sync?.totalMembers || payload.memberCount || 0),
        );

        setMessage(
          `Синхронізація: ${phaseLabel(sync?.phase)}. Склад: ${payload.memberCount ?? 0}. Raider.IO ${processedRio}/${total}, WCL ${processedWcl}/${total}. Залишилось: Raider.IO ${rioLeft}, WCL ${wclLeft}.`,
        );

        if (
          !payload.hasMore ||
          sync?.status === "completed" ||
          sync?.status === "failed"
        )
          break;
        if (!clientDrivenSyncEnabled) break;
        if (stepDelayMs > 0) await wait(stepDelayMs);
      }

      if (payload?.refresh?.sync?.status === "failed") {
        throw new Error(
          payload.error || "Синхронізація зупинилась з помилкою.",
        );
      }

      setState("done");
      setMessage(
        payload?.hasMore && !clientDrivenSyncEnabled
          ? `Перший крок виконано: персонажів у кеші ${payload?.memberCount ?? 0}. Увімкни клієнтський цикл або натискай повторно для продовження.`
          : `Готово: склад синхронізовано, персонажів: ${payload?.memberCount ?? 0}.`,
      );
      notifyDashboardDataChanged({
        scope: "guild",
        source: "guild-roster-refresh",
        action: "refresh-complete",
      });
      window.setTimeout(() => {
        setState("idle");
        setMessage("");
      }, 7000);
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Не вдалося оновити склад.",
      );
    }
  }

  return (
    <div className="guild-refresh-action">
      <button
        type="button"
        onClick={refreshRoster}
        disabled={state === "loading"}
        aria-busy={state === "loading"}
      >
        {state === "loading" ? "Синхронізація…" : "Оновити склад"}
      </button>
      {message ? (
        <span
          className={`guild-refresh-action__status guild-refresh-action__status--${state}`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
