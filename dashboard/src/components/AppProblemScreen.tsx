"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  isTransientClientStreamError,
  sendClientErrorReport,
} from "@/components/ClientErrorReporter";

type ProblemKind = "technical" | "quota" | "access" | "auth" | "not-found";
type ErrorReportSource = "manual" | "window-error" | "unhandled-rejection" | "react-error-boundary";

type Props = {
  kind?: ProblemKind;
  title?: string;
  eyebrow?: string;
  message?: string;
  digest?: string;
  error?: Error & { digest?: string };
  reset?: () => void;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  reportContext?: ErrorReportSource;
};

function kindDefaults(kind: ProblemKind) {
  if (kind === "quota") {
    return {
      eyebrow: "Firebase protection",
      title: "Тимчасова технічна помилка",
      message:
        "Сховище тимчасово обмежене або перевищило квоту. Сайт зупинив важкі читання й записи, щоб не добивати Firebase-ліміти.",
      primaryLabel: "Оновити сторінку",
    };
  }

  if (kind === "access") {
    return {
      eyebrow: "Access policy",
      title: "Немає доступу до розділу",
      message:
        "Поточна група доступу не має потрібного дозволу для цієї сторінки. Перевір Discord-роль або звернись до адміністратора груп доступу.",
      primaryLabel: "До профілю",
    };
  }

  if (kind === "auth") {
    return {
      eyebrow: "Authorization required",
      title: "Потрібен повторний вхід",
      message:
        "Сесія застаріла або права доступу змінилися. Увійди через Discord ще раз, щоб оновити групу та дозволи.",
      primaryLabel: "Увійти",
    };
  }

  if (kind === "not-found") {
    return {
      eyebrow: "404",
      title: "Сторінку не знайдено",
      message:
        "Адреса неправильна, сторінку перенесли або профіль більше недоступний.",
      primaryLabel: "До панелі",
    };
  }

  return {
    eyebrow: "Technical issue",
    title: "Тимчасова технічна помилка",
    message:
      "Сторінка не змогла безпечно отримати дані. Ми не запускаємо додаткові важкі запити, щоб не збільшувати навантаження. Спробуй повторити пізніше або онови сторінку.",
    primaryLabel: "Повторити",
  };
}

function reloadPage() {
  if (typeof window !== "undefined") window.location.reload();
}

export default function AppProblemScreen({
  kind = "technical",
  title,
  eyebrow,
  message,
  digest,
  error,
  reset,
  primaryHref,
  primaryLabel,
  secondaryHref = "/",
  secondaryLabel = "До панелі",
  reportContext,
}: Props) {
  const rawMessage = error?.message || "";
  const transient = isTransientClientStreamError(rawMessage);
  const effectiveKind = transient ? "technical" : kind;
  const defaults = kindDefaults(effectiveKind);
  const finalEyebrow = eyebrow || (transient ? "Connection interrupted" : defaults.eyebrow);
  const finalTitle = title || (transient ? "Зʼєднання перервалося під час відкриття сторінки" : defaults.title);
  const finalMessage = message || (transient
    ? "Це схоже на обрив браузерного stream-запиту. Дані не змінювались. Онови сторінку або натисни повторити."
    : defaults.message);
  const finalDigest = digest || error?.digest;

  useEffect(() => {
    if (error) sendClientErrorReport(error, reportContext || "react-error-boundary");
  }, [error, reportContext]);

  const primaryButtonLabel = primaryLabel || defaults.primaryLabel;
  const primaryAction = reset || reloadPage;

  return (
    <main className="container">
      <section
        className={`dashboard-shell content-shell error-shell error-shell--${effectiveKind}`}
        aria-label={finalTitle}
      >
        <article className="panel app-error-panel">
          <span className="eyebrow">{finalEyebrow}</span>
          <h1>{finalTitle}</h1>
          <p>{finalMessage}</p>
          {finalDigest ? <small>Код: {finalDigest}</small> : null}
          <div className="form-actions">
            {primaryHref ? (
              <Link className="btn primary" href={primaryHref}>{primaryButtonLabel}</Link>
            ) : (
              <button className="btn primary" type="button" onClick={primaryAction}>{primaryButtonLabel}</button>
            )}
            {secondaryHref ? (
              <Link className="btn subtle" href={secondaryHref}>{secondaryLabel}</Link>
            ) : (
              <button className="btn subtle" type="button" onClick={reloadPage}>Оновити сторінку</button>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
