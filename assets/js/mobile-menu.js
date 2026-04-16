/**
 * Mobile navigation with safe scroll lock and resize handling.
 */
class NavigationInterface {
    constructor(selectors) {
        this.refs = {
            trigger: document.querySelector(selectors.trigger),
            overlay: document.querySelector(selectors.menu),
            body: document.body,
            documentElement: document.documentElement
        };

        this.state = {
            activeClass: 'is-active',
            openClass: 'is-open',
            bodyClass: 'nav-open'
        };

        this.mediaQuery = window.matchMedia('(max-width: 768px)');
        this.scrollTop = 0;

        if (this.refs.trigger && this.refs.overlay) {
            this.init();
        }
    }

    init() {
        this.refs.overlay.setAttribute('aria-hidden', 'true');
        this.refs.trigger.addEventListener('click', this);
        this.refs.overlay.addEventListener('click', this);
        document.addEventListener('keydown', this);
        this.mediaQuery.addEventListener?.('change', this);
        window.addEventListener('resize', this, { passive: true });
    }

    handleEvent(e) {
        switch (e.type) {
            case 'click':
                if (e.currentTarget === this.refs.trigger) {
                    this.toggle();
                } else if (e.currentTarget === this.refs.overlay) {
                    this.handleOverlayClick(e);
                }
                break;
            case 'keydown':
                if (e.key === 'Escape') this.close();
                break;
            case 'change':
            case 'resize':
                if (!this.mediaQuery.matches) this.close();
                break;
        }
    }

    toggle() {
        const isOpen = this.refs.overlay.classList.contains(this.state.openClass);
        isOpen ? this.close() : this.open();
    }

    lockScroll() {
        this.scrollTop = window.scrollY || this.refs.documentElement.scrollTop || 0;
        this.refs.body.style.top = `-${this.scrollTop}px`;
        this.refs.body.classList.add(this.state.bodyClass);
    }

    unlockScroll() {
        const previousTop = this.refs.body.style.top;
        this.refs.body.classList.remove(this.state.bodyClass);
        this.refs.body.style.top = '';
        const offset = previousTop ? Math.abs(parseInt(previousTop, 10)) : this.scrollTop;
        window.scrollTo(0, Number.isFinite(offset) ? offset : 0);
    }

    open() {
        this.refs.trigger.classList.add(this.state.activeClass);
        this.refs.overlay.classList.add(this.state.openClass);
        this.refs.trigger.setAttribute('aria-expanded', 'true');
        this.refs.overlay.setAttribute('aria-hidden', 'false');
        this.lockScroll();
    }

    close() {
        if (!this.refs.overlay.classList.contains(this.state.openClass)) {
            return;
        }

        this.refs.trigger.classList.remove(this.state.activeClass);
        this.refs.overlay.classList.remove(this.state.openClass);
        this.refs.trigger.setAttribute('aria-expanded', 'false');
        this.refs.overlay.setAttribute('aria-hidden', 'true');
        this.unlockScroll();
    }

    handleOverlayClick(e) {
        if (e.target === this.refs.overlay || e.target.closest('a')) {
            this.close();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NavigationInterface({
        trigger: '.hamburger',
        menu: '.mobile-menu'
    });
});
