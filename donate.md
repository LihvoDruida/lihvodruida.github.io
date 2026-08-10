---
layout: default
title: Підтримати проєкт
permalink: /donate/
description: "Сторінка підтримки Лігва Себаса: Monobank, Donatello та інші способи допомогти розвитку сайту, стрімів і нового контенту."
image: /assets/img/og-image-default.webp
tags: [підтримка, донат, Monobank, Donatello, стріми, контент]
extra_css:
  - /assets/css/donate.css
extra_js:
  - /assets/js/donatello.js
---

<script>
  window.LD_DONATELLO_CONFIG = {
    workerUrl: "{{ site.donatello_worker_url | default: '' }}",
    donateUrl: "https://donatello.to/lihvo_druida",
    limit: 12,
    refreshMs: 180000
  };
</script>

<section class="donate-section">
  <header class="donate-header">
    <span class="donate-eyebrow">Підтримка</span>
    <h1>Підтримати проєкт</h1>
    <p>Донати допомагають розвивати сайт, стріми, гайди, адони та інструменти для української WoW-спільноти.</p>
  </header>

  {% include donate-terms.html section="notice" %}

  <h2 class="donate-subtitle">Оберіть спосіб підтримки</h2>

  <div class="methods-grid">
    <a href="https://send.monobank.ua/jar/36G5vBXMkK" rel="noopener noreferrer" target="_blank" class="card method-card featured">
      <div class="featured-badge">★ Рекомендовано</div>
      <div>
        <div class="method-icon"><img src="{{ '/assets/img/monobank-logo.webp' | relative_url }}" alt="Monobank" loading="lazy" decoding="async"></div>
        <h3>Monobank</h3>
        <p>Миттєва підтримка карткою українського банку.</p>
      </div>
      <div class="method-features">
        <span>Швидко</span>
        <span>Безпечно</span>
        <span>Україна</span>
      </div>
    </a>

    <a href="https://donatello.to/lihvo_druida" rel="noopener noreferrer" target="_blank" class="card method-card">
      <div>
        <div class="method-icon"><img src="{{ '/assets/img/donatello-logo.webp' | relative_url }}" alt="Donatello" loading="lazy" decoding="async"></div>
        <h3>Donatello</h3>
        <p>Донати з повідомленням для стріму та публічною історією підтримки після підключення Worker.</p>
      </div>
      <div class="method-features">
        <span>Повідомлення</span>
        <span>Анонімно</span>
        <span>Стрім</span>
      </div>
    </a>
  </div>

  <div class="credits-info">
    <h4>Дякую за підтримку!</h4>
    <p>
      Кожен донат допомагає покращувати трансляції, купувати обладнання та створювати більше матеріалів для спільноти.
      Повідомлення з Donatello можна виводити на стрімі, а історію підтримки — показувати на цій сторінці через Worker.
    </p>
  </div>

  <section class="donatello-live-card" aria-labelledby="donatello-live-title">
    <div class="donatello-live-header">
      <div>
        <h2 id="donatello-live-title">Останні підтримки Donatello</h2>
        <p>Блок автоматично читає дані з Cloudflare Worker, якщо URL вказано в <code>_config.yml</code>.</p>
      </div>
      <span id="donatello-status" class="donatello-status" data-tone="loading">Підготовка…</span>
    </div>

    <div class="donatello-stats" aria-label="Статистика підтримки">
      <div class="donatello-stat">
        <span>Сума</span>
        <strong id="total-amount">—</strong>
      </div>
      <div class="donatello-stat">
        <span>Донатів</span>
        <strong id="total-count">—</strong>
      </div>
    </div>

    <div id="patrons-grid" class="patrons-grid">
      <div class="donatello-loading">
        <strong>Завантаження історії…</strong>
        <span>Якщо Worker не налаштовано, тут буде показано безпечний fallback.</span>
      </div>
    </div>
  </section>

  {% include donate-terms.html section="full" %}
</section>
