---
layout: default
title: Статистика гільдії
permalink: /guild/
---

<div class="guild-page-container">

  <header class="guild-header">
  <div class="guild-header-glow"></div>

  <div class="header-content">
    <div class="guild-badge">
      <img
        src="/assets/img/guild-logo.png"
        alt="Mistblossom Vanguard logo"
        class="guild-logo"
        loading="lazy"
        decoding="async"
        onerror="this.style.display='none';this.nextElementSibling.style.display='grid';"
      >
      <span class="guild-logo-fallback faction-icon {{ site.data.guild.guild_info.faction | downcase }}">
        {% if site.data.guild.guild_info.faction == 'horde' %}🛡️{% else %}🦁{% endif %}
      </span>
    </div>

    <div class="guild-info">
      <div class="guild-eyebrow">World of Warcraft Guild</div>
      <h1 class="guild-name">{{ site.data.guild.guild_info.name }}</h1>

      <div class="guild-meta">
        <span class="meta-tag">{{ site.data.guild.guild_info.region | upcase }}</span>
        <span class="meta-tag">{{ site.data.guild.guild_info.realm }}</span>
        <span class="meta-tag faction-{{ site.data.guild.guild_info.faction | downcase }}">
          {{ site.data.guild.guild_info.faction | capitalize }}
        </span>
      </div>

      <div class="guild-updated">
        <span class="updated-pill">Оновлено: {{ site.data.guild.metadata.updated_at }}</span>
      </div>
    </div>
  </div>

  <div class="guild-actions">
    <a href="{{ site.data.guild.guild_info.profile_url }}" target="_blank" rel="noopener" class="btn-primary">
      <span>Raider.IO</span>
      <span aria-hidden="true">↗</span>
    </a>
    {% if site.data.socials.discord %}
    <a href="{{ site.data.socials.discord }}" target="_blank" rel="noopener" class="btn-discord">
      <svg class="discord-icon" viewBox="0 0 127.14 96.36" aria-hidden="true">
        <path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.11,77.11,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.89,105.89,0,0,0,126.6,80.22c1.24-23.23-13.26-47.57-18.9-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
      </svg>
      <span>Discord</span>
    </a>
    {% endif %}
  </div>
</header>

  <section class="guild-section">
    <div class="modern-header">
      <div class="header-left">
        <div class="icon-box trophy-glow">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M5 2h14a1 1 0 0 1 1 1v4h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1.25A6.97 6.97 0 0 1 13 18.91V20h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-1.09A6.97 6.97 0 0 1 4.25 15H3a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm13 2H6v9.5c0 2.37 1.8 4.34 4.12 4.88a1 1 0 0 0 .47 0A5 5 0 0 0 18 13.5V4zM4 9v2a1 1 0 0 0 1 1h1V9H4zm16 0h-1v3h1a1 1 0 0 0 1-1V9z"/>
          </svg>
        </div>
        <div class="title-wrapper">
          <h2 class="section-title">Рейдовий Прогрес</h2>
          <span class="subtitle">Статистика та ранги</span>
        </div>
      </div>
      <div class="header-line"></div>
    </div>
    
