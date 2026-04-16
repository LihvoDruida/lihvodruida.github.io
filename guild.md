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
        src="{{ '/assets/img/guild-logo.webp' | relative_url }}"
        alt="Mistblossom Vanguard logo"
        class="guild-logo"
        loading="eager"
        decoding="async"
        fetchpriority="high"
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
    <a href="{{ site.data.guild.guild_info.profile_url }}" target="_blank" rel="noopener noreferrer" class="btn-primary">
      <span>Raider.IO</span>
      <span aria-hidden="true">↗</span>
    </a>
    {% if site.data.socials.discord %}
    <a href="{{ site.data.socials.discord }}" target="_blank" rel="noopener noreferrer" class="btn-discord">
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
<svg viewBox="0 0 24 24">
		<path fill="currentColor" d="M12,7.09L14.45,8.58L13.8,5.77L16,3.89L13.11,3.64L12,1L10.87,3.64L8,3.89L10.18,5.77L9.5,8.58L12,7.09M4,13.09L6.45,14.58L5.8,11.77L8,9.89L5.11,9.64L4,7L2.87,9.64L0,9.89L2.18,11.77L1.5,14.58L4,13.09M20,10.09L22.45,11.58L21.8,8.77L24,6.89L21.11,6.64L20,4L18.87,6.64L16,6.89L18.18,8.77L17.5,11.58L20,10.09M15,23H9V10H15V23M7,23H1V17H7V23M23,23H17V13H23V23Z"></path>
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
  <svg viewBox="0 0 90 90" aria-hidden="true">
    <rect x="45.7" y="77.53" width="12.3" height="9.3" fill="currentColor" />
    <rect x="61.7" y="52.52" width="12.3" height="34.3" fill="currentColor" />
    <rect x="77.7" y="67.53" width="12.3" height="19.3" fill="currentColor" />
    <path fill="currentColor" d="M56.808 26.962c-.279 0-.557-.116-.755-.344-.362-.417-.318-1.048.099-1.411l16.956-14.747c.182-.158.415-.246.656-.246H89c.553 0 1 .448 1 1s-.447 1-1 1H74.138L57.464 26.717c-.19.165-.423.245-.656.245z"/>
    <path fill="currentColor" d="M89 5.665H74.101c-.553 0-1-.448-1-1s.447-1 1-1H89c.553 0 1 .448 1 1s-.447 1-1 1z"/>
    <path fill="currentColor" d="M16.236 71.271H1c-.552 0-1-.447-1-1s.448-1 1-1h14.862l16.673-14.502c.417-.361 1.049-.318 1.411.099.363.417.318 1.049-.098 1.411L16.893 71.025c-.183.159-.415.246-.657.246z"/>
    <path fill="currentColor" d="M15.899 77.821H1c-.552 0-1-.447-1-1s.448-1 1-1h14.899c.552 0 1 .447 1 1s-.448 1-1 1z"/>
    <path fill="currentColor" d="M59.433 28.98c-.758.659-1.692.982-2.623.982-1.118 0-2.229-.465-3.021-1.375-1.449-1.667-1.273-4.193.394-5.643L65.766 12.87c-5.129-4.157-11.527-6.81-18.529-7.271v30.675h30.675c-.435-6.605-2.818-12.674-6.576-17.647L59.433 28.98z"/>
    <path fill="currentColor" d="M42.844 40.668V5.599C25.669 6.731 12.087 21.011 12.087 38.471c0 8.668 3.352 16.549 8.823 22.432l9.656-8.399c1.667-1.447 4.193-1.273 5.643.394s1.274 4.193-.393 5.644l-8.706 7.572c5.161 3.355 11.315 5.31 17.929 5.31 4.488 0 8.763-.903 12.661-2.528V52.525v-4h4H74h2.42c.801-2.503 1.313-5.134 1.492-7.857H42.844z"/>
  </svg>
        </div>
        <div class="title-wrapper">
          <h2 class="section-title">Статистика складу</h2>
          <span class="subtitle">Фракції, броня, RIO та спеки</span>
        </div>
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
              <span class="donut-caption">сер. ilvl</span>
            </div>
          </div>

          <div class="stats-legend" id="armor-legend"></div>
        </div>
      </article>

      <article class="stats-card donut-card">
        <div class="stats-card-top">
          <div>
            <h3 class="stats-card-title">Середній RIO гільдії</h3>
            <p class="stats-card-subtitle">У центрі — середній Mythic+ рейтинг, по колу — співвідношення DPS, хілів і танків</p>
          </div>
        </div>

        <div class="donut-layout">
          <div class="donut-visual" id="rio-chart" aria-label="Середній RIO та розподіл ролей">
            <div class="donut-hole">
              <span class="donut-value" id="rio-total">0</span>
              <span class="donut-caption">сер. RIO</span>
            </div>
          </div>

          <div class="stats-legend" id="rio-legend"></div>
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
    <script src="{{ '/assets/js/guild-stats.js' | relative_url }}" defer></script>
    <script src="{{ '/assets/js/guild-roster-search.js' | relative_url }}" defer></script>
  </section>

  <section class="guild-section">
    <div class="modern-header">
      <div class="header-left">
        <div class="icon-box sword-glow">
