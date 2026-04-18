---
layout: default
title: Подати заявку до Mistblossom Vanguard
permalink: /guild/apply/
description: "Сторінка подачі заявки до гільдії Mistblossom Vanguard. Заповни форму, залишайся на зв’язку в Discord і стеж за статусом розгляду."
image: /assets/img/og-image-default.webp
tags: [Mistblossom Vanguard, заявка до гільдії, World of Warcraft, рейди, Mythic+]
extra_css:
  - /assets/css/apply.css
extra_js:
  - /assets/js/guild-applications.js
---

<div class="guild-application-page" data-api-url="{{ site.guild_applications_api_url }}" data-status-limit="12">
  <section class="application-hero">
    <div class="application-hero__content">
      <span class="section-tag">Набір до гільдії</span>
      <h1>Подати заявку до Mistblossom Vanguard</h1>
      <p class="section-subtitle">Заповни коротку форму, а нижче можна одразу побачити останні заявки та їхній поточний статус.</p>

      <div class="application-hero__chips">
        <span class="application-chip">Рейди та Mythic+</span>
        <span class="application-chip">Коротка заявка</span>
        <span class="application-chip">Статус на сайті</span>
      </div>
    </div>

    <div class="application-hero__panel">
      <div class="application-info-card">
        <h2>Як усе працює</h2>
        <ol class="application-steps">
          <li><strong>Заповни заявку.</strong> Вкажи лише основне: персонажа, клас і коли ти зазвичай у грі.</li>
          <li><strong>Залишайся на зв’язку.</strong> Для швидкого контакту найзручніше залишити Discord.</li>
          <li><strong>Стеж за статусом.</strong> Поки заявка відкрита — вона на розгляді. Коли розгляд завершено, статус оновиться.</li>
        </ol>

        {% if site.data.socials.discord %}
        <a href="{{ site.data.socials.discord }}" target="_blank" rel="noopener noreferrer" class="application-discord-link">Приєднатися до Discord</a>
        {% endif %}
      </div>
    </div>
  </section>

  <section class="application-layout">
    <div class="application-form-card">
      <div class="application-section-head">
        <span class="section-tag">Форма заявки</span>
        <h2>Розкажи про себе</h2>
        <p>Тут лише найважливіше — без зайвих полів і довгих анкет.</p>
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
          <p class="form-hint">Після відправлення заявка одразу з’явиться у списку нижче.</p>
        </div>

        <div id="guild-application-feedback" class="form-feedback" aria-live="polite"></div>
      </form>
    </div>

    <aside class="application-status-card" aria-labelledby="applications-status-heading">
      <div class="application-section-head application-section-head--compact">
        <span class="section-tag">Статус заявок</span>
        <h2 id="applications-status-heading">Останні заявки</h2>
        <p>Відкриті заявки автоматично позначаються як ті, що ще розглядаються. Після завершення розгляду статус змінюється.</p>
      </div>

      <div class="status-toolbar">
        <span class="status-toolbar__legend"><span class="status-dot status-dot--open"></span> На розгляді</span>
        <span class="status-toolbar__legend"><span class="status-dot status-dot--closed"></span> Розгляд завершено</span>
        <button type="button" id="guild-application-refresh" class="status-refresh-button">Оновити</button>
      </div>

      <div id="guild-applications-status" class="applications-status-list">
        <div class="applications-placeholder">Завантажуємо актуальний список заявок…</div>
      </div>
    </aside>
  </section>
</div>
