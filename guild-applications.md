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

<div class="guild-page-container guild-applications-directory" data-api-url="{{ site.guild_applications_api_url }}" data-status-limit="50">
  <section class="applications-page-hero">
    <div class="applications-page-hero__grid">
      <div class="applications-page-hero__copy">
        <span class="section-tag">Журнал заявок</span>
        <h1>Усі заявки до Mistblossom Vanguard</h1>
        <p class="section-subtitle">Тут зібрані всі звернення до гільдії. Можна швидко перевірити статус, знайти персонажа за ніком і відкрити оригінальну заявку.</p>

        <div class="applications-page-hero__actions">
          <a href="{{ '/guild/apply/' | relative_url }}" class="application-primary-link">Заповнити заявку</a>
          <a href="{{ '/guild/' | relative_url }}" class="application-secondary-link">До сторінки гільдії</a>
        </div>
      </div>

      <div class="applications-page-hero__stats" aria-label="Зведення по заявках">
        <div class="applications-hero-stat">
          <span class="applications-hero-stat__label">Отримано заявок</span>
          <strong id="applications-stat-total" class="applications-hero-stat__value">—</strong>
        </div>
        <div class="applications-hero-stat">
          <span class="applications-hero-stat__label">Схвалено</span>
          <strong id="applications-stat-approved" class="applications-hero-stat__value">—</strong>
        </div>
        <div class="applications-hero-stat">
          <span class="applications-hero-stat__label">Ще на розгляді</span>
          <strong id="applications-stat-open" class="applications-hero-stat__value">—</strong>
        </div>
      </div>
    </div>
  </section>

  <section class="applications-directory-panel applications-directory-panel--enhanced">
    <div class="applications-panel-head">
      <div>
        <span class="section-tag">Пошук і фільтр</span>
        <h2>Знайди потрібну заявку за кілька секунд</h2>
        <p>Пошук працює по назві заявки та короткому опису персонажа.</p>
      </div>
    </div>

    <div class="applications-filter-bar applications-filter-bar--enhanced">
      <label class="applications-search-field" for="applications-search-input">
        <span>Пошук за ніком</span>
        <input id="applications-search-input" type="search" placeholder="Наприклад: Sebas або Illidonson" autocomplete="off">
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