<svg viewBox="0 0 24 24">
    	<path fill="currentColor" d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"></path>
	</svg>
        </div>
        <div class="title-wrapper">
          <h2 class="section-title">Склад Гільдії</h2>
          <span class="subtitle">Склад, професії та M+ рейтинг</span>
        </div>
      </div>
      
      <div class="stat-badge">
        <span class="stat-val">{{ site.data.guild.members | size }}</span>
        <span class="stat-label">Учасники</span>
      </div>
    </div>

    {% assign tanks = site.data.guild.members | where: "role", "TANK" %}
    {% assign healers = site.data.guild.members | where: "role", "HEALING" %}
    {% assign dps = site.data.guild.members | where: "role", "DPS" %}
    {% assign others = site.data.guild.members | where: "role", nil %}

    <div class="guild-tab-switcher" role="tablist" aria-label="Перемикач між складом, рейтингом і професіями">
      <button type="button" class="guild-tab-button is-active" id="guild-tab-button-roster" data-guild-tab-target="roster" role="tab" aria-selected="true" aria-controls="guild-tab-panel-roster">Склад</button>
      <button type="button" class="guild-tab-button" id="guild-tab-button-ranking" data-guild-tab-target="ranking" role="tab" aria-selected="false" aria-controls="guild-tab-panel-ranking">Рейтинг</button>
      <button type="button" class="guild-tab-button" id="guild-tab-button-professions" data-guild-tab-target="professions" role="tab" aria-selected="false" aria-controls="guild-tab-panel-professions">Професії</button>
    </div>

    <div class="guild-tab-panel is-active" id="guild-tab-panel-roster" data-guild-tab-panel="roster" role="tabpanel" aria-labelledby="guild-tab-button-roster">
      <div class="roster-tools" aria-label="Пошук по складу гільдії">
        <label class="roster-search" for="roster-search-input">
          <span class="roster-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 3a6.5 6.5 0 0 1 5.17 10.44l5.44 5.44a1 1 0 0 1-1.41 1.41l-5.44-5.44A6.5 6.5 0 1 1 9.5 3m0 2a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9"/></svg>
          </span>
          <input id="roster-search-input" class="roster-search-input" type="search" placeholder="Пошук по ніку" autocomplete="off" spellcheck="false" inputmode="search">
          <button type="button" class="roster-search-clear" id="roster-search-clear" aria-label="Очистити пошук" hidden>×</button>
        </label>
        <div class="roster-search-meta" id="roster-search-meta">Показано всіх: {{ site.data.guild.members | size }}</div>
      </div>

      <p class="roster-empty" id="roster-empty" hidden>Нічого не знайдено. Спробуй інший нік.</p>

      <div class="roster-layout" id="roster-layout">
        
        {% if tanks.size > 0 %}
        <div class="role-column">
          <div class="role-header tank-header">
            <span class="role-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z"></path></svg></span> Танки
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
            <span class="role-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M18 14H14V18H10V14H6V10H10V6H14V10H18"></path></svg></span> Хіли
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
            <span class="role-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.92,5H5L14,14L15,13.06M19.96,19.12L19.12,19.96C18.73,20.35 18.1,20.35 17.71,19.96L14.59,16.84L11.91,19.5L10.5,18.09L11.92,16.67L3,7.75V3H7.75L16.67,11.92L18.09,10.5L19.5,11.91L16.83,14.58L19.95,17.7C20.35,18.1 20.35,18.73 19.96,19.12Z"></path></svg></span> DPS
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
            <span class="role-icon" aria-hidden="true">?</span> Інші
          </div>
          <div class="member-grid">
            {% for char in others %}
              {% include member-card.html char=char %}
            {% endfor %}
          </div>
        </div>
        {% endif %}

      </div>
    </div>

    <div class="guild-tab-panel" id="guild-tab-panel-ranking" data-guild-tab-panel="ranking" role="tabpanel" aria-labelledby="guild-tab-button-ranking" hidden>
      <div class="ranking-panel-intro">
        <div>
          <div class="ranking-panel-title">Рейтинг Raider.IO</div>
          <p class="ranking-panel-description">Сортування за найвищим Mythic+ рейтингом персонажа серед доступних ролей.</p>
        </div>
        <div class="ranking-chip">M+ рейтинг</div>
      </div>

      <div class="roster-tools" aria-label="Пошук по рейтингу гільдії">
        <label class="roster-search" for="ranking-search-input">
          <span class="roster-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 3a6.5 6.5 0 0 1 5.17 10.44l5.44 5.44a1 1 0 0 1-1.41 1.41l-5.44-5.44A6.5 6.5 0 1 1 9.5 3m0 2a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9"/></svg>
          </span>
          <input id="ranking-search-input" class="roster-search-input" type="search" placeholder="Пошук по ніку, класу або ролі" autocomplete="off" spellcheck="false" inputmode="search">
          <button type="button" class="roster-search-clear" id="ranking-search-clear" aria-label="Очистити пошук" hidden>×</button>
        </label>
        <div class="roster-search-meta" id="ranking-search-meta">Позицій: {{ site.data.guild.members | size }}</div>
      </div>

      <p class="roster-empty" id="ranking-empty" hidden>Нічого не знайдено. Спробуй інший нік, клас або роль.</p>

      <div class="ranking-list" id="ranking-list">
        {% for char in site.data.guild.members %}
          {% include member-rating-card.html char=char %}
        {% endfor %}
      </div>
    </div>

    <div class="guild-tab-panel" id="guild-tab-panel-professions" data-guild-tab-panel="professions" role="tabpanel" aria-labelledby="guild-tab-button-professions" hidden>
      <div class="roster-tools" aria-label="Пошук по професіях гільдії">
        <label class="roster-search" for="profession-search-input">
          <span class="roster-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 3a6.5 6.5 0 0 1 5.17 10.44l5.44 5.44a1 1 0 0 1-1.41 1.41l-5.44-5.44A6.5 6.5 0 1 1 9.5 3m0 2a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9"/></svg>
          </span>
          <input id="profession-search-input" class="roster-search-input" type="search" placeholder="Пошук по професії або ніку" autocomplete="off" spellcheck="false" inputmode="search">
          <button type="button" class="roster-search-clear" id="profession-search-clear" aria-label="Очистити пошук" hidden>×</button>
        </label>
        <div class="roster-search-meta" id="profession-search-meta">Показано всіх: {{ site.data.professions.characters | size }}</div>
      </div>

      <p class="roster-empty" id="profession-empty" hidden>Нічого не знайдено. Спробуй іншу професію або нік.</p>

      <div class="profession-grid" id="profession-grid">
        {% for prof_char in site.data.professions.characters %}
          {% assign primary_professions = prof_char.professions.primaries %}
          {% assign cooking_profession = nil %}
          {% for secondary in prof_char.professions.secondaries %}
            {% if secondary.name == "Cooking" %}
              {% assign cooking_profession = secondary %}
            {% endif %}
          {% endfor %}
          {% assign has_any_profession = false %}
          {% if primary_professions and primary_professions.size > 0 %}
            {% assign has_any_profession = true %}
          {% endif %}
          {% if cooking_profession %}
            {% assign has_any_profession = true %}
          {% endif %}
          {% if has_any_profession %}
            {% capture profession_search_terms %}{{ prof_char.name }} {{ prof_char.realm }}{% for profession in primary_professions %} {{ profession.name }}{% endfor %}{% if cooking_profession %} {{ cooking_profession.name }}{% endif %}{% endcapture %}
            <a href="{{ prof_char.profile_url }}" target="_blank" rel="noopener noreferrer" class="profession-card" data-profession-search="{{ profession_search_terms | downcase | strip | escape }}">
              <div class="profession-card-head">
                <div>
                  <div class="profession-card-name">{{ prof_char.name }}</div>
                  <div class="profession-card-realm">EU-{{ prof_char.realm }}</div>
                </div>
              </div>
              {% if primary_professions and primary_professions.size > 0 %}
              <div class="profession-block">
                <div class="profession-block-title">Основні</div>
                <div class="profession-list">
                  {% for profession in primary_professions %}
                    <div class="profession-entry">
                      <div class="profession-entry-title-row">
                        <span class="profession-entry-name">{{ profession.name }}</span>
                      </div>
                      <div class="profession-tier-list">
                        {% for tier in profession.tiers %}
                          {% if tier.max_points and tier.max_points > 0 %}
                            {% assign progress = tier.learned_points | times: 100 | divided_by: tier.max_points %}
                            <div class="profession-tier-row">
                              <div class="profession-tier-top">
                                <span class="profession-tier-name">{{ tier.name }}</span>
                                <span class="profession-tier-value">{{ tier.learned_points }}/{{ tier.max_points }}</span>
                              </div>
                              <div class="profession-progress">
                                <span class="profession-progress-bar" style="width: {{ progress }}%"></span>
                              </div>
                            </div>
                          {% endif %}
                        {% endfor %}
                      </div>
                    </div>
                  {% endfor %}
                </div>
              </div>
              {% endif %}
              {% if cooking_profession %}
              <div class="profession-block">
                <div class="profession-block-title">Кулінарія</div>
                <div class="profession-list">
                  <div class="profession-entry">
                    <div class="profession-entry-title-row">
                      <span class="profession-entry-name">{{ cooking_profession.name }}</span>
                    </div>
                    <div class="profession-tier-list">
                      {% for tier in cooking_profession.tiers %}
                        {% if tier.max_points and tier.max_points > 0 %}
                          {% assign progress = tier.learned_points | times: 100 | divided_by: tier.max_points %}
                          <div class="profession-tier-row">
                            <div class="profession-tier-top">
                              <span class="profession-tier-name">{{ tier.name }}</span>
                              <span class="profession-tier-value">{{ tier.learned_points }}/{{ tier.max_points }}</span>
                            </div>
                            <div class="profession-progress">
                              <span class="profession-progress-bar" style="width: {{ progress }}%"></span>
                            </div>
                          </div>
                        {% endif %}
                      {% endfor %}
                    </div>
                  </div>
                </div>
              </div>
              {% endif %}
            </a>
          {% endif %}
        {% endfor %}
      </div>
    </div>
  </section>
</div>
