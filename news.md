---
layout: default
title: Новини World of Warcraft і спільноти
permalink: /news/
description: "Останні новини по World of Warcraft, гільдії Mistblossom Vanguard, оновлення сайту та важливі події спільноти."
image: /assets/img/og-image-default.webp
tags: [World of Warcraft, WoW, новини, гільдія, Mistblossom Vanguard, оновлення]
---

<div class="area-content">
  
  <div class="section-header">
    <span class="section-tag">Оновлення та події</span>
  </div>

  {% assign news_list = site.news | sort: 'date' | reverse %}

  {% if news_list.size == 0 %}

    <div class="empty-state-wow">
        <div class="empty-icon-glow">
            <svg viewBox="0 0 24 24" class="scroll-icon">
                <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M8,12V14H16V12H8M8,16V18H13V16H8Z" />
            </svg>
        </div>
        
        <h2>Новин поки що немає</h2>
        
        <p>
            Стрічка новин ще не наповнена або нові матеріали зараз готуються до публікації.
            Це нормальний порожній стан, а не помилка збірки сайту.
        </p>
        
        <div class="empty-action">
            <span class="wow-tip">Поки що можна перейти до <a href="{{ '/guides/' | relative_url }}">гайдів</a> або на <a href="{{ '/guild/' | relative_url }}">сторінку гільдії</a>.</span>
        </div>
    </div>

  {% else %}

    {% assign featured = news_list.first %}

    {% if featured %}
    <a href="{{ featured.url | relative_url }}" class="featured-article">
      
      <div class="featured-image">
        <img src="{{ featured.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ featured.title }}" loading="eager" decoding="async" fetchpriority="high">
      </div>
      
      <div class="featured-content">
        <div class="featured-meta">
          <span class="category-badge">
            {{ featured.categories | last | default: "Новини" }}
          </span>
          <span class="date">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:middle;opacity:0.7" viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V8H19M19 3H18V1H16V3H8V1H6V3H5C3.89 3 3 3.9 3 5V19A2 2 0 0 0 5 21H19A2 2 0 0 0 21 19V5A2 2 0 0 0 19 3M17 12H12V17H17V12Z" /></svg>
            {% include date-uk.html date=featured.date %}
          </span>
        </div>

        <h2>{{ featured.title }}</h2>
        <p>{{ featured.description | default: featured.excerpt | strip_html | truncate: 150 }}</p>

        <span class="read-more">
          Читати далі
          <svg style="width:16px;height:16px;margin-left:4px;" viewBox="0 0 24 24">
              <path fill="currentColor" d="M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z" />
          </svg>
        </span>
      </div>
    </a>
    {% endif %}

    <div class="news-grid">
      {% for post in news_list offset:1 %}
        <a href="{{ post.url | relative_url }}" class="visual-news-card">
          <div class="card-media">
            <img class="media-img" src="{{ post.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ post.title }}" loading="lazy" decoding="async">
            <div class="card-badge">
              {{ post.categories | last | default: "Новини" }}
            </div>
          </div>
          <div class="card-info">
            <div class="news-date">
                <svg style="width:12px;height:12px;margin-right:3px;vertical-align:-1px;" viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V8H19M19 3H18V1H16V3H8V1H6V3H5C3.89 3 3 3.9 3 5V19A2 2 0 0 0 5 21H19A2 2 0 0 0 21 19V5A2 2 0 0 0 19 3M17 12H12V17H17V12Z" /></svg>
                {% include date-uk.html date=post.date %}
            </div>
            <h3 class="card-title">{{ post.title }}</h3>
            <p class="card-desc">{{ post.description | default: post.excerpt | strip_html | truncate: 90 }}</p>
          </div>
        </a>
      {% endfor %}
    </div>

  {% endif %}

</div>