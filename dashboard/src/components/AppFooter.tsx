import SectionIcon from "@/components/SectionIcon";

export default function AppFooter() {
  return (
    <footer className="app-footer" aria-label="Юридична інформація Mistblossom Vanguard">
      <div className="app-footer__inner">
        <div className="app-footer__brand">
          <span className="app-footer__brand-icon" aria-hidden="true"><SectionIcon name="guild" className="dashboard-section-icon dashboard-section-icon--footer" /></span>
          <div>
            <strong>Mistblossom Vanguard</strong>
            <span>Панель профілів, рейдів, правил і Discord-ролей.</span>
          </div>
        </div>
        <nav className="app-footer__links" aria-label="Юридичні сторінки">
          <a href="/terms"><SectionIcon name="terms" className="dashboard-section-icon dashboard-section-icon--footer-link" aria-hidden="true" />Умови</a>
          <a href="/privacy"><SectionIcon name="privacy" className="dashboard-section-icon dashboard-section-icon--footer-link" aria-hidden="true" />Приватність</a>
        </nav>
      </div>
    </footer>
  );
}
