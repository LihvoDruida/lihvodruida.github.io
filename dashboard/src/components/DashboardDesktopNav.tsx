"use client";

import { useEffect, useId, useRef, useState } from "react";

type DashboardNavItem = {
  href: string;
  section: string;
  icon: string;
  label: string;
  desktopLabel: string;
};

export default function DashboardDesktopNav({
  primaryNavItems,
  secondaryNavItems,
  activeSection,
}: {
  primaryNavItems: DashboardNavItem[];
  secondaryNavItems: DashboardNavItem[];
  activeSection: string;
}) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const activeSecondaryItem = secondaryNavItems.find((item) => activeSection === item.section) || null;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!moreRef.current) return;
      if (!moreRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <nav className="dashboard-nav dashboard-nav--desktop" aria-label="Панель керування" data-items={primaryNavItems.length + secondaryNavItems.length}>
      {primaryNavItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={activeSection === item.section ? "is-active" : undefined}
          aria-current={activeSection === item.section ? "page" : undefined}
          title={item.desktopLabel}
        >
          <span>{item.desktopLabel}</span>
        </a>
      ))}

      {secondaryNavItems.length > 0 ? (
        <div
          ref={moreRef}
          className={`dashboard-nav-more${open ? " is-open" : ""}`}
        >
          <button
            type="button"
            className={`dashboard-nav-more__trigger${activeSecondaryItem ? " is-active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((value) => !value)}
            title={activeSecondaryItem ? `Поточний додатковий розділ: ${activeSecondaryItem.desktopLabel}` : "Додаткові розділи"}
          >
            <span className="dashboard-nav-more__trigger-label">Ще</span>
            <span className="dashboard-nav-more__trigger-count" aria-hidden="true">{secondaryNavItems.length}</span>
          </button>

          <div
            id={menuId}
            className="dashboard-nav-more__menu"
            role="menu"
            aria-hidden={!open}
          >
            <div className="dashboard-nav-more__menu-head">
              <strong>Додаткові розділи</strong>
              <span>{activeSecondaryItem ? `Активний: ${activeSecondaryItem.desktopLabel}` : "Швидкий доступ до інших сторінок"}</span>
            </div>

            <div className="dashboard-nav-more__menu-list">
              {secondaryNavItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className={activeSection === item.section ? "is-active" : undefined}
                  aria-current={activeSection === item.section ? "page" : undefined}
                  title={item.desktopLabel}
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <strong>{item.desktopLabel}</strong>
                  <small>{activeSection === item.section ? "Відкрито" : "Перейти"}</small>
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
