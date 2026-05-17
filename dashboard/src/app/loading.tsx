export default function Loading() {
  return (
    <main className="container app-loading-page" aria-busy="true" aria-live="polite">
      <section className="app-loading-shell" role="status" aria-label="Завантаження панелі">
        <div className="app-loading-card">
          <span className="app-loading-mark" aria-hidden="true" />

          <div className="app-loading-copy">
            <span className="app-loading-eyebrow">Панель гільдії</span>
            <h1>Завантажуємо панель</h1>
            <p>Підтягуємо профіль, права доступу та Discord.</p>
          </div>
        </div>

        <div className="app-loading-progress" aria-hidden="true" />

        <ol className="app-loading-steps" aria-label="Етапи завантаження">
          <li className="is-ready">Профіль</li>
          <li>Права доступу</li>
          <li>Discord</li>
        </ol>
      </section>
    </main>
  );
}
