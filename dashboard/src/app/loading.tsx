export default function Loading() {
  return (
    <main className="container app-loading-shell" aria-busy="true" aria-live="polite">
      <section className="panel app-loading-card">
        <div className="app-loading-mark" aria-hidden="true" />
        <div className="app-loading-copy">
          <strong>Завантажуємо панель</strong>
          <span>Підтягуємо актуальні дані гільдії.</span>
        </div>
      </section>
      <section className="app-loading-grid" aria-hidden="true">
        <div />
        <div />
        <div />
      </section>
    </main>
  );
}
