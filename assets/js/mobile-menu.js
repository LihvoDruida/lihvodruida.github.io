/**
 * UIController - Клас для керування мобільною навігацією.
 * Використовує патерн EventListenerObject для обробки подій.
 */
class NavigationInterface {
    constructor(selectors) {
        this.refs = {
            trigger: document.querySelector(selectors.trigger),
            overlay: document.querySelector(selectors.menu),
            body: document.body
        };

        this.state = {
            activeClass: 'is-active',
            openClass: 'is-open',
            locked: 'hidden'
        };

        // Ініціалізація тільки якщо елементи існують в DOM
        if (this.refs.trigger && this.refs.overlay) {
            this.init();
        }
    }

    init() {
        // Магія: передаємо 'this' замість колбеку. 
        // Браузер автоматично викличе метод handleEvent цього класу.
        this.refs.trigger.addEventListener('click', this);
        this.refs.overlay.addEventListener('click', this);
        document.addEventListener('keydown', this);
    }

    // Єдина точка входу для всіх подій (Router подій)
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
        }
    }

    toggle() {
        const isOpen = this.refs.overlay.classList.contains(this.state.openClass);
        isOpen ? this.close() : this.open();
    }

    open() {
        this.refs.trigger.classList.add(this.state.activeClass);
        this.refs.overlay.classList.add(this.state.openClass);
        this.refs.trigger.setAttribute('aria-expanded', 'true');
        this.toggleScroll(true);
    }

    close() {
        this.refs.trigger.classList.remove(this.state.activeClass);
        this.refs.overlay.classList.remove(this.state.openClass);
        this.refs.trigger.setAttribute('aria-expanded', 'false');
        this.toggleScroll(false);
    }

    handleOverlayClick(e) {
        // Закриваємо, якщо клік по фону АБО по посиланню
        if (e.target === this.refs.overlay || e.target.closest('a')) {
            this.close();
        }
    }

    toggleScroll(lock) {
        this.refs.body.style.overflow = lock ? this.state.locked : '';
    }
}

// Запуск після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    new NavigationInterface({
        trigger: '.hamburger',
        menu: '.mobile-menu'
    });
});