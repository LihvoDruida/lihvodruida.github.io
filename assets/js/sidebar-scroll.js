(() => {
  "use strict";

  const SCROLLED_CLASS = "is-scrolled";
  const THRESHOLD = 8;

  function initFixedSidebarState() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    let ticking = false;

    const update = () => {
      sidebar.classList.toggle(SCROLLED_CLASS, window.scrollY > THRESHOLD);
      ticking = false;
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFixedSidebarState, { once: true });
  } else {
    initFixedSidebarState();
  }
})();
