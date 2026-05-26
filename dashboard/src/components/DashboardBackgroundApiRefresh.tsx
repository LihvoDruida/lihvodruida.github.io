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

export default function DashboardBackgroundApiRefresh() {
  const [state, setState] = useState<RefreshState>("idle");

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

    function schedule(delay = DASHBOARD_BACKGROUND_REFRESH_MIN_MS, reason = "interval") {
      clearTimer();
      if (cancelled) return;
      timer = window.setTimeout(() => void refresh(reason), Math.max(5_000, delay));
    }

    async function refresh(reason: string, options: { force?: boolean; scope?: DashboardDataMutationDetail["scope"] } = {}) {
      if (cancelled) return;

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState("offline");
        schedule(DASHBOARD_BACKGROUND_REFRESH_MIN_MS, reason);
        return;
      }

      if (!options.force && document.visibilityState === "hidden") {
        setState("paused");
        schedule(DASHBOARD_BACKGROUND_REFRESH_MIN_MS, reason);
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
      schedule(DASHBOARD_BACKGROUND_REFRESH_MIN_MS, "interval");
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
    schedule(DASHBOARD_BACKGROUND_REFRESH_MIN_MS, "interval");

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(DASHBOARD_DATA_MUTATED_EVENT, onDataMutated);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <span className="live-data-refresh-status sr-only" aria-live="polite" data-state={state}>
      {state === "checking" ? "Фоново оновлюємо API-дані." : "Фонове API-оновлення активне."}
    </span>
  );
}
