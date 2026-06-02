"use client";

import { useEffect, useRef } from "react";
import { dispatchDashboardToast } from "@/lib/clientToasts";

type ClientErrorPayload = {
  message: string;
  stack?: string;
  source:
    | "window-error"
    | "unhandled-rejection"
    | "react-error-boundary"
    | "manual";
  pathname: string;
  userAgent: string;
};

function errorMessage(value: unknown) {
  if (value instanceof Error)
    return value.message || value.name || "Client error";
  if (value && typeof value === "object" && "message" in value)
    return String((value as { message?: unknown }).message || "Client error");
  return String(value || "Client error");
}

function errorStack(value: unknown) {
  if (value instanceof Error) return value.stack || "";
  if (value && typeof value === "object" && "stack" in value)
    return String((value as { stack?: unknown }).stack || "");
  return "";
}

export function isIgnorableClientError(message: string) {
  return /Could not establish connection\. Receiving end does not exist|Extension context invalidated|ResizeObserver loop completed with undelivered notifications|Connection closed\.?|Error in input stream/i.test(
    message,
  );
}

export function isTransientClientStreamError(message: string) {
  return /Connection closed\.?|Error in input stream/i.test(message);
}

async function reportClientError(payload: ClientErrorPayload) {
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dashboard-action": "client-error",
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(payload),
    });
  } catch {
    // Logging must never create another visible failure.
  }
}

export function sendClientErrorReport(
  error: unknown,
  source: ClientErrorPayload["source"] = "manual",
) {
  if (typeof window === "undefined") return;
  const message = errorMessage(error).slice(0, 500);
  if (!message || isIgnorableClientError(message)) return;

  void reportClientError({
    message,
    stack: errorStack(error).slice(0, 4000),
    source,
    pathname: window.location.pathname + window.location.search,
    userAgent: navigator.userAgent,
  });
}

export default function ClientErrorReporter() {
  const reported = useRef<Set<string>>(new Set());

  useEffect(() => {
    function emit(error: unknown, source: ClientErrorPayload["source"]) {
      const message = errorMessage(error).slice(0, 500);
      if (!message || isIgnorableClientError(message)) return;

      const key = `${source}:${window.location.pathname}:${message}`;
      if (reported.current.has(key)) return;
      reported.current.add(key);
      window.setTimeout(() => reported.current.delete(key), 60_000);

      sendClientErrorReport(error, source);
      dispatchDashboardToast({
        tone: "error",
        title: "Технічний збій",
        message:
          "Частина сторінки не оновилась. Спробуй повторити дію або онови сторінку.",
        ttl: 7200,
      });
    }

    function onError(event: ErrorEvent) {
      emit(event.error || event.message, "window-error");
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const message = errorMessage(event.reason);
      if (isIgnorableClientError(message)) {
        event.preventDefault();
        return;
      }
      emit(event.reason, "unhandled-rejection");
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
