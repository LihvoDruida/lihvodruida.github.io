---
layout: default
title: Гайди та інструкції по WoW
permalink: /guides/
description: "Корисні гайди по World of Warcraft: рейди, Mythic+, професії, Android/Winlator, налаштування та практичні поради українською."
image: /assets/img/og-image-default.webp
tags: [World of Warcraft, WoW, гайди, Mythic+, рейди, професії]
extra_css:
  - /assets/css/news.css
---

{% assign guides_list = site.guides | sort: 'date' | reverse %}
{% assign latest_guide = guides_list.first %}

<div class="area-content listing-page listing-page--guides">
  <section class="page-hero page-hero--guides">
    <div class="page-hero-grid">
      <div class="page-hero-copy">
        <span class="section-tag">База знань</span>
        <h1>Гайди та інструкції</h1>
        <p class="section-subtitle">Практичні матеріали по рейдах, Mythic+, професіях, Android/Winlator і всьому, що має допомагати, а не просто займати місце.</p>
      </div>

      <div class="page-hero-stats" aria-label="Зведення по розділу гайдів">
        <div class="hero-stat">
          <span class="hero-stat__label">Гайдів</span>
          <strong class="hero-stat__value">{{ guides_list.size }}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat__label">Останнє оновлення</span>
          <strong class="hero-stat__value hero-stat__value--small">
            {% if latest_guide %}{% include date-uk.html date=latest_guide.date %}{% else %}Немає{% endif %}
          </strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat__label">Швидкий перехід</span>
          <a class="hero-stat__link" href="{{ '/news/' | relative_url }}">До новин →</a>
        </div>
      </div>
    </div>
  </section>

  {% if guides_list.size == 0 %}
    <div class="empty-state-wow empty-state-wow--listing">
      <div class="empty-icon-glow">
        <svg viewBox="0 0 24 24" class="scroll-icon">
          <path fill="currentColor" d="M19,1L14,6V17L19,12V1M21,5V18.5C19.9,18.15 18.7,18 17.5,18C15.8,18 13.35,18.65 12,19.5V6C13.35,5.15 15.8,4.5 17.5,4.5C18.7,4.5 19.9,4.65 21,5M10,19.5V6C8.65,5.15 6.2,4.5 4.5,4.5C3.3,4.5 2.1,4.65 1,5V18.5C2.1,18.15 3.3,18 4.5,18C6.2,18 8.65,18.65 10,19.5Z" />
        </svg>
      </div>
      <h2>Гайди ще не опубліковані</h2>
      <p>Тут з’являться корисні гайди, щойно ми підготуємо перші матеріали.</p>
      <div class="empty-action">
        <span class="wow-tip">Поки що можна перевірити <a href="{{ '/news/' | relative_url }}">новини</a> або <a href="{{ '/guild/' | relative_url }}">сторінку гільдії</a>.</span>
      </div>
    </div>
  {% else %}
    <div class="content-toolbar">
      <div>
        <h2 class="toolbar-title">Свіжі гайди</h2>
        <p class="toolbar-copy">Угорі — найсвіжіший гайд, нижче — інші корисні матеріали, щоб було легко вибрати потрібне.</p>
      </div>
      <div class="toolbar-links">
        <a href="{{ '/news/' | relative_url }}" class="btn-secondary-hero">Новини</a>
        <a href="{{ '/mods/' | relative_url }}" class="btn-secondary-hero">Моди</a>
      </div>
    </div>

    {% assign featured = guides_list.first %}
    {% if featured %}
    <a href="{{ featured.url | relative_url }}" class="featured-article featured-article--guides">
      <div class="featured-image">
        <img src="{{ featured.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ featured.title }}" loading="eager" decoding="async" fetchpriority="high">
      </div>
      <div class="featured-content">
        <div class="featured-meta">
          <span class="category-badge category-badge--guides">{{ featured.categories | last | default: 'Гайд' }}</span>
          <span class="date">{% include date-uk.html date=featured.date %}</span>
        </div>
        <h2>{{ featured.title }}</h2>
        <p>{{ featured.description | default: featured.excerpt | strip_html | truncate: 170 }}</p>
        <span class="read-more">Читати гайд <svg style="width:16px;height:16px;margin-left:4px;" viewBox="0 0 24 24"><path fill="currentColor" d="M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z" /></svg></span>
      </div>
    </a>
    {% endif %}

    <div class="news-grid collection-grid">
      {% for post in guides_list offset:1 %}
        <a href="{{ post.url | relative_url }}" class="visual-news-card visual-news-card--guide">
          <div class="card-media">
            <img class="media-img" src="{{ post.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ post.title }}" loading="lazy" decoding="async">
            <div class="card-badge card-badge--guides">{{ post.categories | last | default: 'Гайд' }}</div>
          </div>
          <div class="card-info">
            <div class="news-date">{% include date-uk.html date=post.date %}</div>
            <h3 class="card-title">{{ post.title }}</h3>
            <p class="card-desc">{{ post.description | default: post.excerpt | strip_html | truncate: 110 }}</p>
          </div>
        </a>
      {% endfor %}
    </div>
  {% endif %}
</div>
