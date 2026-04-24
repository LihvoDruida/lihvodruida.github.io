"use client";

import { useMemo, useState, useTransition } from "react";

type StatusKey = "review" | "accepted" | "declined";

type Props = {
  issueNumber: number;
  initialStatus: StatusKey;
};

const LABELS: Record<StatusKey, string> = {
  review: "На розгляді",
  accepted: "Прийнято",
  declined: "Відхилено",
};

export default function ApplicationStatusActions({ issueNumber, initialStatus }: Props) {
  const [status, setStatus] = useState<StatusKey>(initialStatus);
  const [pendingStatus, setPendingStatus] = useState<StatusKey | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const busy = isPending || pendingStatus !== null;

  const statusText = useMemo(() => LABELS[status] || LABELS.review, [status]);

  function moderate(nextStatus: Exclude<StatusKey, "review">) {
    if (busy || status === nextStatus) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setPendingStatus(nextStatus);
    setMessage("Виконується синхронізація...");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/applications/${issueNumber}/status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({ status: nextStatus }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.error) {
          throw new Error(data?.error || "Не вдалося змінити статус заявки.");
        }

        const confirmedStatus = (data?.status || nextStatus) as StatusKey;
        setStatus(confirmedStatus);
        setMessage(
          data?.discord?.edited?.ok
            ? "Готово. GitHub і Discord синхронізовано."
            : "Готово. GitHub оновлено, Discord отримав fallback-повідомлення або був пропущений."
        );
      } catch (error) {
        setStatus(previousStatus);
        setMessage(error instanceof Error ? error.message : "Помилка синхронізації.");
      } finally {
        setPendingStatus(null);
      }
    });
  }

  return (
    <div className="action-panel" data-status={status}>
      <div className={`status-pill status-pill--${status}`}>
        <span className="status-dot" />
        {busy ? "Виконується..." : statusText}
      </div>

      <button
        type="button"
        className="action-button action-button--accept"
        disabled={busy || status === "accepted"}
        aria-busy={pendingStatus === "accepted"}
        onClick={() => moderate("accepted")}
      >
        {pendingStatus === "accepted" ? "Приймаємо..." : "Прийняти"}
      </button>

      <button
        type="button"
        className="action-button action-button--decline"
        disabled={busy || status === "declined"}
        aria-busy={pendingStatus === "declined"}
        onClick={() => moderate("declined")}
      >
        {pendingStatus === "declined" ? "Відхиляємо..." : "Відхилити"}
      </button>

      <small className={`sync-message ${message.includes("Помилка") ? "sync-message--error" : ""}`}>
        {message || "Issue відкрито"}
      </small>
    </div>
  );
}
