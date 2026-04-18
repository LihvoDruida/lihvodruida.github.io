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

<div class="guild-application-page" data-api-url="{{ site.guild_applications_api_url }}" data-status-limit="8">
  <section class="application-hero">
    <div class="application-hero__content">
      <span class="section-tag">Набір до гільдії</span>
      <h1>Вступ до Mistblossom Vanguard</h1>
      <p class="section-subtitle">Заповни коротку заявку, а потім перевір статус просто на сайті. Усе зібрано на одній сторінці, без довгих анкет і зайвих кроків.</p>

      <div class="application-hero__chips">
        <span class="application-chip">Alliance</span>
        <span class="application-chip">Рейди та Mythic+</span>
        <span class="application-chip">Коротка заявка</span>
      </div>

      <div class="application-hero__actions">
        <a href="#guild-application-form" class="application-primary-link">Заповнити заявку</a>
        <a href="{{ '/guild/applications/' | relative_url }}" class="application-secondary-link">Переглянути всі заявки</a>
      </div>
    </div>

    <div class="application-hero__panel">
      <div class="application-info-card">
        <h2>Як усе відбувається</h2>
        <ol class="application-steps">
          <li><strong>Заповни форму.</strong> Достатньо персонажа, класу, контактів і часу, коли ти зазвичай онлайн.</li>
          <li><strong>Дочекайся розгляду.</strong> Поки заявка відкрита, вона вважається активною і чекає на відповідь.</li>
          <li><strong>Перевір статус.</strong> Коли розгляд завершиться, це одразу буде видно в списку заявок.</li>
        </ol>

        {% if site.data.socials.discord %}
        <a href="{{ site.data.socials.discord }}" target="_blank" rel="noopener noreferrer" class="application-discord-link">Приєднатися до Discord</a>
        {% endif %}
      </div>
    </div>
  </section>

  <section class="guild-finder-section">
    <div class="guild-finder-card guild-finder-card--content">
      <div class="application-section-head">
        <span class="section-tag">Як знайти гільдію в грі</span>
        <h2>Альянс може знайти Mistblossom Vanguard через Guild &amp; Communities</h2>
        <p>Відкрий пошук гільдій, введи <strong>Mistblossom Vanguard</strong> і перевір, що ти на персонажі Альянсу. Після цього гільдію можна знайти в списку та подати запит на вступ.</p>
      </div>

      <div class="finder-steps-grid">
        <article class="finder-step-card">
          <span class="finder-step-card__num">1</span>
          <h3>Відкрий пошук гільдій</h3>
          <p>У грі відкрий <strong>Guild &amp; Communities</strong> і перейди до пошуку гільдій.</p>
        </article>
        <article class="finder-step-card">
          <span class="finder-step-card__num">2</span>
          <h3>Введи назву гільдії</h3>
          <p>У полі пошуку введи <strong>Mistblossom Vanguard</strong> і переконайся, що персонаж належить до Альянсу.</p>
        </article>
        <article class="finder-step-card">
          <span class="finder-step-card__num">3</span>
          <h3>Подай запит у грі</h3>
          <p>Коли знайдеш гільдію в списку, надішли запит на вступ і тримай зв’язок через Discord.</p>
        </article>
      </div>
    </div>

    <div class="guild-finder-card guild-finder-card--image">
      <img src="{{ '/assets/img/guild-finder-apply.png' | relative_url }}" alt="Пошук гільдії Mistblossom Vanguard у World of Warcraft">
      <p class="guild-finder-caption">Приклад того, як Mistblossom Vanguard виглядає у вікні пошуку гільдій у грі.</p>
    </div>
  </section>

  <section class="application-layout">
    <div class="application-form-card">
      <div class="application-section-head">
        <span class="section-tag">Форма заявки</span>
        <h2>Кілька коротких полів — і все готово</h2>
        <p>Заявка лишається короткою, щоб її було зручно заповнити і з комп’ютера, і з телефона.</p>
      </div>

      <form id="guild-application-form" class="guild-application-form" novalidate>
        <input type="text" name="website" class="sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">

        <div class="form-grid form-grid--three">
          <label class="form-field">
            <span>Ім’я персонажа</span>
            <input type="text" name="characterName" maxlength="60" placeholder="Sebas" required>
          </label>

          <label class="form-field">
            <span>Реалм</span>
            <input type="text" name="realm" maxlength="60" placeholder="Terokkar" value="Terokkar" required>
          </label>

          <label class="form-field">
            <span>Клас</span>
            <input type="text" name="className" maxlength="60" placeholder="Druid" required>
          </label>
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

        <label class="form-field">
          <span>Коли зазвичай граєш</span>
          <textarea name="availability" rows="4" maxlength="400" placeholder="Наприклад: будні після 19:00, вихідні переважно ввечері" required></textarea>
        </label>

        <div class="form-actions">
          <button type="submit" class="btn-application-submit">Надіслати заявку</button>
          <p class="form-hint">Після відправлення заявка одразу з’явиться у списку недавніх заявок.</p>
        </div>

        <div id="guild-application-feedback" class="form-feedback" aria-live="polite"></div>
      </form>
    </div>

    <aside class="application-status-card" aria-labelledby="applications-status-heading">
      <div class="application-section-head application-section-head--compact">
        <span class="section-tag">Недавні заявки</span>
        <h2 id="applications-status-heading">Останні звернення</h2>
        <p>Тут показуються лише кілька найсвіжіших заявок. Повний список доступний на окремій сторінці.</p>
      </div>

      <div class="status-toolbar status-toolbar--stacked">
        <div class="status-toolbar__group">
          <span class="status-toolbar__legend"><span class="status-dot status-dot--open"></span> На розгляді</span>
          <span class="status-toolbar__legend"><span class="status-dot status-dot--closed"></span> Розгляд завершено</span>
        </div>
        <div class="status-toolbar__group status-toolbar__group--actions">
          <a href="{{ '/guild/applications/' | relative_url }}" class="status-page-link">Усі заявки</a>
          <button type="button" id="guild-application-refresh" class="status-refresh-button">Оновити</button>
        </div>
      </div>

      <div class="applications-scroll applications-scroll--recent spec-chart-wrap">
        <div id="guild-applications-status" class="applications-status-list applications-status-list--stacked">
          <div class="applications-placeholder">Завантажуємо актуальний список заявок…</div>
        </div>
      </div>
    </aside>
  </section>
</div>
