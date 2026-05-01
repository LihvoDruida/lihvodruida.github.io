"use client";

import { useEffect, useMemo, useState } from "react";

type IntegrationState = "ok" | "warning" | "error" | "unconfigured";

type IntegrationStatusItem = {
  key: string;
  label: string;
  state: IntegrationState;
  message: string;
  checkedAt: string;
};

type IntegrationStatusSummary = {
  checkedAt: string;
  items: IntegrationStatusItem[];
};

function formatCheckedAt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusText(state: IntegrationState) {
  if (state === "ok") return "працює";
  if (state === "warning") return "увага";
  if (state === "unconfigured") return "не налаштовано";
  return "помилка";
}

export default function IntegrationStatusPanel({ compact = false }: { compact?: boolean }) {
  const [summary, setSummary] = useState<IntegrationStatusSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadStatus(signal?: AbortSignal) {
    try {
      setError("");
      const response = await fetch("/api/integrations/status", {
        headers: { accept: "application/json", "X-Dashboard-Action": "integration-status" },
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) throw new Error(data?.error || "Не вдалося перевірити інтеграції.");
      setSummary(data);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Не вдалося перевірити інтеграції.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadStatus(controller.signal);
    const timer = window.setInterval(() => loadStatus(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const items = summary?.items || [];
  const hasProblem = useMemo(() => items.some((item) => item.state === "error" || item.state === "warning" || item.state === "unconfigured"), [items]);

  return (
    <section className={`integration-status-panel panel${compact ? " integration-status-panel--compact" : ""}`} data-problem={hasProblem ? "true" : "false"} aria-label="Стан інтеграцій">
      <div className="integration-status-head">
        <div>
          <strong>Стан системи</strong>
          <span>Discord, Battle.net, GitHub і Firebase</span>
        </div>
        <button className="btn subtle btn-sm" type="button" onClick={() => loadStatus()} disabled={loading} aria-busy={loading}>{loading ? "..." : "Оновити"}</button>
      </div>

      {error ? <p className="integration-status-error">{error}</p> : null}

      <div className="integration-status-grid">
        {(items.length ? items : ["Discord", "Battle.net", "GitHub Issues", "Firebase"].map((label, index) => ({ key: `${index}`, label, state: "warning" as IntegrationState, message: loading ? "перевіряємо" : "немає даних", checkedAt: summary?.checkedAt || "" }))).map((item) => (
          <div className="integration-status-item" data-state={item.state} key={item.key} title={item.message}>
            <span className="integration-status-dot" aria-hidden="true" />
            <strong>{item.label}</strong>
            <small>{item.message || statusText(item.state)}</small>
          </div>
        ))}
      </div>

      <div className="integration-status-foot">
        <span>Остання перевірка: {formatCheckedAt(summary?.checkedAt)}</span>
      </div>
    </section>
  );
}
