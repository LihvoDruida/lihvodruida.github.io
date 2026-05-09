"use client";

import { useEffect } from "react";
import { sendClientErrorReport } from "@/components/ClientErrorReporter";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    sendClientErrorReport(error, "react-error-boundary");
  }, [error]);

  return (
    <html lang="uk">
      <body>
        <main className="container">
          <section className="dashboard-shell content-shell error-shell" aria-label="Критична помилка інтерфейсу">
            <article className="panel app-error-panel">
              <span className="eyebrow">Application error</span>
              <h1>Панель тимчасово не відкрилась</h1>
              <p>Клієнтську помилку записано в журнал. Повтори дію або онови сторінку.</p>
              {error?.digest ? <small>Код: {error.digest}</small> : null}
              <div className="form-actions">
                <button className="btn primary" type="button" onClick={() => reset()}>Повторити</button>
                <button className="btn subtle" type="button" onClick={() => window.location.reload()}>Оновити сторінку</button>
              </div>
            </article>
          </section>
        </main>
      </body>
    </html>
  );
}
