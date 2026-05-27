"use client";

import { useEffect, useState } from "react";
import {
  DASHBOARD_BACKGROUND_REFRESH_MIN_MS,
  refreshDashboardApiResources,
} from "@/lib/dashboardBackgroundApi";
import {
  DASHBOARD_DATA_MUTATED_EVENT,
  DASHBOARD_LAST_MUTATION_STORAGE_KEY,
  type DashboardDataMutationDetail,
} from "@/lib/dashboardLiveRefresh";

type RefreshState = "idle" | "checking" | "paused" | "offline";
type DataMutationEvent = CustomEvent<DashboardDataMutationDetail>;

function isTextEditingElement(element: Element | null) {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

function hasActiveEditor() {
  if (typeof document === "undefined") return false;
  if (isTextEditingElement(document.activeElement)) return true;
  return Boolean(document.querySelector('form[data-submitting="true"], [aria-busy="true"]'));
}

function isIgnorableExtensionMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return /Could not establish connection\. Receiving end does not exist|Extension context invalidated/i.test(message);
}

type Props = {
  refreshMinMs?: number;
};

function normalizeRefreshMinMs(value?: number) {
  const number = Number(value);
  const clean = Number.isFinite(number) ? Math.floor(number) : DASHBOARD_BACKGROUND_REFRESH_MIN_MS;
  return Math.max(DASHBOARD_BACKGROUND_REFRESH_MIN_MS, clean);
}

export const DASHBOARD_BACKGROUND_API_SETTINGS_UPDATED_EVENT = "dashboard:background-api-settings-updated";

type BackgroundApiSettingsUpdatedEvent = CustomEvent<{ backgroundRefreshMinSeconds?: number }>;

export default function DashboardBackgroundApiRefresh({ refreshMinMs: refreshMinMsInput }: Props) {
  const [state, setState] = useState<RefreshState>("idle");
  const [refreshMinMs, setRefreshMinMs] = useState(() => normalizeRefreshMinMs(refreshMinMsInput));

  useEffect(() => {
    setRefreshMinMs(normalizeRefreshMinMs(refreshMinMsInput));
  }, [refreshMinMsInput]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadRuntimeSettings() {
      try {
        const response = await fetch("/api/background/settings", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null) as { settings?: { backgroundRefreshMinSeconds?: unknown } } | null;
        const nextSeconds = Number(payload?.settings?.backgroundRefreshMinSeconds);
        if (!cancelled && Number.isFinite(nextSeconds)) setRefreshMinMs(normalizeRefreshMinMs(nextSeconds * 1000));
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          // Keep the safe local fallback if runtime settings cannot be loaded.
        }
      }
    }

    function onBackgroundApiSettingsUpdated(event: Event) {
      const detail = (event as BackgroundApiSettingsUpdatedEvent).detail || {};
      const nextSeconds = Number(detail.backgroundRefreshMinSeconds);
      if (Number.isFinite(nextSeconds)) setRefreshMinMs(normalizeRefreshMinMs(nextSeconds * 1000));
    }

    void loadRuntimeSettings();
    window.addEventListener(DASHBOARD_BACKGROUND_API_SETTINGS_UPDATED_EVENT, onBackgroundApiSettingsUpdated);
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener(DASHBOARD_BACKGROUND_API_SETTINGS_UPDATED_EVENT, onBackgroundApiSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isIgnorableExtensionMessage(event.reason)) event.preventDefault();
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function schedule(delay = refreshMinMs, reason = "interval") {
      clearTimer();
      if (cancelled) return;
      timer = window.setTimeout(() => void refresh(reason), Math.max(5_000, delay));
    }

    async function refresh(reason: string, options: { force?: boolean; scope?: DashboardDataMutationDetail["scope"] } = {}) {
      if (cancelled) return;

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState("offline");
        schedule(refreshMinMs, reason);
        return;
      }

      if (!options.force && document.visibilityState === "hidden") {
        setState("paused");
        schedule(refreshMinMs, reason);
        return;
      }

      if (!options.force && hasActiveEditor()) {
        setState("paused");
        schedule(30_000, reason);
        return;
      }

      setState("checking");
      await refreshDashboardApiResources({ reason, force: options.force, scope: options.scope });
      if (!cancelled) setState("idle");
      schedule(refreshMinMs, "interval");
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refresh("visible");
    }

    function onFocus() {
      void refresh("focus");
    }

    function onOnline() {
      void refresh("online", { force: false });
    }

    function onDataMutated(event: Event) {
      const detail = (event as DataMutationEvent).detail || {};
      void refresh(detail.scope ? `mutation:${detail.scope}` : "mutation", { force: true, scope: detail.scope });
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== DASHBOARD_LAST_MUTATION_STORAGE_KEY || !event.newValue) return;
      try {
        const detail = JSON.parse(event.newValue) as DashboardDataMutationDetail;
        void refresh("cross-tab-mutation", { force: true, scope: detail.scope });
      } catch {
        void refresh("cross-tab-mutation", { force: true });
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener(DASHBOARD_DATA_MUTATED_EVENT, onDataMutated);
    window.addEventListener("storage", onStorage);
    schedule(refreshMinMs, "interval");

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(DASHBOARD_DATA_MUTATED_EVENT, onDataMutated);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshMinMs]);

  return (
    <span className="live-data-refresh-status sr-only" aria-live="polite" data-state={state}>
      {state === "checking" ? "Фоново оновлюємо API-дані." : "Фонове API-оновлення активне."}
    </span>
  );
}
