---
layout: default
title: Головна
permalink: /
description: "Лігво Себаса — україномовний WoW-хаб із гайдами, новинами, адонами, персонажами та сторінкою гільдії Mistblossom Vanguard."
image: /assets/img/og-image-default.webp
tags: [World of Warcraft, WoW, Raider.IO, гільдія, адони, гайди]
keywords: [Лігво Себаса, World of Warcraft, WoW, Raider.IO, гільдія, гайди, адони, Mythic+, рейди]
---

<section id="profile" class="ui-blocks">
{% include community.html %}
{% include support_project.html %}
</section>

{% include characters.html %}

<section id="News" class="area section">

  <div class="area-content news-area">

    <div class="section-header">
      <span class="section-tag">Будь в курсі</span>
      <h1>Останні новини</h1>
    </div>

    {% assign all_news = site.news | sort: "date" | reverse %}
    <div class="news-grid">

      {% for post in all_news limit: 3 %}
      <a href="{{ post.url | relative_url }}" class="news-card">

        <time class="news-date" datetime="{{ post.date | date_to_xmlschema }}">
          {% include date-uk.html date=post.date %}
        </time>

        <h3>{{ post.title }}</h3>

        {% if post.description %}
        <p>
          {{ post.description | strip_html | truncate: 140 }}
        </p>
        {% endif %}

        <span class="read-more">
          Читати все <span class="arrow">→</span>
        </span>

      </a>
      {% endfor %}

    </div>

    <div class="news-actions">
      <a href="{{ "/news/" | relative_url }}" class="btn-primary-hero">
        Всі новини <span class="arrow">→</span>
      </a>
    </div>

  </div>
</section>
