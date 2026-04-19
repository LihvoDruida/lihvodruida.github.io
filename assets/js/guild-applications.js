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
    var description = item.summary || 'Короткий опис заявки буде доступний після відкриття картки.';
    var title = String(item.title || '').replace(/^Заявка до гільдії:\s*/i, '').trim() || 'Нова заявка';
    var metaHtml = meta.length
      ? meta.map(escapeHtml).join('<span class="application-status-item__sep">•</span>')
      : '<span>Без додаткових даних</span>';

    return '<article class="application-status-item application-status-item--' + stateClass + '">' +
      '<div class="application-status-item__head">' +
        '<div class="application-status-item__eyebrow-row">' +
          '<span class="application-status-item__eyebrow">Заявка до гільдії</span>' +
          '<span class="application-status-badge application-status-badge--' + stateClass + '">' + escapeHtml(humanStatus(item)) + '</span>' +
        '</div>' +
        '<h3 class="application-status-item__title">' + escapeHtml(title) + '</h3>' +
        '<div class="application-status-item__meta">' + metaHtml + '</div>' +
      '</div>' +
      '<p class="application-status-item__desc">' + escapeHtml(description) + '</p>' +
      (item.html_url ? '<div class="application-status-item__footer"><a class="application-status-item__link" href="' + escapeHtml(item.html_url) + '" target="_blank" rel="noopener noreferrer">Відкрити заявку <span aria-hidden="true">↗</span></a></div>' : '') +
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
        var normalizedValue = value || '';
        var previousValue = input ? input.value : '';
        if (input) input.value = normalizedValue;
        if (input && previousValue !== normalizedValue) {
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
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

    window.addEventListener('resize', function () {
      closeAll();
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
    const factionInput = form ? form.querySelector('input[name="faction"]') : null;
    const battleTagInput = form ? form.querySelector('input[name="battleTag"]') : null;
    const battleTagRequiredBadge = document.getElementById('battleTagRequiredBadge');
    const sourceInput = form ? form.querySelector('input[name="source"]') : null;
    const sourceCreatorInput = form ? form.querySelector('input[name="sourceCreator"]') : null;
    const sourcePlatformInput = form ? form.querySelector('input[name="sourcePlatform"]') : null;
    const sourceOtherInput = form ? form.querySelector('input[name="sourceOther"]') : null;
    const sourcePlatformField = document.getElementById('sourcePlatformField');
    const sourceOtherField = document.getElementById('sourceOtherField');
    const sourcePlatformRequiredBadge = document.getElementById('sourcePlatformRequiredBadge');
    const sourceOtherRequiredBadge = document.getElementById('sourceOtherRequiredBadge');
    const sourcePlatformSelect = form ? form.querySelector('.custom-select[data-name="sourcePlatform"]') : null;

    function setFieldVisibility(field, visible) {
      if (!field) return;
      field.hidden = !visible;
      field.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (!visible) {
        var openSelect = field.querySelector('.custom-select.is-open');
        if (openSelect) {
          openSelect.classList.remove('is-open');
          var trigger = openSelect.querySelector('.custom-select__trigger');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
      }
    }

    function syncBattleTagRequirement() {
      if (!battleTagInput) return;
      const factionValue = (factionInput ? factionInput.value : '').toString().trim().toLowerCase();
      const isHorde = factionValue === 'horde';
      battleTagInput.required = isHorde;
      battleTagInput.setAttribute('aria-required', isHorde ? 'true' : 'false');
      if (battleTagRequiredBadge) battleTagRequiredBadge.hidden = !isHorde;
      if (!isHorde) {
        battleTagInput.setCustomValidity('');
        return;
      }
      battleTagInput.setCustomValidity(battleTagInput.value.trim() ? '' : 'Для фракції Horde поле BattleTag є обов’язковим.');
    }

    function buildSourceValue() {
      const creator = (sourceCreatorInput ? sourceCreatorInput.value : '').toString().trim();
      const platform = (sourcePlatformInput ? sourcePlatformInput.value : '').toString().trim();
      const other = (sourceOtherInput ? sourceOtherInput.value : '').toString().trim();

      if (!creator) return '';
      if (creator === 'Інше') return other ? 'Інше — ' + other : '';
      return platform ? creator + ' — ' + platform : '';
    }

    function syncSourceRequirement() {
      const creator = (sourceCreatorInput ? sourceCreatorInput.value : '').toString().trim();
      const isOther = creator === 'Інше';
      const needsPlatform = !!creator && !isOther;

      setFieldVisibility(sourcePlatformField, needsPlatform);
      setFieldVisibility(sourceOtherField, isOther);
      if (sourcePlatformRequiredBadge) sourcePlatformRequiredBadge.hidden = !needsPlatform;
      if (sourceOtherRequiredBadge) sourceOtherRequiredBadge.hidden = !isOther;

      if (sourcePlatformInput) {
        sourcePlatformInput.required = needsPlatform;
        sourcePlatformInput.setAttribute('aria-required', needsPlatform ? 'true' : 'false');
        if (!needsPlatform) {
          if (sourcePlatformInput.value && sourcePlatformSelect && typeof sourcePlatformSelect.resetValue === 'function') {
            sourcePlatformSelect.resetValue();
          } else {
            sourcePlatformInput.value = '';
          }
          sourcePlatformInput.setCustomValidity('');
        } else {
          sourcePlatformInput.setCustomValidity(sourcePlatformInput.value.trim() ? '' : 'Оберіть платформу.');
        }
      }

      if (sourceOtherInput) {
        sourceOtherInput.required = isOther;
        sourceOtherInput.setAttribute('aria-required', isOther ? 'true' : 'false');
        if (!isOther) {
          sourceOtherInput.value = '';
          sourceOtherInput.setCustomValidity('');
        } else {
          sourceOtherInput.setCustomValidity(sourceOtherInput.value.trim() ? '' : 'Вкажіть, звідки саме ви дізналися про нас.');
        }
      }

      if (sourceInput) {
        sourceInput.value = buildSourceValue();
      }
    }

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

    if (battleTagInput) {
      battleTagInput.addEventListener('input', syncBattleTagRequirement);
      battleTagInput.addEventListener('blur', syncBattleTagRequirement);
    }
    if (factionInput) {
      factionInput.addEventListener('change', syncBattleTagRequirement);
    }
    if (sourceCreatorInput) {
      sourceCreatorInput.addEventListener('change', syncSourceRequirement);
    }
    if (sourcePlatformInput) {
      sourcePlatformInput.addEventListener('change', syncSourceRequirement);
    }
    if (sourceOtherInput) {
      sourceOtherInput.addEventListener('input', syncSourceRequirement);
      sourceOtherInput.addEventListener('blur', syncSourceRequirement);
    }
    syncBattleTagRequirement();
    syncSourceRequirement();

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

        syncSourceRequirement();
        const formData = new FormData(form);

        const payload = {
          characterName: (formData.get('characterName') || '').toString().trim(),
          realm: (formData.get('realm') || '').toString().trim(),
          faction: (formData.get('faction') || '').toString().trim(),
          className: (formData.get('className') || '').toString().trim(),
          discord: (formData.get('discord') || '').toString().trim(),
          battleTag: (formData.get('battleTag') || '').toString().trim(),
          sourceCreator: (formData.get('sourceCreator') || '').toString().trim(),
          sourcePlatform: (formData.get('sourcePlatform') || '').toString().trim(),
          sourceOther: (formData.get('sourceOther') || '').toString().trim(),
          source: buildSourceValue(),
          availability: (formData.get('availability') || '').toString().trim(),
          website: (formData.get('website') || '').toString().trim()
        };

        if (!payload.faction) {
          setFeedback('error', 'Будь ласка, обери фракцію.');
          return;
        }


        if (payload.sourceCreator && payload.sourceCreator === 'Інше' && !payload.sourceOther) {
          if (sourceOtherInput) {
            sourceOtherInput.focus();
            sourceOtherInput.reportValidity();
          }
          setFeedback('error', 'Вкажи, звідки саме ти дізнався про нас.');
          return;
        }

        if (payload.sourceCreator && payload.sourceCreator !== 'Інше' && !payload.sourcePlatform) {
          if (sourcePlatformInput) {
            sourcePlatformInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          setFeedback('error', 'Будь ласка, обери платформу.');
          return;
        }

        if (payload.faction.toLowerCase() === 'horde' && !payload.battleTag) {
          if (battleTagInput) {
            battleTagInput.focus();
            syncBattleTagRequirement();
            battleTagInput.reportValidity();
          }
          setFeedback('error', 'Для фракції Horde поле BattleTag є обов’язковим.');
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
          syncBattleTagRequirement();
          syncSourceRequirement();
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
    const statTotal = document.getElementById('applications-stat-total');
    const statApproved = document.getElementById('applications-stat-approved');
    const statOpen = document.getElementById('applications-stat-open');
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
      const total = allItems.length;
      const visible = items.length;
      const approved = allItems.filter(function (item) { return item.state === 'closed'; }).length;
      const open = total - approved;
      const q = getSearchValue();
      if (counter) {
        counter.textContent = q
          ? 'Знайдено ' + visible + ' із ' + total + ' заявок за поточним пошуком.'
          : 'Усього заявок у списку: ' + total + '.';
      }
      if (statTotal) statTotal.textContent = String(total);
      if (statApproved) statApproved.textContent = String(approved);
      if (statOpen) statOpen.textContent = String(open);
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
