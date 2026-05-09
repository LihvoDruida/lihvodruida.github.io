"use client";

import { useEffect } from "react";
import { sendClientErrorReport } from "@/components/ClientErrorReporter";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    sendClientErrorReport(error, "react-error-boundary");
  }, [error]);

  return (
    <main className="container">
      <section className="dashboard-shell content-shell error-shell" aria-label="Помилка інтерфейсу">
        <article className="panel app-error-panel">
          <span className="eyebrow">Application error</span>
          <h1>Панель не змогла відкрити цей блок</h1>
          <p>Помилку записано в журнал дій. Натисни повторити або онови сторінку.</p>
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
