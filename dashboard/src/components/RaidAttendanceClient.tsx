"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dispatchDashboardToast } from "@/lib/clientToasts";

type RaidSignupStatus = "going" | "late" | "skipped";
type ToastPayload = {
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  message?: string;
  ttl?: number;
};

type RaidAttendanceClientProps = {
  raidId: string;
  closed: boolean;
  full: boolean;
  viewerAlreadyActive: boolean;
  activeJoinDisabled: boolean;
  skipDisabled: boolean;
  showRequirement: boolean;
  requirementTitle: string;
  requirementMessage: string;
  loginHref: string;
  profileHref: string;
  rulesHref: string;
  title?: string;
};

function toastFromResponse(data: unknown, responseOk: boolean): ToastPayload {
  if (data && typeof data === "object" && "toast" in data) {
    const toast = (data as { toast?: ToastPayload }).toast;
    if (toast?.title) return toast;
  }
  if (data && typeof data === "object" && "content" in data) {
    const message = String((data as { content?: unknown }).content || "").trim();
    if (message) return { tone: responseOk ? "success" : "error", title: responseOk ? "Запис оновлено" : "Запис не оновлено", message };
  }
  return responseOk
    ? { tone: "success", title: "Запис оновлено", message: "Склад рейду оновлено." }
    : { tone: "error", title: "Запис не оновлено", message: "Сервер не повернув зрозумілу відповідь." };
}

function actionLabel(action: RaidSignupStatus, busyAction: RaidSignupStatus | null, full: boolean, viewerAlreadyActive: boolean) {
  if (busyAction === action) return "Оновлюємо...";
  if (action === "going") return full && !viewerAlreadyActive ? "✓ Заповнено" : "✓ Підписатися";
  if (action === "late") return full && !viewerAlreadyActive ? "✕ Ліміт" : "🕒 Затримаюсь";
  return "↩ Пропустити";
}

export default function RaidAttendanceClient({
  raidId,
  closed,
  full,
  viewerAlreadyActive,
  activeJoinDisabled,
  skipDisabled,
  showRequirement,
  requirementTitle,
  requirementMessage,
  loginHref,
  profileHref,
  rulesHref,
  title,
}: RaidAttendanceClientProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<RaidSignupStatus | null>(null);

  async function submitAttendance(action: RaidSignupStatus) {
    if (busyAction) return;
    if ((action === "going" || action === "late") && activeJoinDisabled) return;
    if (action === "skipped" && skipDisabled) return;

    setBusyAction(action);
    dispatchDashboardToast({
      tone: "info",
      title: "Оновлюємо запис",
      message: "Записуємо дію та синхронізуємо склад сайту й Discord.",
      ttl: 3200,
    });

    const formData = new FormData();
    formData.set("action", action);

    try {
      const response = await fetch(`/api/raids/${encodeURIComponent(raidId)}/attendance`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-Dashboard-Action": "live",
        },
      });
      const data = await response.json().catch(() => null);
      const toast = toastFromResponse(data, response.ok);

      dispatchDashboardToast({
        tone: toast.tone || (response.ok ? "success" : "error"),
        title: toast.title || (response.ok ? "Запис оновлено" : "Запис не оновлено"),
        message: toast.message,
        ttl: toast.ttl || (response.ok ? 4600 : 8200),
      });

      const loginUrl = data && typeof data === "object" && "loginUrl" in data
        ? String((data as { loginUrl?: unknown }).loginUrl || "")
        : "";
      if (!response.ok && loginUrl) {
        window.setTimeout(() => window.location.assign(loginUrl), 650);
        return;
      }

      if (response.ok) {
        const revision = data && typeof data === "object" && "revision" in data
          ? String((data as { revision?: unknown }).revision || "")
          : "";
        window.dispatchEvent(new CustomEvent("dashboard:raid-updated", { detail: { raidId, revision, source: "site" } }));
        router.refresh();
      }
    } catch {
      dispatchDashboardToast({
        tone: "error",
        title: "Немає відповіді від сервера",
        message: "Перевір інтернет або повтори дію через кілька секунд.",
        ttl: 8200,
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="raid-attendance-stack">
      {showRequirement ? (
        <div className="raid-action-requirement" role="note">
          <strong>{requirementTitle}</strong>
          <span>{requirementMessage}</span>
          <span className="raid-action-requirement-links">
            <a href={loginHref}>Увійти через Discord</a>
            <a href={profileHref}>Відкрити профіль</a>
            <a href={rulesHref} target="_blank" rel="noreferrer">Правила рейду</a>
          </span>
        </div>
      ) : null}

      <div
        className={`raid-preview-buttons raid-preview-buttons--interactive${busyAction ? " is-submitting" : ""}`}
        aria-disabled={closed || activeJoinDisabled}
        aria-busy={busyAction ? "true" : undefined}
      >
        <button
          className="raid-action raid-action--go"
          type="button"
          disabled={activeJoinDisabled || Boolean(busyAction)}
          title={title}
          onClick={() => submitAttendance("going")}
        >
          {actionLabel("going", busyAction, full, viewerAlreadyActive)}
        </button>
        <button
          className="raid-action raid-action--skip"
          type="button"
          disabled={skipDisabled || Boolean(busyAction)}
          title={skipDisabled ? title : undefined}
          onClick={() => submitAttendance("skipped")}
        >
          {actionLabel("skipped", busyAction, full, viewerAlreadyActive)}
        </button>
        <button
          className="raid-action raid-action--late"
          type="button"
          disabled={activeJoinDisabled || Boolean(busyAction)}
          title={title}
          onClick={() => submitAttendance("late")}
        >
          {actionLabel("late", busyAction, full, viewerAlreadyActive)}
        </button>
      </div>
    </div>
  );
}
