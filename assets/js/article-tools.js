(function () {
  function copyLink(button) {
    if (!button) return;

    const textSpan = button.querySelector('[data-copy-text]') || button.querySelector('#copyText');
    const originalText = textSpan ? textSpan.textContent : 'Копіювати';

    const onSuccess = function () {
      if (textSpan) {
        textSpan.textContent = 'Скопійовано!';
      }
      button.classList.add('copied');
      window.setTimeout(function () {
        if (textSpan) {
          textSpan.textContent = originalText;
        }
        button.classList.remove('copied');
      }, 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(window.location.href).then(onSuccess).catch(function () {});
      return;
    }

    const tempInput = document.createElement('input');
    tempInput.value = window.location.href;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    onSuccess();
  }

  function enhanceArticleTables() {
    const mobileQuery = window.matchMedia('(max-width: 768px)');

    const syncOverflowState = function (wrap) {
      const scroll = wrap.querySelector('.article-table-scroll');
      const hint = wrap.querySelector('.table-scroll-hint');
      if (!scroll) return;

      const hasOverflow = scroll.scrollWidth > scroll.clientWidth + 8;
      const atStart = scroll.scrollLeft <= 8;
      const atEnd = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 8;

      wrap.classList.toggle('has-overflow', hasOverflow);
      wrap.classList.toggle('is-overflowing', hasOverflow && !atEnd);
      wrap.classList.toggle('is-scrolled', hasOverflow && !atStart);

      if (hint) {
        hint.hidden = !hasOverflow;
      }
    };

    const unwrapTable = function (table) {
      const wrap = table.closest('.article-table-wrap');
      if (!wrap) return;
      wrap.parentNode.insertBefore(table, wrap);
      wrap.remove();
    };

    const wrapTable = function (table) {
      if (table.closest('.article-table-wrap')) return;

      const wrap = document.createElement('div');
      wrap.className = 'article-table-wrap';

      const scroll = document.createElement('div');
      scroll.className = 'article-table-scroll';

      const hint = document.createElement('div');
      hint.className = 'table-scroll-hint';
      hint.textContent = 'Проведи таблицю вбік →';

      const parent = table.parentNode;
      parent.insertBefore(wrap, table);
      wrap.appendChild(scroll);
      scroll.appendChild(table);
      wrap.appendChild(hint);

      const update = function () { syncOverflowState(wrap); };
      scroll.addEventListener('scroll', update, { passive: true });
      requestAnimationFrame(update);
    };

    const refreshTables = function () {
      const isMobile = mobileQuery.matches;
      const tables = document.querySelectorAll('.article-body table');

      tables.forEach(function (table) {
        if (isMobile) {
          wrapTable(table);
        } else {
          unwrapTable(table);
        }
      });

      if (isMobile) {
        document.querySelectorAll('.article-table-wrap').forEach(syncOverflowState);
      }
    };

    const scheduleRefresh = function () { requestAnimationFrame(refreshTables); };

    refreshTables();
    window.addEventListener('resize', scheduleRefresh, { passive: true });

    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', scheduleRefresh);
    } else if (mobileQuery.addListener) {
      mobileQuery.addListener(scheduleRefresh);
    }
  }

  window.copyLink = function () {
    const button = document.querySelector('.copy-btn');
    copyLink(button);
  };

  function init() {
    document.querySelectorAll('.copy-btn').forEach(function (button) {
      const textSpan = button.querySelector('span');
      if (textSpan) {
        textSpan.setAttribute('data-copy-text', '');
      }

      button.addEventListener('click', function (event) {
        event.preventDefault();
        copyLink(button);
      });
    });

    enhanceArticleTables();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
