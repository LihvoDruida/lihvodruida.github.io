---
layout: default
title: Усі заявки до Mistblossom Vanguard
permalink: /guild/applications/
description: "Повний список заявок до Mistblossom Vanguard зі статусами та пошуком за ніком персонажа."
image: /assets/img/guild-finder-apply.png
tags: [Mistblossom Vanguard, список заявок, статус заявок, World of Warcraft]
extra_css:
  - /assets/css/apply.css
extra_js:
  - /assets/js/guild-applications.js
---

<div class="guild-applications-directory" data-api-url="{{ site.guild_applications_api_url }}" data-status-limit="50">
  <section class="applications-directory-hero">
    <div class="application-section-head applications-directory-hero__content">
      <span class="section-tag">Усі заявки</span>
      <h1>Список заявок до Mistblossom Vanguard</h1>
      <p>Тут зібрані всі заявки зі статусами. Можна швидко знайти персонажа за ніком і перевірити, чи заявка ще розглядається.</p>
    </div>

    <div class="applications-directory-hero__actions">
      <a href="{{ '/guild/apply/' | relative_url }}" class="application-primary-link">Заповнити заявку</a>
      <a href="{{ '/guild/' | relative_url }}" class="application-secondary-link">Повернутися до гільдії</a>
    </div>
  </section>

  <section class="applications-directory-panel">
    <div class="applications-filter-bar">
      <label class="applications-search-field" for="applications-search-input">
        <span>Пошук за ніком</span>
        <input id="applications-search-input" type="search" placeholder="Наприклад: Sebas" autocomplete="off">
      </label>

      <div class="applications-filter-actions">
        <button type="button" id="applications-clear-search" class="status-refresh-button status-refresh-button--ghost">Очистити</button>
        <button type="button" id="applications-refresh" class="status-refresh-button">Оновити</button>
      </div>
    </div>

    <div class="applications-directory-summary">
      <p id="applications-directory-counter">Завантажуємо заявки…</p>
    </div>

    <div id="guild-applications-directory-list" class="applications-directory-list">
      <div class="applications-placeholder">Завантажуємо повний список заявок…</div>
    </div>
  </section>
</div>
