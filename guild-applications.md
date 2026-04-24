---
layout: default
title: Усі заявки до Mistblossom Vanguard
permalink: /guild/applications/
description: "Закритий список заявок до Mistblossom Vanguard зі статусами, пошуком, фільтрами за класом і сортуванням."
robots: noindex, nofollow, noarchive
sitemap: false
image: /assets/img/guild-finder-apply.png
tags: [Mistblossom Vanguard, список заявок, статус заявок, World of Warcraft]
extra_css:
  - /assets/css/apply.css
extra_js:
  - /assets/js/guild-applications.js
---

<div class="area-content guild-page-container listing-page listing-page--guild-applications guild-applications-directory" data-api-url="{{ site.guild_applications_api_url }}" data-status-limit="100">
  <section class="page-hero page-hero--applications page-hero--showcase page-hero--directory-showcase">
    <div class="page-hero-grid page-hero-grid--showcase">
      <div class="page-hero-copy">
        <span class="section-tag">Журнал заявок</span>
        <h1>Усі заявки до Mistblossom Vanguard</h1>
        <p class="section-subtitle">Тут зібрані всі заявки до гільдії: шукай за ніком, перевіряй статус і відкривай оригінальну заявку.</p>

        <div class="hero-chip-row">
          <span class="application-chip">Живий список</span>
          <span class="application-chip">Пошук за ніком</span>
          <span class="application-chip">Оригінальні заявки</span>
        </div>
      </div>

      <div class="hero-showcase hero-showcase--applications" aria-label="Зведення по заявках">
        <div class="hero-showcase__frame">
          <div class="hero-showcase__topline">
            <span class="hero-showcase__eyebrow">Статуси заявок</span>
          </div>

          <div class="hero-showcase__tiles hero-showcase__tiles--stats">
            <article class="hero-info-tile hero-info-tile--stat">
              <span class="hero-info-tile__label">Усього</span>
              <strong id="applications-stat-total" class="hero-info-tile__value hero-info-tile__value--stat">—</strong>
              <p class="hero-info-tile__meta">Усі отримані заявки</p>
            </article>
            <article class="hero-info-tile hero-info-tile--stat">
              <span class="hero-info-tile__label">Схвалено</span>
              <strong id="applications-stat-approved" class="hero-info-tile__value hero-info-tile__value--stat">—</strong>
              <p class="hero-info-tile__meta">Завершені заявки</p>
            </article>
            <article class="hero-info-tile hero-info-tile--stat">
              <span class="hero-info-tile__label">На розгляді</span>
              <strong id="applications-stat-open" class="hero-info-tile__value hero-info-tile__value--stat">—</strong>
              <p class="hero-info-tile__meta">Ще відкриті</p>
            </article>
          </div>
        </div>
        <div class="toolbar-links hero-actions">
          <a href="/guild/apply/" class="application-primary-link">Подати заявку</a>
          <a href="/guild/" class="btn-secondary-hero">Гільдія</a>
        </div>
      </div>
    </div>
  </section>
  <section class="application-panel application-panel--directory">
    <div class="application-panel__header application-panel__header--split">
      <div>
        <span class="section-tag">Пошук і фільтр</span>
        <h2>Знайди потрібну заявку за кілька секунд</h2>
         <p>Скористайся пошуком нижче, щоб швидко знайти потрібного персонажа й перевірити поточний статус заявки.</p>
      </div>
      <div class="applications-panel-badges">
        <span class="application-chip">Усі заявки</span>
        <span class="application-chip">Швидкий пошук</span>
      </div>
    </div>

    <div class="applications-filter-shell applications-filter-shell--advanced">
      <label class="applications-search-field" for="applications-search-input">
        <span>Пошук</span>
        <input id="applications-search-input" type="search" placeholder="Нік, реалм або короткий опис" autocomplete="off">
      </label>

      <label class="applications-search-field applications-select-field" for="applications-status-filter">
        <span>Статус</span>
        <select id="applications-status-filter" class="applications-native-select">
          <option value="">Усі статуси</option>
          <option value="pending">На розгляді</option>
          <option value="approved">Прийнято</option>
          <option value="declined">Відхилено</option>
          <option value="closed">Закрито</option>
        </select>
      </label>

      <label class="applications-search-field applications-select-field" for="applications-class-filter">
        <span>Клас</span>
        <select id="applications-class-filter" class="applications-native-select">
          <option value="">Усі класи</option>
          <option value="Warrior">Warrior</option>
          <option value="Paladin">Paladin</option>
          <option value="Hunter">Hunter</option>
          <option value="Rogue">Rogue</option>
          <option value="Priest">Priest</option>
          <option value="Death Knight">Death Knight</option>
          <option value="Shaman">Shaman</option>
          <option value="Mage">Mage</option>
          <option value="Warlock">Warlock</option>
          <option value="Monk">Monk</option>
          <option value="Druid">Druid</option>
          <option value="Demon Hunter">Demon Hunter</option>
          <option value="Evoker">Evoker</option>
        </select>
      </label>

      <label class="applications-search-field applications-select-field" for="applications-sort-filter">
        <span>Сортування</span>
        <select id="applications-sort-filter" class="applications-native-select">
          <option value="newest">Нові спочатку</option>
          <option value="oldest">Старі спочатку</option>
          <option value="status">За статусом</option>
          <option value="class">За класом</option>
        </select>
      </label>

      <div class="applications-filter-actions">
        <button type="button" id="applications-clear-search" class="status-refresh-button status-refresh-button--ghost">Очистити</button>
        <button type="button" id="applications-refresh" class="status-refresh-button">Оновити</button>
      </div>
    </div>

    <div class="applications-directory-summary">
      <p id="applications-directory-counter">Завантажуємо заявки…</p>
    </div>

    <div id="guild-applications-directory-list" class="applications-directory-list applications-directory-list--cards">
      <div class="applications-placeholder">Завантажуємо повний список заявок…</div>
    </div>
  </section>
</div>
