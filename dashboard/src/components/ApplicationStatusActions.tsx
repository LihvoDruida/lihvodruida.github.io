"use client";

import { useMemo, useState } from "react";

type StatusKey = "review" | "accepted" | "declined";

type Props = {
  issueNumber: number;
  initialStatus: StatusKey;
  issueState?: string;
  canModerate?: boolean;
};

const LABELS: Record<StatusKey, string> = {
  review: "На розгляді",
  accepted: "Прийнято",
  declined: "Відхилено",
};

const FINAL_STATUSES: Exclude<StatusKey, "review">[] = ["accepted", "declined"];

export default function ApplicationStatusActions({
  issueNumber,
  initialStatus,
  issueState = "open",
  canModerate = true,
}: Props) {
  const [status, setStatus] = useState<StatusKey>(initialStatus);
  const [selectedStatus, setSelectedStatus] = useState<Exclude<StatusKey, "review">>(
    initialStatus === "declined" ? "declined" : "accepted"
  );
  const [pendingStatus, setPendingStatus] = useState<Exclude<StatusKey, "review"> | null>(null);
  const [message, setMessage] = useState<string>("");

  const isClosed = issueState === "closed";
  const isFinalStatus = status === "accepted" || status === "declined";
  const locked = !canModerate || isClosed || isFinalStatus;
  const busy = pendingStatus !== null;

  const statusText = useMemo(() => {
    if (busy) return "Синхронізація...";
    return LABELS[status] || LABELS.review;
  }, [busy, status]);

  const canApply = canModerate && !locked && !busy && status === "review";

  const lockedMessage = !canModerate
    ? "Недостатньо ролі для модерації. Перегляд доступний, рішення вимкнені."
    : isClosed
      ? "GitHub Issue вже закрито. Повторна модерація вимкнена."
      : isFinalStatus
        ? `Модерація завершена: ${LABELS[status]}.`
        : "";

  async function moderate(nextStatus: Exclude<StatusKey, "review">) {
    if (!canApply) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setPendingStatus(nextStatus);
    setMessage("Оновлюємо GitHub Issue і Discord embed...");

    try {
      const response = await fetch(`/api/applications/${issueNumber}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Dashboard-Action": "moderate-application",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await response.json().catch(() => ({ error: "Сервер повернув не JSON-відповідь. Перевір Vercel/Cloudflare logs." }));

      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Не вдалося змінити статус заявки.");
      }

      const confirmedStatus = FINAL_STATUSES.includes(data?.status) ? data.status : nextStatus;
      setStatus(confirmedStatus);

      if (data?.discord?.edited?.ok) {
        setMessage("Готово: GitHub Issue і Discord embed оновлено.");
      } else if (data?.discord?.notified?.ok) {
        setMessage("Готово: GitHub оновлено, Discord отримав повідомлення.");
      } else {
        setMessage("GitHub оновлено. Discord не підтвердив редагування.");
      }
    } catch (error) {
      console.error("[dashboard:applications.status]", error);
      setStatus(previousStatus);
      setMessage(error instanceof Error ? error.message : "Помилка синхронізації.");
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <div
      className="action-panel"
      data-status={status}
      data-busy={busy ? "true" : "false"}
      data-closed={isClosed ? "true" : "false"}
      data-locked={locked ? "true" : "false"}
    >
      <div className={`status-pill status-pill--${status}`}>
        <span className="status-dot" />
        {statusText}
      </div>

      {!locked ? (
        <div className="action-row" aria-label="Зміна статусу заявки">
          <select
            className="select status-select"
            value={selectedStatus}
            disabled={!canApply}
            aria-label="Новий статус заявки"
            onChange={(event) => setSelectedStatus(event.target.value as Exclude<StatusKey, "review">)}
          >
            <option value="accepted">Прийняти заявку</option>
            <option value="declined">Відхилити заявку</option>
          </select>

          <button
            type="button"
            className="action-button action-button--primary"
            disabled={!canApply}
            aria-disabled={!canApply}
            aria-busy={busy}
            onClick={() => moderate(selectedStatus)}
          >
            {pendingStatus ? "Застосовуємо..." : "Застосувати"}
          </button>
        </div>
      ) : null}

      <small className={`sync-message ${message.includes("Помилка") || message.includes("не підтвердив") ? "sync-message--warning" : ""}`}>
        {locked ? lockedMessage : message || "Обери рішення і натисни “Застосувати”."}
      </small>
    </div>
  );
}
