import Link from "next/link";
import type { Metadata } from "next";
import { getGuildBranding } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Сторінку не знайдено",
  description: "Ця сторінка гільдійної панелі недоступна або була переміщена.",
  robots: {
    index: false,
    follow: false,
  },
};

const quickLinks = [
  {
    href: "/",
    title: "Панель заявок",
    description: "Повернутися до головного списку заявок.",
  },
  {
    href: "/profiles",
    title: "Профілі",
    description: "Знайти учасника або відкрити свій профіль.",
  },
  {
    href: "/raids",
    title: "Рейди",
    description: "Переглянути розклад і склади рейдів.",
  },
];

export default async function NotFound() {
  const guild = await getGuildBranding();

  return (
    <main className="not-found-screen">
      <div className="not-found-screen__backdrop" aria-hidden="true">
        <span className="not-found-glow not-found-glow--gold" />
        <span className="not-found-glow not-found-glow--violet" />
        <span className="not-found-grid" />
        <span className="not-found-ornament not-found-ornament--top" />
        <span className="not-found-ornament not-found-ornament--bottom" />
      </div>

      <section className="not-found-shell" aria-labelledby="not-found-title">
        <div className="not-found-card">
          <div className="not-found-card__header">
            <span className="not-found-pill">404</span>
            <span className="not-found-status">Сторінку не знайдено</span>
          </div>

          <div className="not-found-brandmark" aria-hidden="true">
            <img src={guild.iconUrl} alt="" width={68} height={68} loading="eager" referrerPolicy="no-referrer" />
            <span />
          </div>

          <p className="not-found-eyebrow">{guild.name}</p>
          <h1 id="not-found-title">
            Цей портал
            <span>не відкрився</span>
          </h1>
          <p className="not-found-lead">
            Адреса неправильна, профіль міг бути видалений або сторінку перенесли. Дані не змінювались — просто обери потрібний розділ нижче.
          </p>

          <div className="not-found-actions" aria-label="Швидка навігація">
            <Link className="btn primary" href="/">
              До панелі
            </Link>
            <Link className="btn subtle" href="/profiles">
              До профілів
            </Link>
          </div>

          <div className="not-found-links" aria-label="Корисні розділи">
            {quickLinks.map((item) => (
              <Link key={item.href} href={item.href} className="not-found-link-card">
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
