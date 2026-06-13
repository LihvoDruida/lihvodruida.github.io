---
layout: default
title: Головна
permalink: /
description: "Лігво Себаса — україномовний WoW-хаб із гайдами, новинами, адонами, персонажами та сторінкою гільдії Mistblossom Vanguard."
image: /assets/img/og-image-default.webp
tags: [World of Warcraft, WoW, Raider.IO, гільдія, адони, гайди]
keywords: [Лігво Себаса, World of Warcraft, WoW, Raider.IO, гільдія, гайди, адони, Mythic+, рейди]
extra_css:
  - /assets/css/news.css
---

<section id="profile" class="ui-blocks">
{% include community.html %}
{% include support_project.html %}
</section>

{% include characters.html %}

<section id="News" class="area section home-materials-section">
  <div class="area-content news-area">
    {% assign latest_content = site.news | concat: site.guides | sort: "date" | reverse %}
    {% assign latest_featured = latest_content.first %}
    {% assign home_feed_limit = 4 %}

    <div class="section-header section-header--split">
      <div>
        <span class="section-tag">Свіжі публікації</span>
        <h1>Останні матеріали</h1>
        <p class="section-subtitle">Останні новини та гайди зібрані в одному місці, щоб найважливіше було під рукою.</p>
      </div>

      <div class="header-actions">
        <a href="{{ '/news/' | relative_url }}" class="btn-secondary-hero">Всі новини</a>
        <a href="{{ '/guides/' | relative_url }}" class="btn-primary-hero">Всі гайди <span class="arrow">→</span></a>
      </div>
    </div>

    {% if latest_content.size == 0 %}
      <div class="empty-state-wow home-empty-state">
        <div class="empty-icon-glow">
          <svg viewBox="0 0 24 24" class="scroll-icon">
            <path fill="currentColor" d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3M14,17H7V15H14V17M17,13H7V11H17V13M17,9H7V7H17V9Z" />
          </svg>
        </div>
        <h2>Матеріали ще готуються</h2>
        <p>Щойно з’являться нові матеріали, тут одразу буде видно найсвіжіші новини та гайди.</p>
      </div>
    {% else %}
      {% if latest_featured %}
      <a href="{{ latest_featured.url | relative_url }}" class="featured-article featured-article--home">
        <div class="featured-image">
          <img src="{{ latest_featured.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ latest_featured.title }}" loading="eager" decoding="async" fetchpriority="high">
        </div>
        <div class="featured-content">
          <div class="featured-meta">
            <span class="category-badge category-badge--{{ latest_featured.collection | default: 'news' }}">
              {% if latest_featured.collection == 'guides' %}Гайд{% else %}Новина{% endif %}
            </span>
            <span class="date">{% include date-uk.html date=latest_featured.date %}</span>
          </div>
          <h2>{{ latest_featured.title }}</h2>
          <p>{{ latest_featured.description | default: latest_featured.excerpt | strip_html | truncate: 170 }}</p>
          <span class="read-more">
            {% if latest_featured.collection == 'guides' %}Відкрити гайд{% else %}Читати новину{% endif %}
            <span class="arrow">→</span>
          </span>
        </div>
      </a>
      {% endif %}

      <div class="news-grid mixed-feed-grid">
        {% for post in latest_content offset:1 limit:home_feed_limit %}
          <a href="{{ post.url | relative_url }}" class="visual-news-card mixed-feed-card mixed-feed-card--{{ post.collection | default: 'news' }}">
            <div class="card-media">
              <img class="media-img" src="{{ post.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ post.title }}" loading="lazy" decoding="async">
              <div class="card-badge card-badge--{{ post.collection | default: 'news' }}">
                {% if post.collection == 'guides' %}Гайд{% else %}Новина{% endif %}
              </div>
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
</section>
