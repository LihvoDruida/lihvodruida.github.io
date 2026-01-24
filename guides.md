---
layout: default
title: Гайди та Інструкції
permalink: /guides/
---

<div class="area-content">
  
  <div class="section-header">
    <span class="section-tag">База знань</span>
    <h1>Корисна всячина</h1>
  </div>

  {% assign guides_list = site.guides | sort: 'date' | reverse %}
  {% assign featured = guides_list.first %}

  {% if featured %}
  <a href="{{ featured.url }}" class="featured-article">
    
    <div class="featured-image">
      <img src="{{ featured.image | default: '/assets/img/news-placeholder.jpg' }}" alt="{{ featured.title }}">
    </div>
    
    <div class="featured-content">
      <div class="featured-meta">
        <span class="category-badge">
          {% if featured.categories[1] %}
            {{ featured.categories[1] }}
          {% else %}
            {{ featured.categories[0] }}
          {% endif %}
        </span>
        <span class="date">{{ featured.date | date: "%d %b. %Y" }}</span>
      </div>

      <h2>{{ featured.title }}</h2>
      <p>{{ featured.content | strip_html | truncatewords: 25 }}</p>

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
      <a href="{{ post.url }}" class="visual-news-card">
        
        <div class="card-media">
          <div class="media-img" style="background-image: url('{{ post.image | default: '/assets/img/news-placeholder.jpg' }}');"></div>
          <div class="news-badge card-badge">
            {% if post.categories[1] %}
              {{ post.categories[1] }}
            {% else %}
              {{ post.categories[0] }}
            {% endif %}
          </div>
        </div>

        <div class="card-info">
          <div class="news-date">{{ post.date | date: "%d.%m.%Y" }}</div>
          <h3 class="card-title">{{ post.title }}</h3>
          <p class="card-desc">{{ post.content | strip_html | truncatewords: 12 }}</p>
        </div>
      </a>
    {% endfor %}
  </div>

</div>