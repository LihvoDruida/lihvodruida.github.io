(function () {
  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('uk-UA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function humanStatus(item) {
    return item.state === 'closed' ? 'Розгляд завершено' : 'На розгляді';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderApplicationCard(item) {
    var stateClass = item.state === 'closed' ? 'closed' : 'open';
    var meta = [];
    if (item.number) meta.push('№' + item.number);
    if (item.created_at) meta.push('Подано ' + formatDate(item.created_at));
    var description = item.summary || 'Деталі заявки доступні після відкриття картки.';

    return '<article class="application-status-item">' +
      '<div class="application-status-item__top">' +
        '<div class="application-status-item__title-group">' +
          '<h3 class="application-status-item__title">' + escapeHtml(item.title) + '</h3>' +
          '<div class="application-status-item__meta">' + meta.map(escapeHtml).join('<span>•</span>') + '</div>' +
        '</div>' +
        '<span class="application-status-badge application-status-badge--' + stateClass + '">' + escapeHtml(humanStatus(item)) + '</span>' +
      '</div>' +
      '<div class="application-status-item__desc">' + escapeHtml(description) + '</div>' +
      (item.html_url ? '<a class="application-status-item__link" href="' + escapeHtml(item.html_url) + '" target="_blank" rel="noopener noreferrer">Відкрити заявку <span aria-hidden="true">↗</span></a>' : '') +
    '</article>';
  }

  async function fetchApplications(apiUrl, limit) {
    const response = await fetch(apiUrl + '?limit=' + encodeURIComponent(String(limit)), {
      headers: { 'Accept': 'application/json' }
    });

    const payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(payload.error || 'Не вдалося отримати список заявок.');
    }
    return Array.isArray(payload.items) ? payload.items : [];
  }

  function setupCustomSelects(root) {
    const selects = Array.from((root || document).querySelectorAll('.custom-select'));
    if (!selects.length) return;

    function closeAll(except) {
      selects.forEach(function (select) {
        if (select !== except) {
          select.classList.remove('is-open');
          const trigger = select.querySelector('.custom-select__trigger');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    selects.forEach(function (select) {
      const trigger = select.querySelector('.custom-select__trigger');
      const valueNode = select.querySelector('.custom-select__value');
      const input = select.querySelector('input[type="hidden"]');
      const options = Array.from(select.querySelectorAll('.custom-select__option'));
      const placeholder = select.dataset.placeholder || 'Обери варіант';

      function applyValue(value, label) {
        if (input) input.value = value || '';
        if (valueNode) {
          valueNode.textContent = label || placeholder;
          valueNode.classList.toggle('is-placeholder', !value);
        }
        options.forEach(function (option) {
          option.classList.toggle('is-active', option.dataset.value === value);
          option.setAttribute('aria-selected', option.dataset.value === value ? 'true' : 'false');
        });
      }

      applyValue(input && input.value ? input.value : '', '');

      if (trigger) {
        trigger.addEventListener('click', function () {
          const opening = !select.classList.contains('is-open');
          closeAll(select);
          select.classList.toggle('is-open', opening);
          trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
        });
      }

      options.forEach(function (option) {
        option.addEventListener('click', function () {
          applyValue(option.dataset.value || '', option.textContent.trim());
          select.classList.remove('is-open');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
      });

      select.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          select.classList.remove('is-open');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
          if (trigger) trigger.focus();
        }
      });

      select.resetValue = function () {
        applyValue('', '');
      };
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('.custom-select')) closeAll();
    });
  }

  setupCustomSelects(document);

  const applyPage = document.querySelector('.guild-application-page');
  if (applyPage) {
    const apiUrl = (applyPage.dataset.apiUrl || '').trim();
    const statusLimit = Number(applyPage.dataset.statusLimit || '8');
    const form = document.getElementById('guild-application-form');
    const feedback = document.getElementById('guild-application-feedback');
    const statusRoot = document.getElementById('guild-applications-status');
    const refreshButton = document.getElementById('guild-application-refresh');
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;
    const customSelects = form ? Array.from(form.querySelectorAll('.custom-select')) : [];

    function setFeedback(type, html) {
      if (!feedback) return;
      feedback.className = 'form-feedback is-visible ' + (type === 'success' ? 'is-success' : 'is-error');
      feedback.innerHTML = html;
    }

    function clearFeedback() {
      if (!feedback) return;
      feedback.className = 'form-feedback';
      feedback.innerHTML = '';
    }

    function renderRecent(items) {
      if (!statusRoot) return;
      if (!Array.isArray(items) || items.length === 0) {
        statusRoot.innerHTML = '<div class="applications-empty">Поки що тут немає заявок. Щойно з’являться перші звернення, вони будуть показані в цьому списку.</div>';
        return;
      }
      statusRoot.innerHTML = items.map(renderApplicationCard).join('');
    }

    async function loadRecent() {
      if (!statusRoot) return;
      statusRoot.innerHTML = '<div class="applications-placeholder">Оновлюємо список заявок…</div>';
      try {
        const items = await fetchApplications(apiUrl, statusLimit);
        renderRecent(items);
      } catch (error) {
        statusRoot.innerHTML = '<div class="applications-empty">Зараз не вдалося оновити список заявок. Спробуй ще раз трохи пізніше або онови сторінку.</div>';
      }
    }

    if (refreshButton) {
      refreshButton.addEventListener('click', loadRecent);
    }

    if (form) {
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        clearFeedback();

        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const payload = {
          characterName: (formData.get('characterName') || '').toString().trim(),
          realm: (formData.get('realm') || '').toString().trim(),
          faction: (formData.get('faction') || '').toString().trim(),
          className: (formData.get('className') || '').toString().trim(),
          discord: (formData.get('discord') || '').toString().trim(),
          battleTag: (formData.get('battleTag') || '').toString().trim(),
          availability: (formData.get('availability') || '').toString().trim(),
          website: (formData.get('website') || '').toString().trim()
        };

        if (!payload.faction || !payload.className) {
          setFeedback('error', 'Будь ласка, обери фракцію та клас.');
          return;
        }

        if (submitButton) submitButton.disabled = true;

        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json().catch(function () { return {}; });
          if (!response.ok) {
            throw new Error(result.error || 'Не вдалося надіслати заявку. Спробуй ще раз за хвилину.');
          }

          form.reset();
          const realmField = form.querySelector('input[name="realm"]');
          if (realmField && !realmField.value) realmField.value = 'Terokkar';
          customSelects.forEach(function (select) {
            if (typeof select.resetValue === 'function') select.resetValue();
          });
          setFeedback('success', 'Заявку надіслано. ' +
            (result.html_url ? 'Можна одразу <a href="' + escapeHtml(result.html_url) + '" target="_blank" rel="noopener noreferrer">відкрити її</a>.' : ''));
          loadRecent();
        } catch (error) {
          setFeedback('error', escapeHtml(error.message || 'Зараз не вдалося надіслати заявку. Спробуй ще раз трохи пізніше.'));
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      });
    }

    loadRecent();
  }

  const directoryPage = document.querySelector('.guild-applications-directory');
  if (directoryPage) {
    const apiUrl = (directoryPage.dataset.apiUrl || '').trim();
    const limit = Number(directoryPage.dataset.statusLimit || '50');
    const listRoot = document.getElementById('guild-applications-directory-list');
    const counter = document.getElementById('applications-directory-counter');
    const searchInput = document.getElementById('applications-search-input');
    const clearButton = document.getElementById('applications-clear-search');
    const refreshButton = document.getElementById('applications-refresh');
    let allItems = [];

    function getSearchValue() {
      return (searchInput ? searchInput.value : '').toString().trim().toLowerCase();
    }

    function filterItems() {
      const query = getSearchValue();
      if (!query) return allItems.slice();
      return allItems.filter(function (item) {
        return String(item.title || '').toLowerCase().includes(query) ||
               String(item.summary || '').toLowerCase().includes(query);
      });
    }

    function updateCounter(items) {
      if (!counter) return;
      const total = allItems.length;
      const visible = items.length;
      const q = getSearchValue();
      counter.textContent = q
        ? 'Знайдено ' + visible + ' із ' + total + ' заявок за поточним пошуком.'
        : 'Усього заявок у списку: ' + total + '.';
    }

    function renderDirectory(items) {
      if (!listRoot) return;
      updateCounter(items);
      if (!Array.isArray(items) || items.length === 0) {
        listRoot.innerHTML = '<div class="applications-empty">За цим запитом нічого не знайдено. Спробуй інший нік або очисти пошук.</div>';
        return;
      }
      listRoot.innerHTML = items.map(renderApplicationCard).join('');
    }

    async function loadDirectory() {
      if (!listRoot) return;
      listRoot.innerHTML = '<div class="applications-placeholder">Оновлюємо повний список заявок…</div>';
      try {
        allItems = await fetchApplications(apiUrl, limit);
        renderDirectory(filterItems());
      } catch (error) {
        listRoot.innerHTML = '<div class="applications-empty">Зараз не вдалося завантажити список заявок. Спробуй ще раз трохи пізніше.</div>';
        if (counter) counter.textContent = 'Список тимчасово недоступний.';
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        renderDirectory(filterItems());
      });
    }

    if (clearButton) {
      clearButton.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        renderDirectory(filterItems());
        if (searchInput) searchInput.focus();
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener('click', loadDirectory);
    }

    loadDirectory();
  }
})();
