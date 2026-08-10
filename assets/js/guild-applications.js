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

  const STATUS = {
    review: { label: 'На розгляді', className: 'review', order: 1 },
    accepted: { label: 'Прийнято', className: 'accepted', order: 2 },
    declined: { label: 'Відхилено', className: 'declined', order: 3 }
  };

  const STATUS_ALIASES = {
    pending: 'review',
    review: 'review',
    approved: 'accepted',
    accepted: 'accepted',
    rejected: 'declined',
    declined: 'declined'
  };

  function normalizeStatus(item) {
    const key = item && item.status_key ? String(item.status_key).toLowerCase() : 'review';
    return STATUS_ALIASES[key] || 'review';
  }

  function humanStatus(item) {
    const key = normalizeStatus(item);
    return (STATUS[key] && STATUS[key].label) || item.status_text || 'На розгляді';
  }

  /* ==========================================================
     ПРАВИЛА ПОЛІВ

     characterName — імена персонажів у WoW складаються лише з літер
                     (будь-яка мова), 2–12 символів, без цифр і пробілів.
     realm         — латиниця, цифри й ті спецсимволи, що реально
                     трапляються в назвах реалмів: пробіл, апостроф
                     (Zul'jin), дефіс, крапка, дужки.
     battleTag     — формула Molaf#21820: нік із будь-яких літер і цифр,
                     що починається з літери, 3–12 символів, решітка
                     і 4–6 цифр дискримінатора.
     discord       — сучасні ніки: малі латинські літери, цифри, крапка,
                     підкреслення.
     ========================================================== */
  var FIELD_RULES = {
    characterName: {
      pattern: /^\p{L}{2,12}$/u,
      message: 'Ім’я персонажа — лише літери, від 2 до 12 символів.'
    },
    realm: {
      pattern: /^\p{Script=Latin}[\p{Script=Latin}\p{N} '’.()\-]{1,31}$/u,
      message: 'Реалм — лише латиниця, цифри та символи з назв реалмів (пробіл, апостроф, дефіс, крапка, дужки).'
    },
    battleTag: {
      pattern: /^\p{L}[\p{L}\p{N}]{2,11}#\d{4,6}$/u,
      message: 'BattleTag має бути у форматі Molaf#21820: нік від 3 до 12 символів і 4–6 цифр після решітки.'
    },
    discord: {
      pattern: /^[a-z0-9._]{2,32}$/,
      message: 'Discord — малі латинські літери, цифри, крапка й підкреслення.'
    },
    availability: {
      test: function (value) { return value.length >= 10; },
      message: 'Опиши розклад хоча б кількома словами — це головне, на що дивляться офіцери.'
    }
  };

  function validateField(name, rawValue, isRequired) {
    var value = String(rawValue || '').trim();
    if (!value) {
      return isRequired ? { ok: false, message: 'Це поле обов’язкове.' } : { ok: true };
    }
    var rule = FIELD_RULES[name];
    if (!rule) return { ok: true };
    var valid = rule.pattern ? rule.pattern.test(value) : rule.test(value);
    return valid ? { ok: true } : { ok: false, message: rule.message };
  }

  function showFieldError(input, message) {
    if (!input) return;
    var holder = document.getElementById(input.id + 'Error');
    input.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (holder) {
      holder.textContent = message || '';
      holder.hidden = !message;
    }
    input.setCustomValidity(message || '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, delay) {
    var timer = 0;
    return function () {
      var args = arguments;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(null, args);
      }, delay || 120);
    };
  }

  function getApplicationSearchText(item) {
    return [
      item && item.number,
      item && item.application_number,
      item && item.tracking_number,
      item && item.title,
      item && item.summary,
      item && item.character_name,
      item && item.realm,
      item && item.region,
      item && item.faction,
      item && item.class_name
    ].map(function (value) {
      return String(value || '').toLowerCase();
    }).join(' ');
  }

  var CLASS_SLUGS = {
    'death knight': 'dk', 'demon hunter': 'dh', 'druid': 'druid', 'evoker': 'evoker',
    'hunter': 'hunter', 'mage': 'mage', 'monk': 'monk', 'paladin': 'paladin',
    'priest': 'priest', 'rogue': 'rogue', 'shaman': 'shaman', 'warlock': 'warlock',
    'warrior': 'warrior'
  };

  function chip(label, value, modifier) {
    if (!value) return '';
    return '<span class="app-chip' + (modifier ? ' app-chip--' + modifier : '') + '">' +
             '<span class="app-chip__label">' + escapeHtml(label) + '</span>' +
             '<span class="app-chip__value">' + escapeHtml(value) + '</span>' +
           '</span>';
  }

  /* Картка заявки.

     Було: обгортка «Заявка до гільдії», номер у заголовку І ще раз у
     метарядку, усі дані одним ланцюжком через «•», і на кожній картці
     заглушка «Короткий опис буде доступний після відкриття картки».
     Тепер: нік і статус у шапці, дані окремими чіпами, службові номери
     та дата — у підвалі. Опис показується, лише якщо він справді є. */
  function renderApplicationCard(item) {
    var statusKey = normalizeStatus(item);
    var stateClass = (STATUS[statusKey] && STATUS[statusKey].className) || 'review';
    var applicationNumber = item.number || item.application_number || '';
    var trackingNumber = item.tracking_number || '';
    var title = item.character_name ||
      String(item.title || '').replace(/^Заявка до гільдії:\s*/i, '').trim() ||
      'Нова заявка';

    var className = item.class_name || '';
    var classSlug = CLASS_SLUGS[className.toLowerCase()] || '';
    var faction = item.faction || '';
    var factionSlug = faction.toLowerCase() === 'horde' ? 'horde'
      : (faction.toLowerCase() === 'alliance' ? 'alliance' : '');

    var chips = [
      chip('Клас', className, classSlug ? 'class is-' + classSlug : 'class'),
      chip('Реалм', item.realm, 'realm'),
      chip('Фракція', faction, factionSlug ? 'faction is-' + factionSlug : 'faction')
    ].join('');

    var footerBits = [];
    if (applicationNumber) footerBits.push('№' + escapeHtml(applicationNumber));
    if (trackingNumber) footerBits.push('Код ' + escapeHtml(trackingNumber));
    if (item.created_at) footerBits.push(escapeHtml(formatDate(item.created_at)));

    var hasSummary = item.summary && String(item.summary).trim().length > 0;

    return '<article class="application-status-item application-status-item--' + stateClass + '">' +
      '<header class="application-status-item__head">' +
        '<h3 class="application-status-item__title">' + escapeHtml(title) + '</h3>' +
        '<span class="application-status-badge application-status-badge--' + stateClass + '">' +
          escapeHtml(humanStatus(item)) +
        '</span>' +
      '</header>' +
      (chips ? '<div class="application-status-item__chips">' + chips + '</div>' : '') +
      (hasSummary ? '<p class="application-status-item__desc">' + escapeHtml(item.summary) + '</p>' : '') +
      '<footer class="application-status-item__footer">' +
        (footerBits.length
          ? '<span class="application-status-item__ref">' + footerBits.join('<span class="application-status-item__sep">·</span>') + '</span>'
          : '') +
        (item.html_url
          ? '<a class="application-status-item__link" href="' + escapeHtml(item.html_url) + '" target="_blank" rel="noopener noreferrer">Відкрити <span aria-hidden="true">↗</span></a>'
          : '') +
      '</footer>' +
    '</article>';
  }

  async function fetchApplications(apiUrl, limit, params) {
    var url = new URL(apiUrl, window.location.href);
    url.searchParams.set('limit', String(limit));
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value) url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString(), {
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

          if (opening && window.matchMedia('(max-width: 640px)').matches) {
            window.requestAnimationFrame(function () {
              select.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            });
          }
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

    window.addEventListener('orientationchange', function () {
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

    /* Живі перевірки: помилка показується під полем при виході з нього,
       а зникає одразу, щойно значення стало коректним. */
    var LIVE_FIELDS = ['characterName', 'realm', 'battleTag', 'discord', 'availability'];
    LIVE_FIELDS.forEach(function (name) {
      var input = form ? form.querySelector('[name="' + name + '"]') : null;
      if (!input) return;

      function check() {
        var result = validateField(name, input.value, input.required);
        showFieldError(input, result.ok ? '' : result.message);
        return result.ok;
      }

      input.addEventListener('blur', check);
      input.addEventListener('input', function () {
        if (input.classList.contains('has-error')) check();
      });
    });

    /* Лічильник символів у полі розкладу */
    var availabilityInput = form ? form.querySelector('[name="availability"]') : null;
    var availabilityCounter = document.getElementById('availabilityCounter');
    if (availabilityInput && availabilityCounter) {
      var maxLength = Number(availabilityInput.getAttribute('maxlength') || 400);
      var updateCounter = function () {
        var used = availabilityInput.value.length;
        availabilityCounter.textContent = used + ' / ' + maxLength;
        availabilityCounter.classList.toggle('is-near-limit', used > maxLength * 0.9);
      };
      availabilityInput.addEventListener('input', updateCounter);
      updateCounter();
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
          region: 'eu',
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

        /* Єдина перевірка всіх полів за спільними правилами.
           Раніше формат перевірявся тільки для BattleTag, і то іншим,
           заниженим патерном (дозволяв 3 цифри й символи _ та -). */
        var firstInvalid = null;
        for (var i = 0; i < LIVE_FIELDS.length; i += 1) {
          var fieldName = LIVE_FIELDS[i];
          var fieldInput = form.querySelector('[name="' + fieldName + '"]');
          if (!fieldInput) continue;
          var check = validateField(fieldName, payload[fieldName], fieldInput.required);
          showFieldError(fieldInput, check.ok ? '' : check.message);
          if (!check.ok && !firstInvalid) {
            firstInvalid = { input: fieldInput, message: check.message };
          }
        }

        if (firstInvalid) {
          firstInvalid.input.focus();
          firstInvalid.input.scrollIntoView({ block: 'center', behavior: 'smooth' });
          setFeedback('error', firstInvalid.message);
          return;
        }

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.dataset.idleLabel = submitButton.textContent;
          submitButton.textContent = 'Надсилаємо…';
          submitButton.classList.add('is-loading');
        }

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
          var applicationNumber = result.application_number || result.number || '';
          var trackingNumber = result.tracking_number || '';
          var numberHtml = '';
          if (applicationNumber || trackingNumber) {
            numberHtml = '<br>';
            if (applicationNumber) {
              numberHtml += '<strong>Номер заявки: #' + escapeHtml(applicationNumber) + '</strong><br>';
            }
            if (trackingNumber) {
              numberHtml += '<strong>Номер відстеження: №' + escapeHtml(trackingNumber) + '</strong><br>Збережи цей номер — за ним можна буде швидко знайти заявку в пошуку.';
            }
          }
          setFeedback('success', result.html_url
            ? 'Заявку надіслано. Можна одразу <a href="' + escapeHtml(result.html_url) + '" target="_blank" rel="noopener noreferrer">відкрити її</a>.' + numberHtml
            : 'Заявку надіслано. Дані перевірено й заявку створено.' + numberHtml);
          loadRecent();
        } catch (error) {
          setFeedback('error', escapeHtml(error.message || 'Зараз не вдалося надіслати заявку. Спробуй ще раз трохи пізніше.'));
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.classList.remove('is-loading');
            if (submitButton.dataset.idleLabel) {
              submitButton.textContent = submitButton.dataset.idleLabel;
            }
          }
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
    const statDeclined = document.getElementById('applications-stat-declined');
    const searchInput = document.getElementById('applications-search-input');
    const statusFilter = document.getElementById('applications-status-filter');
    const classFilter = document.getElementById('applications-class-filter');
    const sortFilter = document.getElementById('applications-sort-filter');
    const clearButton = document.getElementById('applications-clear-search');
    const refreshButton = document.getElementById('applications-refresh');
    let allItems = [];

    function getSearchValue() {
      return (searchInput ? searchInput.value : '').toString().trim().toLowerCase();
    }

    function getFilterValue(node) {
      return (node ? node.value : '').toString().trim();
    }

    function sortItems(items) {
      const mode = getFilterValue(sortFilter) || 'newest';
      const copy = items.slice();
      copy.sort(function (a, b) {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        if (mode === 'oldest') return dateA - dateB;
        if (mode === 'status') return (STATUS[normalizeStatus(a)].order || 0) - (STATUS[normalizeStatus(b)].order || 0);
        if (mode === 'class') return String(a.class_name || '').localeCompare(String(b.class_name || ''), 'uk');
        return dateB - dateA;
      });
      return copy;
    }

    function filterItems() {
      const query = getSearchValue();
      const status = getFilterValue(statusFilter);
      const className = getFilterValue(classFilter).toLowerCase();

      return sortItems(allItems.filter(function (item) {
        const matchesQuery = !query || getApplicationSearchText(item).includes(query);
        const matchesStatus = !status || normalizeStatus(item) === status;
        const matchesClass = !className || String(item.class_name || '').toLowerCase() === className;

        return matchesQuery && matchesStatus && matchesClass;
      }));
    }

    function updateCounter(items) {
      const total = allItems.length;
      const visible = items.length;
      const approved = allItems.filter(function (item) { return normalizeStatus(item) === 'accepted'; }).length;
      const open = allItems.filter(function (item) { return normalizeStatus(item) === 'review'; }).length;
      const declined = allItems.filter(function (item) { return normalizeStatus(item) === 'declined'; }).length;
      const q = getSearchValue();
      const activeFilters = [q, getFilterValue(statusFilter), getFilterValue(classFilter)].filter(Boolean).length;
      if (counter) {
        counter.textContent = activeFilters
          ? 'Показано ' + visible + ' із ' + total + ' заявок за поточними фільтрами.'
          : 'Усього заявок у списку: ' + total + '.';
      }
      if (statTotal) statTotal.textContent = String(total);
      if (statApproved) statApproved.textContent = String(approved);
      if (statOpen) statOpen.textContent = String(open);
      if (statDeclined) statDeclined.textContent = String(declined);
    }

    function renderDirectory(items) {
      if (!listRoot) return;
      updateCounter(items);
      if (!Array.isArray(items) || items.length === 0) {
        listRoot.innerHTML = '<div class="applications-empty">За цими фільтрами нічого не знайдено. Спробуй інший нік, статус або клас.</div>';
        return;
      }
      listRoot.innerHTML = items.map(renderApplicationCard).join('');
    }

    async function loadDirectory() {
      if (!listRoot) return;
      listRoot.innerHTML = '<div class="applications-placeholder">Оновлюємо повний список заявок…</div>';
      try {
        allItems = await fetchApplications(apiUrl, limit, {
          sort: 'created',
          direction: 'desc'
        });
        renderDirectory(filterItems());
      } catch (error) {
        listRoot.innerHTML = '<div class="applications-empty">Зараз не вдалося завантажити список заявок. Спробуй ще раз трохи пізніше.</div>';
        if (counter) counter.textContent = 'Список тимчасово недоступний.';
      }
    }

    const rerenderDirectory = function () {
      renderDirectory(filterItems());
    };
    const debouncedSearch = debounce(rerenderDirectory, 120);

    [searchInput, statusFilter, classFilter, sortFilter].forEach(function (node) {
      if (!node) return;
      node.addEventListener(node === searchInput ? 'input' : 'change', node === searchInput ? debouncedSearch : rerenderDirectory);
    });

    if (clearButton) {
      clearButton.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        if (statusFilter) statusFilter.value = '';
        if (classFilter) classFilter.value = '';
        if (sortFilter) sortFilter.value = 'newest';
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
