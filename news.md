---
layout: default
title: Новини World of Warcraft і спільноти
permalink: /news/
description: "Останні новини по World of Warcraft, гільдії Mistblossom Vanguard, оновлення сайту та важливі події спільноти."
image: /assets/img/og-image-default.webp
tags: [World of Warcraft, WoW, новини, гільдія, Mistblossom Vanguard, оновлення]
extra_css:
  - /assets/css/news.css
---

{% assign news_list = site.news | sort: 'date' | reverse %}
{% assign latest_news = news_list.first %}

<div class="area-content listing-page listing-page--news">
  <section class="page-hero page-hero--news">
    <div class="page-hero-grid">
      <div class="page-hero-copy">
        <span class="section-tag">Оновлення та події</span>
        <h1>Стрічка новин</h1>
        <p class="section-subtitle">Оперативні новини по WoW, рейдах, гільдії Mistblossom Vanguard і всьому важливому, що впливає на гру та сайт.</p>
      </div>

      <div class="page-hero-stats" aria-label="Зведення по розділу новин">
        <div class="hero-stat">
          <span class="hero-stat__label">Публікацій</span>
          <strong class="hero-stat__value">{{ news_list.size }}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat__label">Остання новина</span>
          <strong class="hero-stat__value hero-stat__value--small">
            {% if latest_news %}{% include date-uk.html date=latest_news.date %}{% else %}Немає{% endif %}
          </strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat__label">Швидкий перехід</span>
          <a class="hero-stat__link" href="{{ '/guides/' | relative_url }}">До гайдів →</a>
        </div>
      </div>
    </div>
  </section>

  {% if news_list.size == 0 %}
    <div class="empty-state-wow empty-state-wow--listing">
      <div class="empty-icon-glow">
        <svg viewBox="0 0 24 24" class="scroll-icon">
          <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M8,12V14H16V12H8M8,16V18H13V16H8Z" />
        </svg>
      </div>
      <h2>Новин поки що немає</h2>
      <p>Тут з’являться всі важливі новини, щойно ми опублікуємо перший матеріал.</p>
      <div class="empty-action">
        <span class="wow-tip">Поки що можна перейти до <a href="{{ '/guides/' | relative_url }}">гайдів</a> або на <a href="{{ '/guild/' | relative_url }}">сторінку гільдії</a>.</span>
      </div>
    </div>
  {% else %}
    <div class="content-toolbar">
      <div>
        <h2 class="toolbar-title">Свіжі новини</h2>
        <p class="toolbar-copy">Угорі — найсвіжіша новина, нижче — ще кілька останніх публікацій.</p>
      </div>
      <div class="toolbar-links">
        <a href="{{ '/guides/' | relative_url }}" class="btn-secondary-hero">Гайди</a>
        <a href="{{ '/guild/' | relative_url }}" class="btn-secondary-hero">Гільдія</a>
      </div>
    </div>

    {% assign featured = news_list.first %}
    {% if featured %}
    <a href="{{ featured.url | relative_url }}" class="featured-article">
      <div class="featured-image">
        <img src="{{ featured.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ featured.title }}" loading="eager" decoding="async" fetchpriority="high">
      </div>
      <div class="featured-content">
        <div class="featured-meta">
          <span class="category-badge category-badge--news">{{ featured.categories | last | default: 'Новина' }}</span>
          <span class="date">{% include date-uk.html date=featured.date %}</span>
        </div>
        <h2>{{ featured.title }}</h2>
        <p>{{ featured.description | default: featured.excerpt | strip_html | truncate: 170 }}</p>
        <span class="read-more">Читати далі <svg style="width:16px;height:16px;margin-left:4px;" viewBox="0 0 24 24"><path fill="currentColor" d="M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z" /></svg></span>
      </div>
    </a>
    {% endif %}

    <div class="news-grid collection-grid">
      {% for post in news_list offset:1 %}
        <a href="{{ post.url | relative_url }}" class="visual-news-card">
          <div class="card-media">
            <img class="media-img" src="{{ post.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ post.title }}" loading="lazy" decoding="async">
            <div class="card-badge card-badge--news">{{ post.categories | last | default: 'Новина' }}</div>
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
