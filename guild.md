---
layout: default
title: Гільдія Mistblossom Vanguard
permalink: /guild/
description: "Сторінка гільдії Mistblossom Vanguard: склад, ранги, Raider.IO профілі, рейдовий прогрес, статистика ролей та професії учасників."
image: /assets/img/og-image-default.webp
tags: [Mistblossom Vanguard, Raider.IO, гільдія, World of Warcraft, рейди, професії]
extra_css:
  - /assets/css/guild.css
---

{% assign guild_root = site.data.guild %}
{% assign guild_meta = guild_root.metadata | default: empty %}
{% assign guild_info = guild_root.guild | default: empty %}
{% assign guild_members = guild_root.members | default: empty %}

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
      <span class="guild-logo-fallback faction-icon {{ guild_info.faction.type | downcase }}">
        {% if guild_info.faction.type == 'HORDE' %}🛡️{% else %}🦁{% endif %}
      </span>
    </div>

    <div class="guild-info">
      <div class="guild-eyebrow">Гільдія World of Warcraft</div>
      <h1 class="guild-name">{{ guild_info.name }}</h1>

      <div class="guild-meta">
        <span class="meta-tag">{{ guild_meta.region | upcase }}</span>
        <span class="meta-tag">{{ guild_info.realm.name }}</span>
        <span class="meta-tag faction-{{ guild_info.faction.type | downcase }}">
          {{ guild_info.faction.name }}
        </span>
        {% if guild_info.member_count %}
        <span class="meta-tag">{{ guild_info.member_count }} учасників</span>
        {% endif %}
      </div>

      <div class="guild-updated">
        <span class="updated-pill">Оновлено: {{ guild_meta.updated_at }}</span>
        {% if guild_meta.raider_io_last_crawled_at %}
        <span class="updated-pill">Оновлено за даними Raider.IO: {{ guild_meta.raider_io_last_crawled_at }}</span>
        {% endif %}
      </div>
    </div>
  </div>

  {% assign rio_url = guild_info.profile_url %}
  {% unless rio_url %}
    {% capture rio_url %}https://raider.io/guilds/{{ guild_meta.region }}/{{ guild_info.realm.slug }}/{{ guild_info.name | uri_escape }}{% endcapture %}
  {% endunless %}

  <div class="guild-actions">
    <a href="{{ rio_url }}" target="_blank" rel="noopener noreferrer" class="btn-primary">
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

<section class="guild-cta-strip">
  <div class="guild-cta-strip__copy">
    <span class="guild-cta-strip__eyebrow">Набір до гільдії</span>
    <h2>Хочеш приєднатися до Mistblossom Vanguard?</h2>
    <p>Заповни коротку заявку, а статус розгляду зможеш відстежувати на окремій сторінці без зайвих переходів.</p>
  </div>
  <div class="guild-cta-strip__actions">
    <a href="{{ '/guild/apply/' | relative_url }}" class="btn-apply btn-apply--large">Заповнити заявку</a>
  </div>
