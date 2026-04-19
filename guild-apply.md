---
layout: default
title: Вступ до Mistblossom Vanguard
permalink: /guild/apply/
description: "Коротка заявка до Mistblossom Vanguard, поради як знайти гільдію в грі та актуальний статус недавніх заявок."
image: /assets/img/guild-finder-apply.png
tags: [Mistblossom Vanguard, вступ до гільдії, World of Warcraft, Alliance, рейди, Mythic+]
extra_css:
  - /assets/css/apply.css
extra_js:
  - /assets/js/guild-applications.js
---

<div class="area-content guild-page-container listing-page listing-page--guild-apply guild-application-page" data-api-url="{{ site.guild_applications_api_url }}" data-status-limit="8">
  <section class="page-hero page-hero--applications page-hero--apply page-hero--showcase">
    <div class="page-hero-grid page-hero-grid--showcase">
      <div class="page-hero-copy">
        <span class="section-tag">Шлях до вступу</span>
        <div class="hero-showcase__brand">
            <div class="hero-showcase__logo-wrap">
              <img src="{{ '/assets/img/guild-logo.webp' | relative_url }}" alt="Логотип гільдії Mistblossom Vanguard" class="hero-showcase__logo" loading="eager" decoding="async">
            </div>
            <div class="hero-showcase__brand-copy">
              <h2 class="hero-showcase__title">Mistblossom Vanguard</h2>
              <p class="hero-showcase__text">Анкета для вступу до гільдії: заповни форму й далі стеж за статусом на сайті.</p>
            </div>
          </div>
                    <div class="hero-showcase__tiles hero-showcase__tiles--path">
            <article class="hero-info-tile">
              <span class="hero-info-tile__label">Крок 1</span>
              <strong class="hero-info-tile__value">Guild Finder</strong>
              <p class="hero-info-tile__meta">Знайди гільдію в грі</p>
            </article>
            <article class="hero-info-tile">
              <span class="hero-info-tile__label">Крок 2</span>
              <strong class="hero-info-tile__value">Подай заявку</strong>
              <p class="hero-info-tile__meta">Коротка форма без зайвого</p>
            </article>
            <article class="hero-info-tile">
              <span class="hero-info-tile__label">Крок 3</span>
              <strong class="hero-info-tile__value">Стеж за статусом</strong>
              <p class="hero-info-tile__meta">Оновлення на окремій сторінці</p>
            </article>
          </div>
        <div class="hero-chip-row">
          <span class="application-chip">Alliance / Horde</span>
          <span class="application-chip">Рейди / Mythic+</span>
          <span class="application-chip">Discord</span>
        </div>
        <div class="toolbar-links hero-actions">
          <a href="#guild-application-form" class="application-primary-link">Заповнити заявку</a>
          <a href="{{ '/guild/applications/' | relative_url }}" class="btn-secondary-hero">Перевірити статус</a>
        </div>
      </div>
    </div>
  </section>

  <div class="content-toolbar application-toolbar">
    <div>
      <h2 class="toolbar-title">Як вступити до гільдії</h2>
      <p class="toolbar-copy">Спочатку знайди гільдію в грі, нижче заповни коротку форму й перевіряй статус заявки на сайті.</p>
    </div>
    <div class="toolbar-links">
      <a href="{{ '/guild/' | relative_url }}" class="btn-secondary-hero">Сторінка гільдії</a>
      {% if site.data.socials.discord %}
      <a href="{{ site.data.socials.discord }}" target="_blank" rel="noopener noreferrer" class="btn-secondary-hero">Discord</a>
      {% endif %}
    </div>
  </div>

  <section class="featured-article featured-article--applications guild-apply-guide">
    <div class="featured-image guild-apply-guide__image">
      <div class="guild-apply-guide__image-frame">
        <img src="{{ '/assets/img/guild-finder-apply.png' | relative_url }}" alt="Пошук гільдії Mistblossom Vanguard у World of Warcraft" loading="eager" decoding="async">
      </div>
      <div class="guild-apply-guide__image-caption">
        <span class="guild-apply-guide__image-kicker">Guild Finder</span>
        <strong class="guild-apply-guide__image-title">Так виглядає пошук гільдії в грі</strong>
      </div>
    </div>

    <div class="featured-content guild-apply-guide__content">
      <div class="featured-meta">
        <span class="category-badge category-badge--guild">У грі</span>
        <span class="date">Перший крок</span>
      </div>

      <h2>Знайди Mistblossom Vanguard у Guild Finder</h2>
      <p>Відкрий <strong>Guild &amp; Communities</strong>, введи <strong>Mistblossom Vanguard</strong> і після цього заповни заявку на сайті. Так ми швидше побачимо твій нік, клас і контакти.</p>

      <div class="finder-steps-grid finder-steps-grid--newslike">
        <article class="finder-step-card">
          <span class="finder-step-card__num">1</span>
          <h3>Відкрий Guild Finder</h3>
          <p>Перейди до <strong>Guild &amp; Communities</strong> у World of Warcraft.</p>
        </article>

        <article class="finder-step-card">
          <span class="finder-step-card__num">2</span>
          <h3>Знайди гільдію</h3>
          <p>Введи <strong>Mistblossom Vanguard</strong> у пошуку.</p>
        </article>

        <article class="finder-step-card">
          <span class="finder-step-card__num">3</span>
          <h3>Заповни форму на сайті</h3>
          <p>Так простіше перевірити статус і швидше зв’язатися з тобою.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="application-main-grid">
    <div class="application-panel application-panel--form">
      <div class="application-panel__header">
        <span class="section-tag">Форма заявки</span>
        <h2>Швидка анкета для вступу</h2>
        <p>Лише основна інформація: персонаж, реалм, фракція, клас і контакти. Без перевантаження та зайвих кроків.</p>
      </div>

      <form id="guild-application-form" class="guild-application-form" novalidate>
        <input type="text" name="website" class="sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">

        <div class="form-grid form-grid--two">
          <label class="form-field">
            <span>Ім’я персонажа</span>
            <input type="text" name="characterName" maxlength="60" placeholder="Sebas" required>
          </label>

          <label class="form-field">
            <span>Реалм</span>
            <input type="text" name="realm" maxlength="60" placeholder="Terokkar" value="Terokkar" required>
          </label>
        </div>

        <div class="form-grid form-grid--two form-grid--selectors">
          <div class="form-field">
            <span>Фракція</span>
            <div class="custom-select" data-name="faction" data-placeholder="Обери фракцію">
              <input type="hidden" name="faction" value="">
              <button type="button" class="custom-select__trigger" aria-haspopup="listbox" aria-expanded="false">
                <span class="custom-select__value">Обери фракцію</span>
                <span class="custom-select__icon" aria-hidden="true">⌄</span>
              </button>
              <div class="custom-select__menu" role="listbox" tabindex="-1">
                <button type="button" class="custom-select__option" role="option" data-value="Alliance">Alliance</button>
                <button type="button" class="custom-select__option" role="option" data-value="Horde">Horde</button>
              </div>
            </div>
          </div>

          <div class="form-field">
            <span>Клас</span>
            <div class="custom-select" data-name="className" data-placeholder="Обери клас">
              <input type="hidden" name="className" value="">
              <button type="button" class="custom-select__trigger" aria-haspopup="listbox" aria-expanded="false">
                <span class="custom-select__value">Обери клас</span>
                <span class="custom-select__icon" aria-hidden="true">⌄</span>
              </button>
              <div class="custom-select__menu custom-select__menu--tall" role="listbox" tabindex="-1">
                <button type="button" class="custom-select__option" role="option" data-value="Warrior">Warrior</button>
                <button type="button" class="custom-select__option" role="option" data-value="Paladin">Paladin</button>
                <button type="button" class="custom-select__option" role="option" data-value="Hunter">Hunter</button>
                <button type="button" class="custom-select__option" role="option" data-value="Rogue">Rogue</button>
                <button type="button" class="custom-select__option" role="option" data-value="Priest">Priest</button>
                <button type="button" class="custom-select__option" role="option" data-value="Death Knight">Death Knight</button>
                <button type="button" class="custom-select__option" role="option" data-value="Shaman">Shaman</button>
                <button type="button" class="custom-select__option" role="option" data-value="Mage">Mage</button>
                <button type="button" class="custom-select__option" role="option" data-value="Warlock">Warlock</button>
                <button type="button" class="custom-select__option" role="option" data-value="Monk">Monk</button>
                <button type="button" class="custom-select__option" role="option" data-value="Druid">Druid</button>
                <button type="button" class="custom-select__option" role="option" data-value="Demon Hunter">Demon Hunter</button>
                <button type="button" class="custom-select__option" role="option" data-value="Evoker">Evoker</button>
              </div>
            </div>
          </div>
        </div>

        <div class="form-grid form-grid--two">
          <label class="form-field">
            <span>Discord</span>
            <input type="text" name="discord" maxlength="80" placeholder="sebas123" required>
          </label>

          <label class="form-field">
            <span>BattleTag</span>
            <input type="text" name="battleTag" maxlength="80" placeholder="Sebas#1234">
          </label>
        </div>

        <label class="form-field form-field--full">
          <span>Коли зазвичай граєш</span>
          <textarea name="availability" rows="4" maxlength="400" placeholder="Наприклад: будні після 19:00, вихідні ввечері" required></textarea>
        </label>

        <div class="form-actions">
          <button type="submit" class="application-submit-button">Надіслати заявку</button>
          <p class="form-hint">Після відправлення можна одразу перейти до списку заявок і перевірити статус.</p>
        </div>

        <div id="guild-application-feedback" class="form-feedback" aria-live="polite"></div>
      </form>
    </div>

    <aside class="application-panel application-panel--status">
      <div class="application-panel__header application-panel__header--compact">
        <span class="section-tag">Останні заявки</span>
        <h2>Останні звернення та їх статус</h2>
        <p>Відкриті заявки ще в роботі. Коли розгляд завершено, статус змінюється автоматично.</p>
      </div>

      <div class="applications-legend">
        <span><i class="legend-dot"></i> На розгляді</span>
        <span><i class="legend-dot legend-dot--closed"></i> Розгляд завершено</span>
      </div>

      <div class="application-status-actions">
        <a href="{{ '/guild/applications/' | relative_url }}" class="btn-secondary-hero">Усі заявки</a>
        <button type="button" id="guild-application-refresh" class="status-refresh-button">Оновити</button>
      </div>

      <div id="guild-applications-status" class="application-status-list application-status-list--recent">
        <div class="applications-placeholder">Оновлюємо список заявок…</div>
      </div>
    </aside>
  </section>
</div>
