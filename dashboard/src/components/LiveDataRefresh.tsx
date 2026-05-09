"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DASHBOARD_DATA_MUTATED_EVENT,
  DASHBOARD_DATA_REFRESHED_EVENT,
  DASHBOARD_LAST_MUTATION_STORAGE_KEY,
  type DashboardDataMutationDetail,
} from "@/lib/dashboardLiveRefresh";

type RefreshPolicy = {
  enabled: boolean;
  intervalMs: number;
  minSpacingMs: number;
  label: string;
  focusRefresh: boolean;
  skipWhenEditing: boolean;
};

type RefreshState = "idle" | "checking" | "paused" | "offline";

type DataMutationEvent = CustomEvent<DashboardDataMutationDetail>;

const DEFAULT_POLICY: RefreshPolicy = {
  enabled: true,
  intervalMs: 60_000,
  minSpacingMs: 12_000,
  label: "дані",
  focusRefresh: true,
  skipWhenEditing: true,
};

function routePolicy(pathname: string): RefreshPolicy {
  if (!pathname || pathname === "/login") {
    return { ...DEFAULT_POLICY, enabled: false, label: "вхід" };
  }

  if (pathname === "/") {
    return { ...DEFAULT_POLICY, intervalMs: 35_000, minSpacingMs: 10_000, label: "заявки" };
  }

  if (pathname === "/raids") {
    return { ...DEFAULT_POLICY, intervalMs: 25_000, minSpacingMs: 8_000, label: "рейди" };
  }

  if (pathname === "/raids/new") {
    return { ...DEFAULT_POLICY, intervalMs: 90_000, minSpacingMs: 15_000, label: "чернетка рейду" };
  }

  if (/^\/raids\/[^/]+$/.test(pathname)) {
    // The raid details page has its own revision-based RaidLiveSync. Keep focus/event refresh only here.
    return { ...DEFAULT_POLICY, intervalMs: 0, minSpacingMs: 7_000, label: "рейд" };
  }

  if (pathname === "/profiles") {
    return { ...DEFAULT_POLICY, intervalMs: 55_000, minSpacingMs: 12_000, label: "профілі" };
  }

  if (pathname === "/profile") {
    return { ...DEFAULT_POLICY, intervalMs: 55_000, minSpacingMs: 12_000, label: "профіль" };
  }

  if (pathname.startsWith("/profile/")) {
    // Profile detail pages are heavy and can be opened by previews/crawlers.
    // Do not run global RSC refresh here: real profile actions already redirect
    // or update their own UI, while background refresh can leave noisy aborted
    // `_rsc` fetches in the browser console.
    return { ...DEFAULT_POLICY, enabled: false, intervalMs: 0, label: "профіль", focusRefresh: false };
  }

  if (pathname === "/guild") {
    return { ...DEFAULT_POLICY, intervalMs: 90_000, minSpacingMs: 20_000, label: "ростер" };
  }

  if (pathname === "/discord" || pathname === "/discord/rules") {
    return { ...DEFAULT_POLICY, intervalMs: 75_000, minSpacingMs: 15_000, label: "Discord" };
  }

  if (pathname === "/discord/embed" || pathname === "/discord/rules/new" || pathname === "/discord/rules/edit" || pathname === "/content") {
    // Editors keep large controlled forms and live previews. Background refreshes
    // can replace server payload while a user is typing and cause hydration/client
    // state errors, so editor pages refresh only through explicit actions.
    return { ...DEFAULT_POLICY, enabled: false, intervalMs: 0, label: "редактор", focusRefresh: false };
  }

  if (pathname.startsWith("/admin")) {
    // Admin tools have many long-running forms and diagnostics. Do not run
    // background RSC refresh here: it can interrupt client state and make
    // browser-only errors look like random Application errors.
    return { ...DEFAULT_POLICY, enabled: false, intervalMs: 0, label: "адмін-панель", focusRefresh: false };
  }

  return DEFAULT_POLICY;
}

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
  const active = document.activeElement;
  if (isTextEditingElement(active)) return true;
  return Boolean(document.querySelector('form[data-submitting="true"], [aria-busy="true"]'));
}

function isIgnorableExtensionMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return /Could not establish connection\. Receiving end does not exist|Extension context invalidated/i.test(message);
}

function shouldHandleMutationOnPath(pathname: string, detail: DashboardDataMutationDetail) {
  const scope = detail.scope || "unknown";
  if (scope === "unknown" || scope === "session" || scope === "integrations") return true;
  if (scope === "applications") return pathname === "/";
  if (scope === "profiles" || scope === "profile") return pathname === "/profiles" || pathname === "/profile" || pathname.startsWith("/profile/") || pathname.startsWith("/raids");
  if (scope === "guild") return pathname === "/guild" || pathname === "/profiles" || pathname.startsWith("/profile/");
  if (scope === "raids") return pathname.startsWith("/raids") || pathname === "/profile" || pathname.startsWith("/profile/");
  if (scope === "discord") return pathname.startsWith("/discord") || pathname.startsWith("/raids");
  if (scope === "content") return pathname === "/content";
  return true;
}

