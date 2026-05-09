"use client";

import { useEffect } from "react";
import { isTransientClientStreamError, sendClientErrorReport } from "@/components/ClientErrorReporter";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const message = error?.message || "";
  const isTransient = isTransientClientStreamError(message);

  useEffect(() => {
    sendClientErrorReport(error, "react-error-boundary");
  }, [error]);

  return (
    <main className="container">
      <section className="dashboard-shell content-shell error-shell" aria-label="Помилка інтерфейсу">
        <article className="panel app-error-panel">
          <span className="eyebrow">{isTransient ? "Connection interrupted" : "Application error"}</span>
          <h1>{isTransient ? "Зʼєднання перервалося під час відкриття сторінки" : "Панель не змогла відкрити цей блок"}</h1>
          <p>{isTransient ? "Це схоже на обрив браузерного/Next.js stream-запиту. Дані не змінювались. Онови сторінку або натисни повторити." : "Помилку записано в журнал дій. Натисни повторити або онови сторінку."}</p>
          {error?.digest ? <small>Код: {error.digest}</small> : null}
          <div className="form-actions">
            <button className="btn primary" type="button" onClick={() => reset()}>Повторити</button>
            <button className="btn subtle" type="button" onClick={() => window.location.reload()}>Оновити сторінку</button>
          </div>
        </article>
      </section>
    </main>
  );
}
