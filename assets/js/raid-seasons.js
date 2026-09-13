/**
 * Перемикач сезонів + універсальна карусель рейдового прогресу.
 *
 * Правила каруселі:
 * - рівно 4 рейди на сторінку;
 * - desktop: стабільна сітка 2×2;
 * - неповна остання сторінка не розтягує картки — порожні слоти зберігають геометрію;
 * - анімований перехід вліво/вправо;
 * - працює і для статичного Jekyll fallback, і для live VPS render.
 */
(function () {
  'use strict';

  var PAGE_SIZE = 4;
  var TRANSITION_MS = 170;
  var reducedMotion = false;
  try {
    reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {}

  function itemNodes(grid) {
    return Array.prototype.slice.call(grid.children).filter(function (node) {
      return node.classList && (
        (node.classList.contains('raid-card') && !node.classList.contains('placeholder-card')) ||
        node.classList.contains('guild-live-progress-card')
      );
    });
  }

  function ensureChrome(grid) {
    var existing = grid.closest('[data-raid-carousel]');
    if (existing) return existing;

    var wrapper = document.createElement('div');
    wrapper.className = 'raid-carousel';
    wrapper.setAttribute('data-raid-carousel', '');

    var toolbar = document.createElement('div');
    toolbar.className = 'raid-carousel-toolbar';
    toolbar.innerHTML =
      '<div class="raid-carousel-range" aria-live="polite">' +
        '<span data-raid-carousel-range>1–4</span><small>із <b data-raid-carousel-total>4</b></small>' +
      '</div>' +
      '<div class="raid-carousel-nav" aria-label="Навігація рейдами">' +
        '<button type="button" class="raid-carousel-arrow" data-raid-prev aria-label="Попередні рейди">←</button>' +
        '<span class="raid-carousel-page" data-raid-carousel-page>1 / 1</span>' +
        '<button type="button" class="raid-carousel-arrow" data-raid-next aria-label="Наступні рейди">→</button>' +
      '</div>';

    var viewport = document.createElement('div');
    viewport.className = 'raid-carousel-viewport';

    var parent = grid.parentNode;
    parent.insertBefore(wrapper, grid);
    wrapper.appendChild(toolbar);
    wrapper.appendChild(viewport);
    viewport.appendChild(grid);

    grid.classList.add('raid-carousel-grid');
    return wrapper;
  }

  function clearEmptySlots(grid) {
    grid.querySelectorAll('.raid-carousel-empty').forEach(function (node) { node.remove(); });
  }

  function addEmptySlots(grid, count) {
    clearEmptySlots(grid);
    for (var i = 0; i < count; i += 1) {
      var empty = document.createElement('div');
      empty.className = 'raid-carousel-empty';
      empty.setAttribute('aria-hidden', 'true');
      grid.appendChild(empty);
    }
  }

  function initCarousel(grid) {
    if (!grid || grid.dataset.raidCarouselReady === '1') return;
    var items = itemNodes(grid);
    if (!items.length) return;

    var wrapper = ensureChrome(grid);
    var previous = wrapper.querySelector('[data-raid-prev]');
    var next = wrapper.querySelector('[data-raid-next]');
    var pageLabel = wrapper.querySelector('[data-raid-carousel-page]');
    var rangeLabel = wrapper.querySelector('[data-raid-carousel-range]');
    var totalLabel = wrapper.querySelector('[data-raid-carousel-total]');
    var toolbar = wrapper.querySelector('.raid-carousel-toolbar');
    var viewport = wrapper.querySelector('.raid-carousel-viewport');
    var page = 0;
    var pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    var animating = false;

    grid.dataset.raidCarouselReady = '1';
    wrapper.dataset.raidCount = String(items.length);

    function render() {
      var start = page * PAGE_SIZE;
      var end = Math.min(start + PAGE_SIZE, items.length);
      items.forEach(function (item, index) {
        item.hidden = index < start || index >= end;
      });

      addEmptySlots(grid, PAGE_SIZE - (end - start));

      if (rangeLabel) rangeLabel.textContent = (start + 1) + (end > start + 1 ? '–' + end : '');
      if (totalLabel) totalLabel.textContent = String(items.length);
      if (pageLabel) pageLabel.textContent = (page + 1) + ' / ' + pageCount;
      if (previous) previous.disabled = page === 0 || animating;
      if (next) next.disabled = page >= pageCount - 1 || animating;
      if (toolbar) toolbar.hidden = pageCount <= 1;
      wrapper.dataset.page = String(page + 1);
    }

    function finishEnter(className) {
      grid.classList.add(className);
      // Force layout so removing the entry class animates towards the neutral state.
      void grid.offsetWidth;
      grid.classList.remove(className);
      window.setTimeout(function () {
        animating = false;
        render();
      }, TRANSITION_MS + 30);
    }

    function goTo(nextPage) {
      if (animating || nextPage < 0 || nextPage >= pageCount || nextPage === page) return;
      var forward = nextPage > page;
      if (reducedMotion) {
        page = nextPage;
        render();
        return;
      }

      animating = true;
      render();
      var leaveClass = forward ? 'is-leaving-left' : 'is-leaving-right';
      var enterClass = forward ? 'is-entering-right' : 'is-entering-left';
      grid.classList.add(leaveClass);

      window.setTimeout(function () {
        grid.classList.remove(leaveClass);
        page = nextPage;
        render();
        finishEnter(enterClass);
      }, TRANSITION_MS);
    }

    if (previous) previous.addEventListener('click', function () { goTo(page - 1); });
    if (next) next.addEventListener('click', function () { goTo(page + 1); });

    if (viewport) {
      var touchStartX = null;
      var touchStartY = null;
      viewport.addEventListener('touchstart', function (event) {
        var touch = event.touches && event.touches[0];
        if (!touch) return;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      }, { passive: true });
      viewport.addEventListener('touchend', function (event) {
        if (touchStartX == null || touchStartY == null) return;
        var touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;
        var dx = touch.clientX - touchStartX;
        var dy = touch.clientY - touchStartY;
        touchStartX = null;
        touchStartY = null;
        if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
        if (dx < 0) goTo(page + 1);
        else goTo(page - 1);
      }, { passive: true });
    }

    wrapper.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(page - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(page + 1);
      }
    });

    render();
  }

  function initAll(scope) {
    var root = scope || document;
    var grids = Array.prototype.slice.call(root.querySelectorAll('.raid-grid, .guild-live-progress-grid'));
    grids.forEach(initCarousel);
  }

  window.MistblossomRaidCarousel = {
    init: initCarousel,
    initAll: initAll,
    pageSize: PAGE_SIZE
  };

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('raid-seasons');
    if (root) {
      var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-season-tab]'));
      var panels = Array.prototype.slice.call(root.querySelectorAll('[data-season-panel]'));

      function activate(id, focusTab) {
        tabs.forEach(function (tab) {
          var isActive = tab.getAttribute('data-season-tab') === id;
          tab.classList.toggle('is-active', isActive);
          tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
          tab.setAttribute('tabindex', isActive ? '0' : '-1');
          if (isActive && focusTab) tab.focus();
        });

        panels.forEach(function (panel) {
          var isActive = panel.getAttribute('data-season-panel') === id;
          panel.classList.toggle('is-active', isActive);
          panel.hidden = !isActive;
        });
      }

      if (tabs.length) {
        tabs.forEach(function (tab, index) {
          tab.addEventListener('click', function () {
            activate(tab.getAttribute('data-season-tab'), false);
          });

          tab.addEventListener('keydown', function (event) {
            var keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
            if (keys.indexOf(event.key) === -1) return;
            event.preventDefault();

            var next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;

            activate(tabs[next].getAttribute('data-season-tab'), true);
          });
        });

        var initial = tabs[0];
        tabs.some(function (tab) {
          if (tab.classList.contains('is-active')) {
            initial = tab;
            return true;
          }
          return false;
        });
        activate(initial.getAttribute('data-season-tab'), false);
      }

      initAll(root);
    }
  });
})();