<div class="raid-grid">
      {% assign has_active_raids = false %}
      
      {% for raid in site.data.guild.raid_progression %}
        {% assign raid_slug = raid[0] %}
        {% assign stats = raid[1] %}
        {% assign rankings = site.data.guild.raid_rankings[raid_slug] %}
        
        {% assign total_kills = stats.normal_bosses_killed | plus: stats.heroic_bosses_killed | plus: stats.mythic_bosses_killed %}
        
        {% if stats.total_bosses > 0 and total_kills > 0 %}
          {% assign has_active_raids = true %}
          <div class="raid-card">
            <div class="raid-card-header">
              <div class="raid-heading">
                <h3 class="raid-title">{{ raid_slug | replace: "-", " " | capitalize }}</h3>
                <span class="raid-subtitle">Актуальний прогрес рейду</span>
              </div>
              <div class="raid-score">{{ stats.summary }}</div>
            </div>

            {% assign world_rank = '-' %}
            {% assign region_rank = '-' %}
            {% assign realm_rank = '-' %}

            {% if rankings.mythic.world and rankings.mythic.world > 0 %}
              {% assign world_rank = rankings.mythic.world %}
            {% elsif rankings.heroic.world and rankings.heroic.world > 0 %}
              {% assign world_rank = rankings.heroic.world %}
            {% elsif rankings.normal.world and rankings.normal.world > 0 %}
              {% assign world_rank = rankings.normal.world %}
            {% endif %}

            {% if rankings.mythic.region and rankings.mythic.region > 0 %}
              {% assign region_rank = rankings.mythic.region %}
            {% elsif rankings.heroic.region and rankings.heroic.region > 0 %}
              {% assign region_rank = rankings.heroic.region %}
            {% elsif rankings.normal.region and rankings.normal.region > 0 %}
              {% assign region_rank = rankings.normal.region %}
            {% endif %}

            {% if rankings.mythic.realm and rankings.mythic.realm > 0 %}
              {% assign realm_rank = rankings.mythic.realm %}
            {% elsif rankings.heroic.realm and rankings.heroic.realm > 0 %}
              {% assign realm_rank = rankings.heroic.realm %}
            {% elsif rankings.normal.realm and rankings.normal.realm > 0 %}
              {% assign realm_rank = rankings.normal.realm %}
            {% endif %}

            <div class="rank-stats">
              <div class="rank-item" title="Світовий ранг">
                <span class="rank-icon">🌍</span>
                <span class="rank-label">Світ</span>
                <span class="rank-val">{% if world_rank == '-' %}-{% else %}#{{ world_rank }}{% endif %}</span>
              </div>
              <div class="rank-item" title="Ранг у регіоні (EU)">
                <span class="rank-icon">🇪🇺</span>
                <span class="rank-label">Європа</span>
                <span class="rank-val">{% if region_rank == '-' %}-{% else %}#{{ region_rank }}{% endif %}</span>
              </div>
              <div class="rank-item" title="Ранг на сервері">
                <span class="rank-icon">🏰</span>
                <span class="rank-label">Сервер</span>
                <span class="rank-val">{% if realm_rank == '-' %}-{% else %}#{{ realm_rank }}{% endif %}</span>
              </div>
            </div>

            <div class="raid-bars">
              <div class="progress-row">
                <span class="diff-badge mythic">M</span>
                <div class="progress-meta">
                  <div class="progress-top">
                    <span class="progress-name">Mythic</span>
                    <span class="boss-count">{{ stats.mythic_bosses_killed }}/{{ stats.total_bosses }}</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill mythic-fill" style="width: {{ stats.mythic_bosses_killed | times: 100 | divided_by: stats.total_bosses }}%;"></div>
                  </div>
                </div>
              </div>
              <div class="progress-row">
                <span class="diff-badge heroic">H</span>
                <div class="progress-meta">
                  <div class="progress-top">
                    <span class="progress-name">Heroic</span>
                    <span class="boss-count">{{ stats.heroic_bosses_killed }}/{{ stats.total_bosses }}</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill heroic-fill" style="width: {{ stats.heroic_bosses_killed | times: 100 | divided_by: stats.total_bosses }}%;"></div>
                  </div>
                </div>
              </div>
              <div class="progress-row">
                <span class="diff-badge normal">N</span>
                <div class="progress-meta">
                  <div class="progress-top">
                    <span class="progress-name">Normal</span>
                    <span class="boss-count">{{ stats.normal_bosses_killed }}/{{ stats.total_bosses }}</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill normal-fill" style="width: {{ stats.normal_bosses_killed | times: 100 | divided_by: stats.total_bosses }}%;"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {% endif %}
      {% endfor %}
      
      {% unless has_active_raids %}
      <div class="raid-card placeholder-card" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border-subtle);">
        <div style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;">💤</div>
        <h3 class="raid-title" style="color: var(--text-grey); margin-bottom: 5px;">Немає активних рейдів</h3>
        <p style="color: var(--text-grey); font-size: 0.9rem; margin: 0; opacity: 0.7;">Гільдія ще не має прогресу в поточному контенті.</p>
      </div>
      {% endunless %}
      
    </div>
  </section>

  <section class="guild-section guild-stats-section">
    <div class="modern-header">
      <div class="header-left">
        <div class="icon-box chart-glow">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M11 2a1 1 0 0 1 1 1v8h8a1 1 0 0 1 1 1 10 10 0 1 1-10-10zm1 18a8 8 0 0 0 7.94-7H11a1 1 0 0 1-1-1V4.06A8 8 0 1 0 12 20zm3.29-18A8 8 0 0 1 22 8.71 1 1 0 0 1 21 10h-5.71a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
          </svg>
        </div>
        <div class="title-wrapper">
          <h2 class="section-title">Статистика складу</h2>
          <span class="subtitle">Фракції, броня та спеки</span>
        </div>
      </div>

      <div class="stat-badge stats-live-badge">
        <span class="stat-val" id="stats-total-members">{{ site.data.guild.members | size }}</span>
        <span class="stat-label">у складі</span>
      </div>
    </div>

    <div class="guild-stats-layout">
      <article class="stats-card donut-card">
        <div class="stats-card-top">
          <div>
            <h3 class="stats-card-title">Фракції</h3>
            <p class="stats-card-subtitle">Хто грає за Альянс, а хто за Орду</p>
          </div>
        </div>

        <div class="donut-layout">
          <div class="donut-visual" id="faction-chart" aria-label="Співвідношення фракцій">
            <div class="donut-hole">
              <span class="donut-value" id="faction-total">0</span>
              <span class="donut-caption">гравців</span>
            </div>
          </div>

          <div class="stats-legend" id="faction-legend"></div>
        </div>
      </article>

      <article class="stats-card donut-card">
        <div class="stats-card-top">
          <div>
            <h3 class="stats-card-title">Тип броні</h3>
            <p class="stats-card-subtitle">Яку броню носять гравці гільдії</p>
          </div>
        </div>

        <div class="donut-layout">
          <div class="donut-visual" id="armor-chart" aria-label="Розподіл за типом броні">
            <div class="donut-hole">
              <span class="donut-value" id="armor-total">0</span>
              <span class="donut-caption">гравців</span>
            </div>
          </div>

          <div class="stats-legend" id="armor-legend"></div>
        </div>
      </article>

      <article class="stats-card spec-card">
        <div class="stats-card-top stats-card-top-wide">
          <div>
            <h3 class="stats-card-title">Класи та спеки</h3>
            <p class="stats-card-subtitle">Кожен клас показаний окремо, а деталі по спеках — у підказці</p>
          </div>

          <div class="spec-role-summary" id="spec-role-summary"></div>
        </div>

        <div class="spec-chart-wrap">
          <div class="spec-chart" id="spec-chart" aria-label="Графік популярності класів"></div>
        </div>

        <div class="spec-chart-footnote" id="spec-footnote"></div>
      </article>
    </div>

    <script id="guild-members-json" type="application/json">{{ site.data.guild.members | jsonify }}</script>
    <script src="/assets/js/guild-stats.js" defer></script>
  </section>

  <section class="guild-section">
    <div class="modern-header">
      <div class="header-left">
        <div class="icon-box sword-glow">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M14.75 22.14a1 1 0 0 1-1.37.36l-2.09-1.2a1.05 1.05 0 0 1-.41-.48l-.89-2.52a5.53 5.53 0 0 1-.09-.76l-3.32-6.57a3.11 3.11 0 0 1 .46-3.05l1.64-2.1a1 1 0 0 1 1.34-.17 1 1 0 0 1 .2.17l1.79 1.8a1.11 1.11 0 0 0 .54.28h.06l3.32.32a6.45 6.45 0 0 1 5.3 3.66 1 1 0 0 1-.29 1.19L14.75 19v3.14zM8.59 7l3.65 7.23.46 1.3 1.25.72 4.84-4.84a4.46 4.46 0 0 0-3.36-2.19l-3.33-.31-2-2L8.59 7z"/><path d="M7.74 13.29A1 1 0 0 1 7 13a1 1 0 0 1 0-1.41l3.54-3.54a1 1 0 0 1 1.41 1.41L8.45 13a1 1 0 0 1-.71.29zM5.71 18.66l-1.92 3.2a1 1 0 0 1-1.37.37 1 1 0 0 1-.36-1.37l3.2-5.32a1 1 0 0 1 1.82 1l-1.37 2.12z"/>
          </svg>
        </div>
        <div class="title-wrapper">
          <h2 class="section-title">Герої Гільдії</h2>
          <span class="subtitle">Активний склад</span>
        </div>
      </div>
      
      <div class="stat-badge">
        <span class="stat-val">{{ site.data.guild.members | size }}</span>
        <span class="stat-label">Member{% if site.data.guild.members.size != 1 %}s{% endif %}</span>
      </div>
    </div>

    {% assign tanks = site.data.guild.members | where: "role", "TANK" %}
    {% assign healers = site.data.guild.members | where: "role", "HEALING" %}
    {% assign dps = site.data.guild.members | where: "role", "DPS" %}
    {% assign others = site.data.guild.members | where: "role", nil %}

    <div class="roster-layout">
      
      {% if tanks.size > 0 %}
      <div class="role-column">
        <div class="role-header tank-header">
          <span class="role-icon">🛡️</span> Танки
        </div>
        <div class="member-grid">
          {% for char in tanks %}
            {% include member-card.html char=char %}
          {% endfor %}
        </div>
      </div>
      {% endif %}

      {% if healers.size > 0 %}
      <div class="role-column">
        <div class="role-header heal-header">
          <span class="role-icon">💚</span> Цілителі
        </div>
        <div class="member-grid">
          {% for char in healers %}
            {% include member-card.html char=char %}
          {% endfor %}
        </div>
      </div>
      {% endif %}

      {% if dps.size > 0 %}
      <div class="role-column">
        <div class="role-header dps-header">
          <span class="role-icon">⚔️</span> Бійці
        </div>
        <div class="member-grid">
          {% for char in dps %}
            {% include member-card.html char=char %}
          {% endfor %}
        </div>
      </div>
      {% endif %}

      {% if others.size > 0 %}
      <div class="role-column">
        <div class="role-header other-header">
          <span class="role-icon">❔</span> Невзначились
        </div>
        <div class="member-grid">
          {% for char in others %}
            {% include member-card.html char=char %}
          {% endfor %}
        </div>
      </div>
      {% endif %}

    </div>
  </section>
</div>