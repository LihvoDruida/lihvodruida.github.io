"use client";

import { useMemo, useState, useTransition } from "react";

type StatusKey = "review" | "accepted" | "declined";

type Props = {
  issueNumber: number;
  initialStatus: StatusKey;
  issueState?: string;
};

const LABELS: Record<StatusKey, string> = {
  review: "На розгляді",
  accepted: "Прийнято",
  declined: "Відхилено",
};

const BUSY_LABELS: Record<Exclude<StatusKey, "review">, string> = {
  accepted: "Приймаємо...",
  declined: "Відхиляємо...",
};

export default function ApplicationStatusActions({
  issueNumber,
  initialStatus,
  issueState = "open",
}: Props) {
  const [status, setStatus] = useState<StatusKey>(initialStatus);
  const [pendingStatus, setPendingStatus] = useState<Exclude<StatusKey, "review"> | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const isClosed = issueState === "closed";
  const busy = isPending || pendingStatus !== null;

  const statusText = useMemo(() => {
    if (busy && pendingStatus) return "Виконується...";
    return LABELS[status] || LABELS.review;
  }, [busy, pendingStatus, status]);

  const canAccept = !isClosed && !busy && status !== "accepted";
  const canDecline = !isClosed && !busy && status !== "declined";

  function moderate(nextStatus: Exclude<StatusKey, "review">) {
    if (isClosed || busy || status === nextStatus) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setPendingStatus(nextStatus);
    setMessage("Синхронізуємо GitHub і Discord...");

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

        if (data?.discord?.edited?.ok) {
          setMessage("Готово. GitHub Issue і Discord embed оновлено.");
        } else if (data?.discord?.notified?.ok) {
          setMessage("Готово. GitHub оновлено, у Discord надіслано повідомлення.");
        } else {
          setMessage("Готово. GitHub оновлено. Discord не підтвердив редагування.");
        }
      } catch (error) {
        setStatus(previousStatus);
        setMessage(error instanceof Error ? error.message : "Помилка синхронізації.");
      } finally {
        setPendingStatus(null);
      }
    });
  }

  return (
    <div
      className="action-panel"
      data-status={status}
      data-busy={busy ? "true" : "false"}
      data-closed={isClosed ? "true" : "false"}
    >
      <div className={`status-pill status-pill--${status}`}>
        <span className="status-dot" />
        {statusText}
      </div>

      <button
        type="button"
        className="action-button action-button--accept"
        disabled={!canAccept}
        aria-disabled={!canAccept}
        aria-busy={pendingStatus === "accepted"}
        onClick={() => moderate("accepted")}
      >
        {pendingStatus === "accepted" ? BUSY_LABELS.accepted : status === "accepted" ? "Прийнято" : "Прийняти"}
      </button>

      <button
        type="button"
        className="action-button action-button--decline"
        disabled={!canDecline}
        aria-disabled={!canDecline}
        aria-busy={pendingStatus === "declined"}
        onClick={() => moderate("declined")}
      >
        {pendingStatus === "declined" ? BUSY_LABELS.declined : status === "declined" ? "Відхилено" : "Відхилити"}
      </button>

      <small className={`sync-message ${message.includes("Помилка") || message.includes("не підтвердив") ? "sync-message--warning" : ""}`}>
        {isClosed ? "Issue закрито — модерація завершена" : message || "Очікує дії модератора"}
      </small>
    </div>
  );
}