export default function LiveDataRefresh() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const policy = useMemo(() => routePolicy(pathname), [pathname]);
  const [state, setState] = useState<RefreshState>("idle");
  const timerRef = useRef<number | null>(null);
  const lastRefreshRef = useRef(0);
  const lastEditRef = useRef(0);
  const pendingReasonRef = useRef("initial");
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    lastRefreshRef.current = 0;
    pendingReasonRef.current = "route-change";
    refreshInFlightRef.current = false;
  }, [pathname]);

  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      // This message is commonly produced by browser extensions trying to talk to a
      // disconnected content script. It is not actionable for the dashboard and it
      // otherwise appears as an app error while live refresh is active.
      if (isIgnorableExtensionMessage(event.reason)) event.preventDefault();
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  useEffect(() => {
    if (!policy.enabled) return undefined;

    let cancelled = false;

    function clearTimer() {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function schedule(delay = policy.intervalMs || 0, reason = "interval") {
      clearTimer();
      if (cancelled || delay <= 0) return;
      timerRef.current = window.setTimeout(() => requestRefresh(reason), delay);
    }

    function recentlyEdited() {
      return policy.skipWhenEditing && Date.now() - lastEditRef.current < 35_000;
    }

    function requestRefresh(reason: string, options: { force?: boolean } = {}) {
      if (cancelled || !policy.enabled) return;
      pendingReasonRef.current = reason;

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState("offline");
        schedule(Math.max(policy.intervalMs || 30_000, 30_000), reason);
        return;
      }

      if (!options.force && document.visibilityState === "hidden") {
        setState("paused");
        schedule(Math.max(policy.intervalMs || 30_000, 30_000), reason);
        return;
      }

      if (!options.force && (hasActiveEditor() || recentlyEdited())) {
        setState("paused");
        schedule(15_000, reason);
        return;
      }

      const elapsed = Date.now() - lastRefreshRef.current;
      if (!options.force && elapsed < policy.minSpacingMs) {
        schedule(policy.minSpacingMs - elapsed, reason);
        return;
      }

      if (refreshInFlightRef.current) {
        schedule(Math.max(policy.minSpacingMs, 5_000), reason);
        return;
      }

      lastRefreshRef.current = Date.now();
      refreshInFlightRef.current = true;
      setState("checking");
      try {
        startTransition(() => {
          router.refresh();
        });
        window.dispatchEvent(new CustomEvent(DASHBOARD_DATA_REFRESHED_EVENT, {
          detail: { label: policy.label, pathname, reason, timestamp: Date.now() },
        }));
      } catch (error) {
        console.warn("[LiveDataRefresh] Background refresh skipped", {
          pathname,
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      window.setTimeout(() => {
        refreshInFlightRef.current = false;
        if (!cancelled) setState("idle");
      }, 1_200);
      schedule(policy.intervalMs || 0, "interval");
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") requestRefresh("visible", { force: false });
    }

    function onFocus() {
      if (policy.focusRefresh) requestRefresh("focus", { force: false });
    }

    function onOnline() {
      requestRefresh("online", { force: true });
    }

    function onInput(event: Event) {
      const target = event.target instanceof Element ? event.target : null;
      if (isTextEditingElement(target)) lastEditRef.current = Date.now();
    }

    function onDataMutated(event: Event) {
      const detail = (event as DataMutationEvent).detail || {};
      if (!shouldHandleMutationOnPath(pathname, detail)) return;
      requestRefresh(detail.scope ? `mutation:${detail.scope}` : "mutation", { force: true });
    }

    function onRaidUpdated() {
      if (pathname.startsWith("/raids") || pathname === "/profile" || pathname.startsWith("/profile/")) {
        requestRefresh("raid-updated", { force: true });
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== DASHBOARD_LAST_MUTATION_STORAGE_KEY || !event.newValue) return;
      try {
        const detail = JSON.parse(event.newValue) as DashboardDataMutationDetail;
        if (shouldHandleMutationOnPath(pathname, detail)) requestRefresh("cross-tab-mutation", { force: true });
      } catch {
        requestRefresh("cross-tab-mutation", { force: true });
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("input", onInput, true);
    window.addEventListener("change", onInput, true);
    window.addEventListener(DASHBOARD_DATA_MUTATED_EVENT, onDataMutated);
    window.addEventListener("dashboard:raid-updated", onRaidUpdated);
    window.addEventListener("storage", onStorage);

    schedule(policy.intervalMs || 0, "interval");

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("input", onInput, true);
      window.removeEventListener("change", onInput, true);
      window.removeEventListener(DASHBOARD_DATA_MUTATED_EVENT, onDataMutated);
      window.removeEventListener("dashboard:raid-updated", onRaidUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname, policy, router]);

  if (!policy.enabled) return null;

  return (
    <span className="live-data-refresh-status sr-only" aria-live="polite" data-state={state}>
      {state === "checking" ? `Фоново оновлюємо ${policy.label}.` : "Фонове оновлення активне."}
    </span>
  );
}
