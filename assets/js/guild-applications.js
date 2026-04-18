(function () {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  }

  function humanStatus(item) {
    return item.state === 'closed' ? 'Розгляд завершено' : 'На розгляді';
  }

  function renderApplicationCard(item) {
    const stateClass = item.state === 'closed' ? 'closed' : 'open';
    const description = item.summary || 'Деталі заявки відкриваються за посиланням.';
    return '' +
      '<article class="application-status-item">' +
        '<div class="application-status-item__top">' +
          '<div>' +
            '<div class="application-status-item__title">' + escapeHtml(item.title) + '</div>' +
            '<div class="application-status-item__meta">' +
              '<span>№' + escapeHtml(item.number) + '</span>' +
              (item.created_at ? '<span>Подано ' + escapeHtml(formatDate(item.created_at)) + '</span>' : '') +
              (item.closed_at ? '<span>Оновлено ' + escapeHtml(formatDate(item.closed_at)) + '</span>' : '') +
            '</div>' +
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


  function initCustomSelect(scope) {
    const selectRoot = scope ? scope.querySelector('[data-custom-select]') : null;
    if (!selectRoot) return null;

    const hiddenInput = selectRoot.querySelector('input[name="className"]');
    const trigger = selectRoot.querySelector('.custom-select-trigger');
    const label = selectRoot.querySelector('.custom-select-trigger__label');
    const panel = selectRoot.querySelector('.custom-select-panel');
    const options = Array.from(selectRoot.querySelectorAll('.custom-select-option'));

    function close() {
      selectRoot.classList.remove('is-open');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function open() {
      selectRoot.classList.add('is-open');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }

    function setValue(value) {
      const option = options.find(function (item) { return item.dataset.value === value; });
      if (!hiddenInput || !label) return;
      hiddenInput.value = option ? option.dataset.value : '';
      label.textContent = option ? option.textContent : 'Обери клас';
      selectRoot.classList.toggle('is-placeholder', !option);
      selectRoot.classList.remove('is-invalid');
      options.forEach(function (item) {
        item.classList.toggle('is-selected', option === item);
        item.setAttribute('aria-selected', option === item ? 'true' : 'false');
      });
    }

    if (trigger) {
      trigger.addEventListener('click', function () {
        if (selectRoot.classList.contains('is-open')) close();
        else open();
      });
    }

    options.forEach(function (option) {
      option.addEventListener('click', function () {
        setValue(option.dataset.value || '');
        close();
        if (trigger) trigger.focus();
      });
    });

    document.addEventListener('click', function (event) {
      if (!selectRoot.contains(event.target)) close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    setValue(hiddenInput && hiddenInput.value ? hiddenInput.value : '');
    return {
      getValue: function () { return hiddenInput ? hiddenInput.value.trim() : ''; },
      validate: function () {
        const ok = !!(hiddenInput && hiddenInput.value.trim());
        selectRoot.classList.toggle('is-invalid', !ok);
        return ok;
      },
      reset: function () { setValue(''); close(); }
    };
  }

  const applyPage = document.querySelector('.guild-application-page');
  if (applyPage) {
    const apiUrl = (applyPage.dataset.apiUrl || '').trim();
    const statusLimit = Number(applyPage.dataset.statusLimit || '8');
    const form = document.getElementById('guild-application-form');
    const customSelect = initCustomSelect(applyPage);
    const feedback = document.getElementById('guild-application-feedback');
    const statusRoot = document.getElementById('guild-applications-status');
    const refreshButton = document.getElementById('guild-application-refresh');
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;

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
          className: (customSelect ? customSelect.getValue() : (formData.get('className') || '').toString().trim()),
          discord: (formData.get('discord') || '').toString().trim(),
          battleTag: (formData.get('battleTag') || '').toString().trim(),
          availability: (formData.get('availability') || '').toString().trim(),
          website: (formData.get('website') || '').toString().trim()
        };

        if (customSelect && !customSelect.validate()) {
          setFeedback('error', 'Оберіть клас персонажа, щоб продовжити.');
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
          if (customSelect) customSelect.reset();
          const realmField = form.querySelector('input[name="realm"]');
          if (realmField && !realmField.value) realmField.value = 'Terokkar';
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
