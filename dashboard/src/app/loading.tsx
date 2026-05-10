export default function Loading() {
  return (
    <main className="container app-loading-page" aria-busy="true" aria-live="polite">
      <section className="dashboard-shell content-shell app-loading-shell">
        <header className="dashboard-topbar app-loading-topbar" aria-hidden="true">
          <div className="app-loading-brand-skeleton">
            <span className="app-loading-avatar-skeleton" />
            <span>
              <i />
              <b />
            </span>
          </div>
          <div className="app-loading-nav-skeleton">
            <i />
            <i />
            <i />
          </div>
          <div className="app-loading-user-skeleton">
            <span />
            <i />
          </div>
        </header>

        <section className="panel app-loading-card">
          <div className="app-loading-mark" aria-hidden="true" />
          <div className="app-loading-copy">
            <strong>Завантажуємо панель</strong>
            <span>Підтягуємо актуальні дані гільдії, профілю та Discord.</span>
          </div>
        </section>

        <section className="app-loading-grid" aria-hidden="true">
          <div />
          <div />
          <div />
        </section>
      </section>
    </main>
  );
}