</section>

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
          <span class="subtitle">Поточний і минулі сезони</span>
        </div>
      </div>
      <div class="header-line"></div>
    </div>

    {% assign raid_meta = site.data.raids %}
    {% assign progression = guild_root.raid_progression %}

    {% comment %}
      Ручний список сезонів має пріоритет. Якщо його немає — беремо той,
      що update_guild.py вирахував із доповнень і дат відкриття рейдів.
    {% endcomment %}
    {% assign raid_seasons = raid_meta.seasons %}
    {% if raid_seasons == nil or raid_seasons.size == 0 %}
      {% assign raid_seasons = raid_meta.derived_seasons %}
    {% endif %}
    {% assign current_season_id = raid_meta.current_season | default: raid_meta.derived_current_season %}

    {% comment %} Які сезони мають хоч один вбитий бос — щоб не малювати порожні вкладки {% endcomment %}
    {% capture seasons_with_data %}{% for season in raid_seasons %}{% assign season_kills = 0 %}{% for slug in season.raids %}{% assign st = progression[slug] %}{% if st %}{% assign k = st.normal_bosses_killed | plus: st.heroic_bosses_killed | plus: st.mythic_bosses_killed %}{% assign season_kills = season_kills | plus: k %}{% endif %}{% endfor %}{% if season_kills > 0 %}|{{ season.id }}|{% endif %}{% endfor %}{% endcapture %}

    {% comment %} Слаги, які вже розписані по сезонах у _data/raids.yml {% endcomment %}
    {% capture known_slugs %}{% for season in raid_seasons %}{% for slug in season.raids %}|{{ slug }}|{% endfor %}{% endfor %}{% endcapture %}

    {% comment %} Рейди з нових тирів, яких ще немає в довіднику {% endcomment %}
    {% assign orphan_kills = 0 %}
    {% for raid in progression %}
      {% capture needle %}|{{ raid[0] }}|{% endcapture %}
      {% unless known_slugs contains needle %}
        {% assign ok = raid[1].normal_bosses_killed | plus: raid[1].heroic_bosses_killed | plus: raid[1].mythic_bosses_killed %}
        {% assign orphan_kills = orphan_kills | plus: ok %}
      {% endunless %}
    {% endfor %}

    {% capture current_needle %}|{{ current_season_id }}|{% endcapture %}

    {% assign visible_seasons = 0 %}
    {% for season in raid_seasons %}
      {% capture season_needle %}|{{ season.id }}|{% endcapture %}
      {% if seasons_with_data contains season_needle or season.id == current_season_id %}
        {% assign visible_seasons = visible_seasons | plus: 1 %}
      {% endif %}
    {% endfor %}
    {% if orphan_kills > 0 %}{% assign visible_seasons = visible_seasons | plus: 1 %}{% endif %}

    {% if progression and progression.size > 0 %}
    <div class="raid-seasons" id="raid-seasons">
      {% if visible_seasons > 1 %}
      <div class="season-switcher" role="tablist" aria-label="Перемикач сезонів">
        {% for season in raid_seasons %}
          {% capture season_needle %}|{{ season.id }}|{% endcapture %}
          {% if seasons_with_data contains season_needle or season.id == current_season_id %}
            {% assign is_current = false %}
            {% if season.id == current_season_id %}{% assign is_current = true %}{% endif %}
            <button type="button"
                    class="season-tab{% if is_current %} is-active{% endif %}"
                    id="season-tab-{{ season.id }}"
                    data-season-tab="{{ season.id }}"
                    role="tab"
                    aria-selected="{% if is_current %}true{% else %}false{% endif %}"
                    aria-controls="season-panel-{{ season.id }}">
              <span class="season-tab-label">{{ season.label }}</span>
              {% if is_current %}<span class="season-tab-flag">Актуальний</span>{% endif %}
            </button>
          {% endif %}
        {% endfor %}
        {% if orphan_kills > 0 %}
          <button type="button" class="season-tab" id="season-tab-other" data-season-tab="other" role="tab" aria-selected="false" aria-controls="season-panel-other">
            <span class="season-tab-label">Інші рейди</span>
          </button>
        {% endif %}
      </div>
      {% endif %}

      {% for season in raid_seasons %}
        {% capture season_needle %}|{{ season.id }}|{% endcapture %}
        {% if seasons_with_data contains season_needle or season.id == current_season_id %}

          {% assign is_current = false %}
          {% if season.id == current_season_id %}{% assign is_current = true %}{% endif %}

          {% assign s_total = 0 %}
          {% assign s_mythic = 0 %}
          {% assign s_heroic = 0 %}
          {% assign s_normal = 0 %}
          {% assign s_raids = 0 %}
          {% for slug in season.raids %}
            {% assign st = progression[slug] %}
            {% if st and st.total_bosses > 0 %}
              {% assign st_kills = st.normal_bosses_killed | plus: st.heroic_bosses_killed | plus: st.mythic_bosses_killed %}
              {% if st_kills > 0 %}
                {% assign s_raids = s_raids | plus: 1 %}
                {% assign s_total = s_total | plus: st.total_bosses %}
                {% assign s_mythic = s_mythic | plus: st.mythic_bosses_killed %}
                {% assign s_heroic = s_heroic | plus: st.heroic_bosses_killed %}
                {% assign s_normal = s_normal | plus: st.normal_bosses_killed %}
              {% endif %}
            {% endif %}
          {% endfor %}

          <div class="season-panel{% if is_current %} is-active{% endif %}"
               id="season-panel-{{ season.id }}"
               data-season-panel="{{ season.id }}"
               role="tabpanel"
               aria-labelledby="season-tab-{{ season.id }}"
               {% unless is_current %}hidden{% endunless %}>

            {% if s_raids > 0 %}
            <div class="season-summary">
              <div class="season-summary-head">
                <span class="season-summary-title">{{ season.label }}</span>
                {% if is_current %}<span class="season-badge is-current">Актуальний сезон</span>{% else %}<span class="season-badge">Завершений сезон</span>{% endif %}
              </div>
              <div class="season-summary-stats">
                <span class="season-stat is-mythic"><b>{{ s_mythic }}/{{ s_total }}</b> M</span>
                <span class="season-stat is-heroic"><b>{{ s_heroic }}/{{ s_total }}</b> H</span>
                <span class="season-stat is-normal"><b>{{ s_normal }}/{{ s_total }}</b> N</span>
              </div>
            </div>
            {% endif %}

            <div class="raid-grid">
              {% for slug in season.raids %}
                {% assign stats = progression[slug] %}
                {% if stats and stats.total_bosses > 0 %}
                  {% assign raid_kills = stats.normal_bosses_killed | plus: stats.heroic_bosses_killed | plus: stats.mythic_bosses_killed %}
                  {% if raid_kills > 0 %}
                    {% comment %} Jekyll не приймає [..] у параметрах include — виносимо в assign {% endcomment %}
                    {% assign raid_ranks = guild_root.raid_rankings[slug] %}
                    {% include raid-card.html slug=slug stats=stats rankings=raid_ranks %}
                  {% endif %}
                {% endif %}
              {% endfor %}

              {% if s_raids == 0 %}
              <div class="raid-card placeholder-card">
                <div class="placeholder-icon">💤</div>
                <h3 class="raid-title">Прогресу в цьому сезоні ще немає</h3>
                <p class="placeholder-text">{% if is_current %}Гільдія ще не має вбитих босів у поточному сезоні.{% else %}За цей сезон дані не збереглися.{% endif %}</p>
              </div>
              {% endif %}
            </div>
          </div>
        {% endif %}
      {% endfor %}

      {% if orphan_kills > 0 %}
      <div class="season-panel" id="season-panel-other" data-season-panel="other" role="tabpanel" aria-labelledby="season-tab-other" hidden>
        <div class="raid-grid">
          {% for raid in progression %}
            {% capture needle %}|{{ raid[0] }}|{% endcapture %}
            {% unless known_slugs contains needle %}
              {% assign orphan_slug = raid[0] %}
              {% assign stats = raid[1] %}
              {% assign raid_kills = stats.normal_bosses_killed | plus: stats.heroic_bosses_killed | plus: stats.mythic_bosses_killed %}
              {% if stats.total_bosses > 0 and raid_kills > 0 %}
                {% assign raid_ranks = guild_root.raid_rankings[orphan_slug] %}
                {% include raid-card.html slug=orphan_slug stats=stats rankings=raid_ranks fallback_subtitle="Сезон ще не вказано в _data/raids.yml" %}
              {% endif %}
            {% endunless %}
          {% endfor %}
        </div>
      </div>
      {% endif %}
    </div>
    {% else %}
    <div class="raid-grid">
      <div class="raid-card placeholder-card">
        <div class="placeholder-icon">📜</div>
        <h3 class="raid-title">Рейдовий прогрес з’явиться трохи пізніше</h3>
        <p class="placeholder-text">Щойно з’являться свіжі дані, тут буде видно прогрес по рейдах.</p>
      </div>
    </div>
    {% endif %}

    <script src="{{ '/assets/js/raid-seasons.js' | relative_url }}" defer></script>
  </section>

  <section class="guild-section guild-stats-section">
    <div class="modern-header">
      <div class="header-left">
        <div class="icon-box chart-glow">
  <svg viewBox="0 0 90 90" aria-hidden="true">
    <rect x="45.7" y="77.53" width="12.3" height="9.3" fill="currentColor" />
    <rect x="24.02" y="47.29" width="12.3" height="39.54" fill="currentColor" />
    <rect x="67.38" y="56.85" width="12.3" height="29.98" fill="currentColor" />
    <path fill="currentColor" d="M82.49,17.13H57.15a1.54,1.54,0,0,0,0,3.07H78.79L53.06,45.93l-14.9-14.9A1.53,1.53,0,0,0,36,31L9.57,57.46A1.54,1.54,0,0,0,11.74,59.63L37.08,34.29,52,49.19a1.53,1.53,0,0,0,2.17,0L81,22.37V44a1.54,1.54,0,0,0,3.07,0V18.67A1.54,1.54,0,0,0,82.49,17.13Z"/>
  </svg>
        </div>
        <div class="title-wrapper">
          <h2 class="section-title">Статистика складу</h2>
          <span class="subtitle">Фракції, броня, RIO та спеки</span>
        </div>
      </div>
      <div class="header-line"></div>
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

    <script id="guild-members-json" type="application/json" data-region="{{ guild_meta.region | escape }}">{{ guild_members | jsonify }}</script>
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
          <span class="subtitle">Відсортовано за рейтингом Raider.IO M+</span>
        </div>
      </div>

      <div class="stat-badge">
        <span class="stat-val">{{ guild_members | size }}</span>
        <span class="stat-label">Учасники</span>
      </div>
    </div>

    {% assign scored = guild_members | where_exp: "m", "m.character.mythic_plus_scores.all.score" %}
    {% assign unscored = guild_members | where_exp: "m", "m.character.mythic_plus_scores.all.score == nil" %}
    {% assign roster = scored | sort: "character.mythic_plus_scores.all.score" | reverse | concat: unscored %}

    {% if roster.size > 0 %}
    <div class="roster-tools" aria-label="Пошук по складу гільдії">
      <label class="roster-search" for="roster-search-input">
        <span class="roster-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 3a6.5 6.5 0 0 1 5.17 10.44l5.44 5.44a1 1 0 0 1-1.41 1.41l-5.44-5.44A6.5 6.5 0 1 1 9.5 3m0 2a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9"/></svg>
        </span>
        <input id="roster-search-input" class="roster-search-input" type="search" placeholder="Пошук по ніку, класу або ролі" autocomplete="off" spellcheck="false" inputmode="search">
        <button type="button" class="roster-search-clear" id="roster-search-clear" aria-label="Очистити пошук" hidden>×</button>
      </label>
      <div class="roster-search-meta" id="roster-search-meta">Показано всіх: {{ roster | size }}</div>
    </div>

    <p class="roster-empty" id="roster-empty" hidden>Нічого не знайдено. Спробуй інший нік, клас або роль.</p>

    <div class="roster-table-wrap">
      <table class="roster-table" id="roster-table">
        <caption class="visually-hidden">Склад гільдії, відсортований за рейтингом Raider.IO Mythic+</caption>
        <thead>
          <tr>
            <th scope="col" class="rr-pos">#</th>
            <th scope="col" class="rr-char">Персонаж</th>
            <th scope="col" class="rr-spec">Клас / спек</th>
            <th scope="col" class="rr-role">Роль</th>
            <th scope="col" class="rr-ilvl">ilvl</th>
            <th scope="col" class="rr-rio">M+ <span class="rr-sort-arrow" aria-hidden="true">↓</span></th>
          </tr>
        </thead>
        <tbody id="roster-body">
          {% for char in roster %}
            {% include roster-row.html char=char position=forloop.index %}
          {% endfor %}
        </tbody>
      </table>
    </div>

    <div class="roster-more" id="roster-more" hidden>
      <button type="button" class="roster-more-button" id="roster-more-button">Показати ще</button>
      <span class="roster-more-note" id="roster-more-note"></span>
    </div>
    {% else %}
    <div class="empty-state-wow" style="margin-top: 8px;">
      <div class="empty-icon-glow">👥</div>
      <h2>Склад гільдії скоро з’явиться</h2>
      <p>Ми ще оновлюємо склад гільдії. Завітай трохи пізніше — тут з’явиться повний список учасників.</p>
    </div>
    {% endif %}
  </section>
</div>
