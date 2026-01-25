---
layout: default
title: Статистика гільдії
permalink: /guild/
---

<div class="guild-page-container">

  <header class="guild-header">
    <div class="header-content">
      <div class="guild-badge">
        <span class="faction-icon {{ site.data.guild.faction | downcase }}">
            {% if site.data.guild.faction == 'horde' %}🛡️{% else %}🦁{% endif %}
        </span>
      </div>
      <div class="guild-info">
        <h1 class="guild-name">{{ site.data.guild.name }}</h1>
        <div class="guild-meta">
          <span class="meta-tag">{{ site.data.guild.region | upcase }}</span>
          <span class="meta-separator">/</span>
          <span class="meta-tag">{{ site.data.guild.realm }}</span>
          <span class="meta-separator">/</span>
          <span class="meta-tag faction-{{ site.data.guild.faction | downcase }}">
            {{ site.data.guild.faction | capitalize }}
          </span>
        </div>
      </div>
    </div>
    <div class="guild-actions">
      <a href="{{ site.data.guild.profile_url }}" target="_blank" class="btn-primary">
        Raider.IO <span>↗</span>
      </a>
      <a href="{{ site.data.guild.discord_url | default: '#' }}" target="_blank" class="btn-discord">
        <svg class="discord-icon" viewBox="0 0 127.14 96.36" width="20" height="15">
          <path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.11,77.11,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.89,105.89,0,0,0,126.6,80.22c1.24-23.23-13.26-47.57-18.9-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
        </svg>
        Discord
      </a>
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
      {% for raid in site.data.guild.raid_progression %}
        {% assign raid_slug = raid[0] %}
        {% assign stats = raid[1] %}
        {% assign rankings = site.data.guild.raid_rankings[raid_slug] %}
        
        {% if stats.total_bosses > 0 %}
        <div class="raid-card">
          <div class="raid-card-header">
            <h3 class="raid-title">{{ raid_slug | replace: "-", " " | capitalize }}</h3>
            <div class="raid-score">{{ stats.summary }}</div>
          </div>

          <div class="rank-stats">
            <div class="rank-item" title="Світовий ранг">
              <span class="rank-icon">🌍</span>
              <span class="rank-val">#{{ rankings.mythic.world | default: rankings.heroic.world | default: '-' }}</span>
            </div>
            <div class="rank-item" title="Ранг у регіоні (EU)">
              <span class="rank-icon">🇪🇺</span>
              <span class="rank-val">#{{ rankings.mythic.region | default: rankings.heroic.region | default: '-' }}</span>
            </div>
            <div class="rank-item" title="Ранг на сервері">
              <span class="rank-icon">🏰</span>
              <span class="rank-val">#{{ rankings.mythic.realm | default: rankings.heroic.realm | default: '-' }}</span>
            </div>
          </div>

          <div class="raid-bars">
            <div class="progress-row">
              <span class="diff-badge mythic">M</span>
              <div class="progress-track">
                <div class="progress-fill mythic-fill" style="width: {{ stats.mythic_bosses_killed | times: 100 | divided_by: stats.total_bosses }}%;"></div>
              </div>
              <span class="boss-count">{{ stats.mythic_bosses_killed }}/{{ stats.total_bosses }}</span>
            </div>
            <div class="progress-row">
              <span class="diff-badge heroic">H</span>
              <div class="progress-track">
                <div class="progress-fill heroic-fill" style="width: {{ stats.heroic_bosses_killed | times: 100 | divided_by: stats.total_bosses }}%;"></div>
              </div>
              <span class="boss-count">{{ stats.heroic_bosses_killed }}/{{ stats.total_bosses }}</span>
            </div>
            <div class="progress-row">
              <span class="diff-badge normal">N</span>
              <div class="progress-track">
                <div class="progress-fill normal-fill" style="width: {{ stats.normal_bosses_killed | times: 100 | divided_by: stats.total_bosses }}%;"></div>
              </div>
              <span class="boss-count">{{ stats.normal_bosses_killed }}/{{ stats.total_bosses }}</span>
            </div>
          </div>
        </div>
        {% endif %}
      {% endfor %}
    </div>
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

    </div>
  </section>
</div>