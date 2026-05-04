"use client";

import { useEffect } from "react";

const MOBILE_NAV_SELECTOR = ".dashboard-mobile-nav";
function getViewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

function setRootVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function clearRootVars() {
  document.documentElement.style.removeProperty("--dash-mobile-nav-actual-height");
  document.documentElement.style.removeProperty("--dash-mobile-nav-actual-bottom");
}

export default function MobileNavSafeAreaSync() {
  useEffect(() => {
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let observedNav: HTMLElement | null = null;

    const observeNav = (nav: HTMLElement | null) => {
      if (nav === observedNav) return;

      resizeObserver?.disconnect();
      resizeObserver = null;
      observedNav = nav;

      if (!nav || !("ResizeObserver" in window)) return;

      resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(nav);
      Array.from(nav.children).forEach((child) => resizeObserver?.observe(child));
    };

    const update = () => {
      frame = 0;

      const nav = document.querySelector<HTMLElement>(MOBILE_NAV_SELECTOR);
      observeNav(nav);

      if (!nav || nav.offsetParent === null) {
        clearRootVars();
        return;
      }

      const rect = nav.getBoundingClientRect();
      const height = Math.max(0, Math.ceil(rect.height));
      const bottomGap = Math.max(0, Math.ceil(getViewportHeight() - rect.bottom));
      setRootVar("--dash-mobile-nav-actual-height", `${height}px`);
      setRootVar("--dash-mobile-nav-actual-bottom", `${bottomGap}px`);
    };

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    }

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-items"],
    });

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      clearRootVars();
    };
  }, []);

  return null;
}
