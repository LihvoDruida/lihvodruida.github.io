(function () {
  const page = document.querySelector('.guild-application-page');
  if (!page) return;

  const apiUrl = (page.dataset.apiUrl || 'https://guild-applications.melles-android.workers.dev/api/guild-applications').trim();
  const statusLimit = Number(page.dataset.statusLimit || '12');
  const form = document.getElementById('guild-application-form');
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

  function renderStatuses(items) {
    if (!statusRoot) return;

    if (!Array.isArray(items) || items.length === 0) {
      statusRoot.innerHTML = '<div class="applications-empty">Поки що тут немає заявок. Щойно з’являться перші звернення, вони будуть показані в цьому списку.</div>';
      return;
    }

    statusRoot.innerHTML = items.map(function (item) {
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
    }).join('');
  }

  async function loadStatuses() {
    if (!statusRoot) return;
    statusRoot.innerHTML = '<div class="applications-placeholder">Оновлюємо список заявок…</div>';

    try {
      const response = await fetch(apiUrl + '?limit=' + encodeURIComponent(String(statusLimit)), {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Не вдалося отримати список заявок.');
      }

      const payload = await response.json();
      renderStatuses(payload.items || []);
    } catch (error) {
      statusRoot.innerHTML = '<div class="applications-empty">Зараз не вдалося оновити список заявок. Спробуй ще раз трохи пізніше або онови сторінку.</div>';
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', function () {
      loadStatuses();
    });
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
        className: (formData.get('className') || '').toString().trim(),
        discord: (formData.get('discord') || '').toString().trim(),
        battleTag: (formData.get('battleTag') || '').toString().trim(),
        availability: (formData.get('availability') || '').toString().trim(),
        website: (formData.get('website') || '').toString().trim()
      };

      submitButton && (submitButton.disabled = true);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          throw new Error(result.error || 'Не вдалося надіслати заявку. Спробуй ще раз за хвилину.');
        }

        form.reset();
        setFeedback('success', 'Заявку надіслано. ' +
          (result.html_url ? 'Можна одразу <a href="' + escapeHtml(result.html_url) + '" target="_blank" rel="noopener noreferrer">відкрити її на GitHub</a>.' : ''));
        loadStatuses();
      } catch (error) {
        setFeedback('error', escapeHtml(error.message || 'Зараз не вдалося надіслати заявку. Спробуй ще раз трохи пізніше.'));
      } finally {
        submitButton && (submitButton.disabled = false);
      }
    });
  }

  loadStatuses();
})();
