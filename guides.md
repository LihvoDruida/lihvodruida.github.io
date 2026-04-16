---
layout: default
title: Гайди та Інструкції
permalink: /guides/
description: "Корисні гайди, налаштування та інструкції для World of Warcraft 3.3.5a"
image: /assets/img/og-image-default.webp
---

<div class="area-content">
  
  <div class="section-header">
    <span class="section-tag">База знань</span>
    <p class="section-subtitle">Оптимізація, аддони та секрети гри</p>
  </div>

  {% assign guides_list = site.guides | sort: 'date' | reverse %}

  {% if guides_list.size == 0 %}

    <div class="empty-state-wow">
        <div class="empty-icon-glow">
            <svg viewBox="0 0 24 24" class="scroll-icon">
                <path fill="currentColor" d="M19,1L14,6V17L19,12V1M21,5V18.5C19.9,18.15 18.7,18 17.5,18C15.8,18 13.35,18.65 12,19.5V6C13.35,5.15 15.8,4.5 17.5,4.5C18.7,4.5 19.9,4.65 21,5M10,19.5V6C8.65,5.15 6.2,4.5 4.5,4.5C3.3,4.5 2.1,4.65 1,5V18.5C2.1,18.15 3.3,18 4.5,18C6.2,18 8.65,18.65 10,19.5Z" />
            </svg>
        </div>
        
        <h2>Бібліотека порожня...</h2>
        
        <p>
            Схоже, архіваріуси Даларана ще не переписали стародавні сувої. 
            Книжкові полиці поки що припадають пилом.
        </p>
        
        <div class="empty-action">
            <span class="wow-tip">Поки чекаєте, перегляньте <a href="{{ '/news/' | relative_url }}">Стрічку новин</a>.</span>
        </div>
    </div>

  {% else %}

    {% assign featured = guides_list.first %}

    {% if featured %}
    <a href="{{ featured.url | relative_url }}" class="featured-article">
      
      <div class="featured-image">
        <img src="{{ featured.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ featured.title }}" loading="eager" decoding="async" fetchpriority="high">
      </div>
      
      <div class="featured-content">
        <div class="featured-meta">
          <span class="category-badge">
            {{ featured.categories | last | default: "Гайд" }}
          </span>
          <span class="date">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:middle;opacity:0.7" viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V8H19M19 3H18V1H16V3H8V1H6V3H5C3.89 3 3 3.9 3 5V19A2 2 0 0 0 5 21H19A2 2 0 0 0 21 19V5A2 2 0 0 0 19 3M17 12H12V17H17V12Z" /></svg>
            {% include date-uk.html date=featured.date %}
          </span>
        </div>

        <h2>{{ featured.title }}</h2>
        <p>{{ featured.description | default: featured.excerpt | strip_html | truncate: 150 }}</p>

        <span class="read-more">
          Читати гайд
          <svg style="width:16px;height:16px;margin-left:4px;" viewBox="0 0 24 24">
              <path fill="currentColor" d="M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z" />
          </svg>
        </span>
      </div>
    </a>
    {% endif %}

    <div class="news-grid">
      {% for post in guides_list offset:1 %}
        <a href="{{ post.url | relative_url }}" class="visual-news-card">
          
          <div class="card-media">
            <img class="media-img" src="{{ post.image | default: '/assets/img/news-placeholder.webp' }}" alt="{{ post.title }}" loading="lazy" decoding="async">
            <div class="card-badge">
              {{ post.categories | last | default: "Гайд" }}
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