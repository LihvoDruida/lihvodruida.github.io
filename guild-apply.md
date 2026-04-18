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

<div class="guild-page-container guild-application-page" data-api-url="{{ site.guild_applications_api_url }}" data-status-limit="8">
  <section class="applications-page-hero applications-page-hero--apply">
    <div class="applications-page-hero__grid">
      <div class="applications-page-hero__copy">
        <span class="section-tag">Набір до гільдії</span>
        <h1>Подай заявку до Mistblossom Vanguard</h1>
        <p class="section-subtitle">Заповни коротку форму, залиш контакти й відразу перевіряй статус звернення на сайті.</p>

        <div class="application-hero__chips">
          <span class="application-chip">Alliance / Horde</span>
          <span class="application-chip">Рейди та Mythic+</span>
          <span class="application-chip">Сайт + Discord</span>
        </div>

        <div class="application-mini-stats">
          <div class="application-mini-stat">
            <span class="application-mini-stat__label">Формат</span>
            <strong class="application-mini-stat__value">Коротка заявка</strong>
          </div>
          <div class="application-mini-stat">
            <span class="application-mini-stat__label">Відповідь</span>
            <strong class="application-mini-stat__value">Після розгляду</strong>
          </div>
        </div>

        <div class="applications-page-hero__actions">
          <a href="#guild-application-form" class="application-primary-link">Заповнити заявку</a>
          <a href="{{ '/guild/applications/' | relative_url }}" class="application-secondary-link">Усі заявки</a>
        </div>
      </div>

      <div class="applications-page-hero__aside">
        <div class="applications-hero-card">
          <span class="section-tag">Як усе відбувається</span>
          <h2>Швидкий і зрозумілий процес</h2>
          <ol class="application-steps application-steps--compact">
            <li><strong>Надішли заявку.</strong> Персонаж, фракція, клас і контакти.</li>
            <li><strong>Слідкуй за статусом.</strong> Відкриті заявки залишаються на розгляді.</li>
            <li><strong>Дочекайся відповіді.</strong> Коли рішення буде готове, статус оновиться.</li>
          </ol>
          {% if site.data.socials.discord %}
          <a href="{{ site.data.socials.discord }}" target="_blank" rel="noopener noreferrer" class="application-discord-link">Discord гільдії</a>
          {% endif %}
        </div>
      </div>
    </div>
  </section>

  <section class="guild-finder-section guild-finder-section--compact">
    <div class="guild-finder-card guild-finder-card--content">
      <div class="application-section-head application-section-head--tight">
        <span class="section-tag">Як знайти гільдію в грі</span>
        <h2>Альянс може знайти Mistblossom Vanguard через Guild &amp; Communities</h2>
        <p>Відкрий пошук гільдій, введи <strong>Mistblossom Vanguard</strong> і переконайся, що ти на персонажі Альянсу. Після цього можна відправити запит на вступ і дублювати заявку через сайт.</p>
      </div>

      <div class="finder-steps-grid finder-steps-grid--compact">
        <article class="finder-step-card">
          <span class="finder-step-card__num">1</span>
          <h3>Відкрий Guild Finder</h3>
          <p>Перейди до вікна <strong>Guild &amp; Communities</strong> у грі.</p>
        </article>
        <article class="finder-step-card">
          <span class="finder-step-card__num">2</span>
          <h3>Знайди гільдію</h3>
          <p>Введи назву <strong>Mistblossom Vanguard</strong> у пошуку.</p>
        </article>
        <article class="finder-step-card">
          <span class="finder-step-card__num">3</span>
          <h3>Надішли заявку</h3>
          <p>Подай запит у грі й тримай зв’язок через Discord або сайт.</p>
        </article>
      </div>
    </div>

    <div class="guild-finder-card guild-finder-card--image guild-finder-card--image-compact">
      <img src="{{ '/assets/img/guild-finder-apply.png' | relative_url }}" alt="Пошук гільдії Mistblossom Vanguard у World of Warcraft">
      <p class="guild-finder-caption">Так Mistblossom Vanguard виглядає у вікні Guild &amp; Communities.</p>
    </div>
  </section>

  <section class="application-layout application-layout--refined">
    <div class="application-form-card application-form-card--refined">
      <div class="application-section-head application-section-head--tight">
        <span class="section-tag">Форма заявки</span>
        <h2>Швидка анкета для вступу</h2>
        <p>Заповни кілька полів, обери фракцію та клас і залиш контакти, щоб ми могли швидко з тобою зв’язатися.</p>
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

        <div class="form-actions form-actions--compact">
          <button type="submit" class="application-submit-button">Надіслати заявку</button>
          <p class="form-hint">Після відправлення її можна одразу відкрити та перевірити статус.</p>
        </div>

        <div id="guild-application-feedback" class="form-feedback" aria-live="polite"></div>
      </form>
    </div>

    <aside class="application-status-card application-status-card--refined">
      <div class="application-section-head application-section-head--tight">
        <span class="section-tag">Недавні заявки</span>
        <h2>Останні звернення</h2>
        <p>Тут показуються лише кілька останніх заявок. Повний список відкривається на окремій сторінці.</p>
      </div>

      <div class="applications-legend">
        <span><i class="legend-dot legend-dot--open"></i> На розгляді</span>
        <span><i class="legend-dot legend-dot--closed"></i> Розгляд завершено</span>
      </div>

      <div class="application-status-actions application-status-actions--compact">
        <a href="{{ '/guild/applications/' | relative_url }}" class="application-secondary-link">Усі заявки</a>
        <button type="button" id="guild-application-refresh" class="status-refresh-button">Оновити</button>
      </div>

      <div id="guild-applications-status" class="application-status-list application-status-list--compact">
        <div class="applications-placeholder">Оновлюємо список заявок…</div>
      </div>
    </aside>
  </section>
</div>
