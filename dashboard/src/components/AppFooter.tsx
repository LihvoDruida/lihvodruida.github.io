export default function AppFooter() {
  return (
    <footer className="app-footer" aria-label="Юридична інформація та навігація Mistblossom Vanguard">
      <div className="app-footer__inner">
        <div className="app-footer__brand">
          <strong>Mistblossom Vanguard</strong>
          <span>Гільдійна панель для профілів, рейдів, правил і Discord-ролей.</span>
        </div>
        <nav className="app-footer__links" aria-label="Юридичні сторінки">
          <a href="/terms">Умови використання</a>
          <a href="/privacy">Політика конфіденційності</a>
        </nav>
      </div>
    </footer>
  );
}
