/**
 * Навігація сайту:
 *  - мобільна панель (бургер + блокування скролу),
 *  - випадне меню гільдії (клік, Escape, клік поза межами).
 */
(() => {
  "use strict";

  const BREAKPOINT = "(max-width: 1000px)";

  class MobileSheet {
    constructor(trigger, sheet) {
      this.trigger = trigger;
      this.sheet = sheet;
      this.body = document.body;
      this.scrollTop = 0;
      this.mq = window.matchMedia(BREAKPOINT);

      this.sheet.setAttribute("aria-hidden", "true");
      this.trigger.addEventListener("click", () => this.toggle());
      this.sheet.addEventListener("click", (e) => {
        if (e.target === this.sheet || e.target.closest("a")) this.close();
      });
      this.mq.addEventListener?.("change", () => {
        if (!this.mq.matches) this.close();
      });
    }

    get isOpen() {
      return this.sheet.classList.contains("is-open");
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      this.body.style.top = `-${this.scrollTop}px`;
      this.body.classList.add("nav-open");

      this.sheet.classList.add("is-open");
      this.sheet.setAttribute("aria-hidden", "false");
      this.trigger.classList.add("is-active");
      this.trigger.setAttribute("aria-expanded", "true");
      this.trigger.setAttribute("aria-label", "Закрити меню");
    }

    close() {
      if (!this.isOpen) return;

      const previousTop = this.body.style.top;
      this.body.classList.remove("nav-open");
      this.body.style.top = "";
      const offset = previousTop ? Math.abs(parseInt(previousTop, 10)) : this.scrollTop;
      window.scrollTo(0, Number.isFinite(offset) ? offset : 0);

      this.sheet.classList.remove("is-open");
      this.sheet.setAttribute("aria-hidden", "true");
      this.trigger.classList.remove("is-active");
      this.trigger.setAttribute("aria-expanded", "false");
      this.trigger.setAttribute("aria-label", "Відкрити меню");
    }
  }

  class AccountDropdown {
    constructor(root) {
      this.root = root;
      this.trigger = root.querySelector(".nav-account__btn");
      this.menu = root.querySelector(".nav-account__menu");
      if (!this.trigger || !this.menu) return;

      this.trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggle();
      });

      this.root.addEventListener("focusout", (e) => {
        if (!this.root.contains(e.relatedTarget)) this.close();
      });

      document.addEventListener("click", (e) => {
        if (!this.root.contains(e.target)) this.close();
      });
    }

    get isOpen() {
      return this.root.classList.contains("is-open");
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.root.classList.add("is-open");
      this.trigger.setAttribute("aria-expanded", "true");
    }

    close() {
      if (!this.isOpen) return;
      this.root.classList.remove("is-open");
      this.trigger.setAttribute("aria-expanded", "false");
    }
  }

  function init() {
    const burger = document.querySelector(".nav-burger");
    const sheet = document.querySelector(".nav-sheet");
    const accountRoot = document.querySelector(".nav-account");

    const mobileSheet = burger && sheet ? new MobileSheet(burger, sheet) : null;
    const dropdown = accountRoot ? new AccountDropdown(accountRoot) : null;

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      dropdown?.close();
      if (mobileSheet?.isOpen) {
        mobileSheet.close();
        burger.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
